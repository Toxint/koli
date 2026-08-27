/**
 * Applique a Supabase les migrations qui lui manquent.
 *
 * `preparer-supabase.mjs` ne sert qu'a la MISE EN ROUTE : il refuse une base
 * deja peuplee, et c'est exactement ce qu'on veut d'un script dont l'option
 * `--ecraser` supprime le schema public. Une fois le site en ligne, il faut
 * autre chose — d'ou ce fichier.
 *
 * Pourquoi pas `prisma migrate deploy` : il exige la connexion DIRECTE, port
 * 5432, que le reseau de cette machine coupe. On applique donc les fichiers
 * nous-memes par le pooler, chacun d'un seul envoi — donc dans une seule
 * transaction implicite : un fichier passe entierement ou pas du tout.
 *
 * Le journal `_prisma_migrations` est tenu a la main avec l'empreinte SHA-256
 * exacte que Prisma aurait calculee, sans quoi il declarerait la migration
 * alteree au passage suivant.
 *
 * Par defaut, ce script NE FAIT RIEN : il annonce ce qui manque. Ecrire sur la
 * base d'un site en service demande un ordre explicite.
 *
 * Usage :
 *   node scripts/migrer-supabase.mjs              (etat, sans rien changer)
 *   node scripts/migrer-supabase.mjs --appliquer
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { chargerEnv } from "./env.mjs";

// `.env` SEUL : `.env.local` designe la base locale, qui n'a rien a voir ici.
chargerEnv(".env");

const RACINE = "prisma/migrations";
const APPLIQUER = process.argv.includes("--appliquer");

const ok = (m) => console.log(`   ✓ ${m}`);
const info = (m) => console.log(`   · ${m}`);
const arreter = (m, aide = "") => {
  console.error(`   ✗ ${m}`);
  if (aide) console.error(`\n   ${aide}`);
  process.exit(1);
};

const url = process.env.DATABASE_URL ?? "";

if (!url.startsWith("postgresql://") || /localhost|127\.0\.0\.1/.test(url)) {
  arreter(
    "DATABASE_URL de .env ne designe pas la base Supabase.",
    "Ce script s'adresse a la base EN LIGNE. Pour la base locale :\n" +
      "   npx prisma migrate deploy"
  );
}

const libpq = (u) =>
  u.includes("uselibpqcompat") ? u : u + (u.includes("?") ? "&" : "?") + "uselibpqcompat=true";

console.log("\n=== MIGRATIONS SUPABASE ===\n");

const client = new pg.Client({
  connectionString: libpq(url),
  connectionTimeoutMillis: 20_000,
});

await client.connect();

try {
  await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    id                  VARCHAR(36) PRIMARY KEY NOT NULL,
    checksum            VARCHAR(64) NOT NULL,
    finished_at         TIMESTAMPTZ,
    migration_name      VARCHAR(255) NOT NULL,
    logs                TEXT,
    rolled_back_at      TIMESTAMPTZ,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_steps_count INTEGER NOT NULL DEFAULT 0
  )`);

  const surDisque = fs
    .readdirSync(RACINE, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const { rows } = await client.query(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
  );
  const deja = new Set(rows.map((r) => r.migration_name));

  const manquantes = surDisque.filter((n) => !deja.has(n));

  console.log(`   ${surDisque.length} migration(s) au depot, ${deja.size} appliquee(s)\n`);

  if (manquantes.length === 0) {
    ok("la base en ligne est a jour");
    process.exit(0);
  }

  for (const nom of manquantes) console.log(`   ! manquante : ${nom}`);

  if (!APPLIQUER) {
    console.log("");
    info("Rien n'a ete modifie.");
    console.log("\n   Pour appliquer : npm run supabase:migrer -- --appliquer\n");
    process.exit(0);
  }

  console.log("");

  for (const nom of manquantes) {
    const fichier = path.join(RACINE, nom, "migration.sql");

    if (!fs.existsSync(fichier)) {
      arreter(`${nom} n'a pas de migration.sql.`);
    }

    const sql = fs.readFileSync(fichier, "utf8");

    // D'un seul envoi : le fichier entier forme une transaction implicite.
    await client.query(sql);

    await client.query(
      `INSERT INTO "_prisma_migrations"
         (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
       VALUES ($1, $2, $3, now(), now(), 1)`,
      [crypto.randomUUID(), crypto.createHash("sha256").update(sql).digest("hex"), nom]
    );

    ok(`${nom} appliquee`);
  }

  console.log("");
  ok(`${manquantes.length} migration(s) appliquee(s) a la base en ligne`);
  console.log("\n   Redeployez pour que le site utilise le nouveau schema :");
  console.log("   npm run vercel:redeployer\n");
} finally {
  await client.end();
}
