/**
 * Retire le mot de passe connu des comptes de demonstration, EN LIGNE.
 *
 * Le jeu de donnees cree cinq comptes avec le meme mot de passe, `Password123!`,
 * ecrit en clair dans ce depot. C est ce qu il faut en developpement : un test
 * qui doit deviner un mot de passe ne teste plus rien.
 *
 * Sur un site accessible publiquement, c est une porte ouverte — et l un de ces
 * comptes est ADMINISTRATEUR. Quiconque lit le depot, ou se souvient d un
 * identifiant de demonstration courant, entre.
 *
 * Ce script tire un mot de passe au sort pour chacun, le hache comme
 * l application le fait (bcrypt, cout 10) et l ecrit en base. Les mots de passe
 * sont deposes dans un FICHIER LOCAL ignore par git — pas affiches a l ecran :
 * une sortie de terminal se retrouve dans un historique, une capture, un
 * copier-coller.
 *
 * Il vise SUPABASE, jamais la base locale : en developpement, un mot de passe
 * connu est un outil.
 *
 * Usage : node scripts/securiser-demonstration.mjs
 */

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import pg from "pg";
import { chargerEnv } from "./env.mjs";

// `.env` SEUL. `.env.local` designe la base de developpement, ou les mots de
// passe connus doivent le rester.
chargerEnv(".env");

const COMPTES = [
  "admin@koli.ci",
  "vendeur@koli.ci",
  "vendeur2@koli.ci",
  "client@koli.ci",
  "livreur@koli.ci",
];

const SORTIE = path.join(".donnees", "comptes-supabase.txt");

const ok = (m) => console.log(`   ✓ ${m}`);
const arreter = (m, aide = "") => {
  console.error(`   ✗ ${m}`);
  if (aide) console.error(`\n   ${aide}`);
  process.exitCode = 1;
  throw new SortieAttendue();
};
class SortieAttendue extends Error {}

/**
 * Un mot de passe solide ET saisissable au telephone.
 *
 * L alphabet ecarte ce qui se confond a l ecran (0/O, 1/l/I) : ces comptes
 * seront recopies a la main sur un clavier de telephone, et un caractere mal
 * lu se traduit par un echec de connexion qu on met dix minutes a comprendre.
 * Vingt caracteres compensent largement l alphabet reduit.
 */
function motDePasse() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const octets = randomBytes(20);
  return [...octets].map((o) => alphabet[o % alphabet.length]).join("");
}

const libpq = (url) =>
  url.includes("uselibpqcompat")
    ? url
    : url + (url.includes("?") ? "&" : "?") + "uselibpqcompat=true";

async function main() {
  console.log("\n=== COMPTES DE DEMONSTRATION EN LIGNE ===\n");

  const url = process.env.DATABASE_URL;

  if (!url) {
    arreter(
      "DATABASE_URL manquant dans .env.",
      "Ce script vise la base Supabase, pas la base locale."
    );
  }

  if (url.includes("localhost") || url.includes("127.0.0.1")) {
    arreter(
      "DATABASE_URL designe une base LOCALE.",
      "Ce script ne s applique qu a la base en ligne : en developpement, un mot\n" +
        "   de passe connu est un outil, pas un defaut."
    );
  }

  const client = new pg.Client({
    connectionString: libpq(url),
    connectionTimeoutMillis: 15_000,
  });

  await client.connect();

  try {
    const { rows } = await client.query(
      `SELECT email, role FROM "User" WHERE email = ANY($1::text[]) ORDER BY role`,
      [COMPTES]
    );

    if (rows.length === 0) {
      ok("aucun compte de demonstration en base — rien a faire");
      return;
    }

    const nouveaux = [];

    for (const { email, role } of rows) {
      const clair = motDePasse();
      const hache = await bcrypt.hash(clair, 10);

      await client.query(`UPDATE "User" SET "passwordHash" = $1 WHERE email = $2`, [
        hache,
        email,
      ]);

      nouveaux.push({ email, role, clair });
      ok(`${email} (${role}) — mot de passe remplace`);
    }

    fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
    fs.writeFileSync(
      SORTIE,
      [
        "Comptes de demonstration — base SUPABASE",
        `Genere le ${new Date().toISOString()}`,
        "",
        "Ce fichier est ignore par git. Rangez-le ailleurs, puis supprimez-le.",
        "Ces mots de passe ne sont ecrits NULLE PART ailleurs : perdus, ils sont",
        "perdus, et il faudra relancer ce script.",
        "",
        ...nouveaux.map((c) => `${c.role.padEnd(8)} ${c.email.padEnd(22)} ${c.clair}`),
        "",
      ].join("\n"),
      { encoding: "utf8", mode: 0o600 }
    );

    console.log("");
    ok(`${nouveaux.length} compte(s) traite(s)`);
    console.log(`\n   Les nouveaux mots de passe sont dans : ${SORTIE}`);
    console.log("   Ils ne sont volontairement pas affiches ici : une sortie de");
    console.log("   terminal se retrouve dans un historique ou une capture.\n");
  } finally {
    await client.end();
  }
}

try {
  await main();
} catch (e) {
  if (!(e instanceof SortieAttendue)) {
    console.error(`   ✗ ${e.message}`);
    process.exitCode = 1;
  }
}
