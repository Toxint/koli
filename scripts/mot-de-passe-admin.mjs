/**
 * Change le mot de passe de l'administrateur sur la base EN LIGNE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Ce compte ouvre l'administration : litiges, remboursements, commission, │
 * │  suspension de comptes. C'est le mot de passe le plus sensible du        │
 * │  système.                                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ── Pourquoi un script, et pas une requête à la main ────────────────────────
 *
 * Parce qu'un mot de passe se HACHE. Écrire une chaîne en clair dans
 * `passwordHash` produirait un compte dont personne ne peut plus entrer — et
 * l'erreur ne se verrait qu'à la prochaine tentative de connexion, sans rien
 * pour l'expliquer. On réutilise donc `bcrypt` avec le MÊME coût que
 * l'application (10), lu dans `lib/auth/password.ts` plutôt que recopié de
 * mémoire.
 *
 * ── Deux façons de s'en servir ──────────────────────────────────────────────
 *
 *   npm run admin:motdepasse
 *       Tire un mot de passe au sort, l'applique, et l'affiche UNE FOIS.
 *
 *   ADMIN_PASSWORD="votre choix" npm run admin:motdepasse
 *       Applique celui que vous avez choisi. Il ne s'affiche pas.
 *
 * La seconde forme passe par une variable d'environnement et non par un
 * argument : un argument figure dans la liste des processus et dans
 * l'historique du shell, une variable non.
 *
 * ⚠ Douze caractères au minimum, même règle que `prisma/amorce.ts`. Un mot de
 * passe d'administrateur court est un mot de passe public à brève échéance.
 */

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { chargerEnv } from "./env.mjs";

/*
 * `.env` SEUL : c'est la base en ligne. `.env.local` désigne le poste, et
 * changer le mot de passe de l'un en croyant changer celui de l'autre laisserait
 * la production ouverte avec l'ancien — sans que rien ne le signale.
 */
chargerEnv(".env");

const { Pool } = await import("pg");

const COURRIEL = process.env.ADMIN_EMAIL?.trim() || "admin@koli.ci";
const LONGUEUR_MINIMALE = 12;

const choisi = process.env.ADMIN_PASSWORD?.trim();
const tireAuSort = !choisi;

if (choisi && choisi.length < LONGUEUR_MINIMALE) {
  console.log(
    `\n  Ce mot de passe fait ${choisi.length} caracteres. Minimum ${LONGUEUR_MINIMALE}.\n`
  );
  process.exit(2);
}

// 18 octets en base64url : 24 caracteres, sans rien qui demande d'etre echappe
// quand on le colle dans un formulaire ou un gestionnaire de mots de passe.
const motDePasse = choisi ?? randomBytes(18).toString("base64url");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

const existant = (
  await pool.query(`SELECT id, name, status FROM "User" WHERE email = $1 AND role = 'ADMIN'`, [
    COURRIEL,
  ])
).rows[0];

if (!existant) {
  console.log(`\n  Aucun administrateur avec l'adresse ${COURRIEL}.`);
  console.log(`  Les comptes existants :\n`);
  for (const r of (await pool.query(`SELECT email, role FROM "User" ORDER BY role`)).rows) {
    console.log(`    ${r.role.padEnd(8)} ${r.email ?? "(sans courriel)"}`);
  }
  console.log("");
  await pool.end();
  process.exit(2);
}

// Le meme cout que `lib/auth/password.ts`. Le lire la-bas plutot que le
// recopier eviterait cette note ; a defaut, elle sert d'avertissement : si le
// cout change dans l'application, il doit changer ici aussi.
const empreinte = await bcrypt.hash(motDePasse, 10);

await pool.query(`UPDATE "User" SET "passwordHash" = $1 WHERE id = $2`, [
  empreinte,
  existant.id,
]);

// On VERIFIE que le nouveau mot de passe ouvre bien le compte. Sans cela, une
// erreur de hachage produirait un administrateur enferme dehors, et on ne
// l'apprendrait qu'a la prochaine connexion.
const relu = (
  await pool.query(`SELECT "passwordHash" FROM "User" WHERE id = $1`, [existant.id])
).rows[0];
const ouvre = await bcrypt.compare(motDePasse, relu.passwordHash);

await pool.end();

if (!ouvre) {
  console.log("\n  ECHEC : le mot de passe pose ne rouvre pas le compte.\n");
  process.exit(1);
}

console.log("\n=== MOT DE PASSE ADMINISTRATEUR CHANGE ===\n");
console.log(`  compte   : ${COURRIEL}`);
console.log(`  etat     : ${existant.status}`);
console.log(`  verifie  : le nouveau mot de passe rouvre bien le compte`);

if (tireAuSort) {
  console.log(`\n  MOT DE PASSE : ${motDePasse}`);
  console.log(`\n  Il n'est enregistre nulle part ailleurs. Copiez-le maintenant.`);
} else {
  console.log(`\n  Le mot de passe que vous avez fourni est en place.`);
}

console.log(`\n  Ou se connecter :`);
console.log(`    https://koli-zeta.vercel.app/connexion     (le site)`);
console.log(`    https://koli-essai.vercel.app/connexion    (le site d'essai)`);
console.log(`\n  Les deux partagent la meme base : le compte est le meme.`);
console.log(`  Apres connexion, l'administration est sur /admin/dashboard.\n`);
