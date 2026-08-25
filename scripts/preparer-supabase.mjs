/**
 * Met KOLI en route sur Supabase, d un seul geste.
 *
 * Enchaine ce qui doit l etre, dans l ordre, en s arretant au premier echec :
 * verification de la connexion, migrations, jeu de donnees, controle du schema.
 *
 * Existe parce que cette sequence comporte des pieges qui ne se voient qu apres
 * coup — le pooler qui refuse les instructions de schema, `sslmode` absent, une
 * base deja peuplee qu on ecraserait. Chacun est verifie AVANT d agir plutot
 * que diagnostique apres.
 *
 * Usage : node scripts/preparer-supabase.mjs
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import pg from "pg";

const etape = (n, titre) => console.log(`\n── ${n}. ${titre}`);
const ok = (m) => console.log(`   ✓ ${m}`);
const arreter = (m, aide = "") => {
  console.error(`   ✗ ${m}`);
  if (aide) console.error(`\n   ${aide}`);
  process.exit(1);
};

// ═══════════ 1. Les deux adresses sont-elles la ?
etape(1, "Configuration");

// `.env` n est pas charge automatiquement dans un script Node : on le lit.
if (fs.existsSync(".env")) {
  for (const ligne of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const valeur = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = valeur;
  }
}

const POOLER = process.env.DATABASE_URL ?? "";
const DIRECT = process.env.DIRECT_URL ?? "";

if (!POOLER.startsWith("postgresql://")) {
  arreter(
    "DATABASE_URL ne designe pas une base PostgreSQL.",
    "Renseignez les deux lignes dans .env — voir .env.example."
  );
}

if (!DIRECT.startsWith("postgresql://")) {
  arreter(
    "DIRECT_URL manquant.",
    "Les migrations en ont besoin : le pooler en mode transaction ne sait pas\n" +
      "   executer les instructions de definition de schema."
  );
}

// Piege classique : les deux lignes copiees a la suite, donc identiques.
if (POOLER === DIRECT) {
  arreter(
    "DATABASE_URL et DIRECT_URL sont identiques.",
    "Elles doivent differer par le port : 6543 pour le pooler, 5432 en direct."
  );
}

if (POOLER.includes("MOTDEPASSE") || DIRECT.includes("[")) {
  arreter(
    "Le mot de passe n a pas ete remplace dans .env.",
    "Remplacez [MOT-DE-PASSE] par celui choisi a la creation du projet."
  );
}

ok(`pooler  : ${POOLER.replace(/:[^:@]+@/, ":****@").slice(0, 70)}…`);
ok(`direct  : ${DIRECT.replace(/:[^:@]+@/, ":****@").slice(0, 70)}…`);

// ═══════════ 2. La base repond-elle ?
etape(2, "Connexion");

const client = new pg.Client({ connectionString: DIRECT });

try {
  await client.connect();
  const { rows } = await client.query("SELECT version()");
  ok(rows[0].version.split(" ").slice(0, 2).join(" "));
} catch (e) {
  arreter(
    `Connexion impossible : ${e.message}`,
    "Verifiez le mot de passe, et que l adresse se termine par ?sslmode=require."
  );
}

// ═══════════ 3. La base est-elle vide ?
etape(3, "Etat de la base");

const { rows: tables } = await client.query(
  `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
);

const existantes = tables.map((t) => t.tablename).filter((t) => t !== "_prisma_migrations");

if (existantes.length > 0) {
  // On ne detruit RIEN sans un ordre explicite. Une base deja peuplee peut
  // contenir de vraies commandes.
  console.log(`   ! ${existantes.length} table(s) deja presente(s)`);
  if (process.argv.includes("--ecraser")) {
    console.log("   ! --ecraser demande : suppression du schema public");
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    ok("schema remis a zero");
  } else {
    await client.end();
    arreter(
      "La base n est pas vide.",
      "Relancez avec --ecraser SI et SEULEMENT SI ces donnees sont jetables."
    );
  }
} else {
  ok("base vide, prete a recevoir le schema");
}

await client.end();

// ═══════════ 4. Migrations
etape(4, "Migrations");

try {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
  ok("schema applique");
} catch {
  arreter("Les migrations ont echoue.");
}

// ═══════════ 5. Jeu de donnees
etape(5, "Jeu de donnees de demonstration");

try {
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
  ok("comptes et commandes de demonstration crees");
} catch {
  arreter("Le jeu de donnees a echoue.");
}

// ═══════════ 6. Controle final
etape(6, "Integrite du schema");

const verif = new pg.Client({ connectionString: DIRECT });
await verif.connect();

const { rows: compte } = await verif.query(
  `SELECT
     (SELECT COUNT(*) FROM pg_tables WHERE schemaname='public') AS tables,
     (SELECT COUNT(*) FROM "User") AS utilisateurs,
     (SELECT COUNT(*) FROM "Order") AS commandes`
);

const c = compte[0];
ok(`${c.tables} tables · ${c.utilisateurs} comptes · ${c.commandes} commandes`);

if (Number(c.utilisateurs) === 0) {
  await verif.end();
  arreter("Aucun compte cree : le jeu de donnees n a pas abouti.");
}

await verif.end();

console.log("\nKOLI est en place sur Supabase.");
console.log("Etape suivante : npm run verif:tout\n");
