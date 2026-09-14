/**
 * Change l'ADRESSE du compte administrateur, sur la base EN LIGNE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Cette adresse n'est pas un détail de profil : c'est par elle qu'on se   │
 * │  CONNECTE, et c'est elle qui reçoit « un vendeur demande un versement ». │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le compte en ligne portait `admin@koli.ci`. Or `koli.ci` est sur la liste des
 * adresses de DÉMONSTRATION que le canal de courriel écarte exprès (§8) : l'avis
 * de demande de versement ne serait jamais parti, et rien ne l'aurait dit. Le
 * remède n'est pas de contourner le filtre — cette liste protège la réputation
 * d'envoi pendant les campagnes — mais de poser une vraie adresse.
 *
 * ── Ce qu'il vérifie AVANT d'écrire ─────────────────────────────────────────
 *
 * · qu'il n'y a qu'UN administrateur à changer — sinon on ne saurait pas lequel ;
 * · que la nouvelle adresse n'est pas une adresse de démonstration, sans quoi
 *   on aurait remplacé un silence par un autre ;
 * · qu'aucun autre compte ne la porte déjà : l'adresse sert d'identifiant de
 *   connexion, et deux comptes qui la partagent rendraient la connexion
 *   ambiguë.
 *
 * ── Et ce qu'il remet à zéro ────────────────────────────────────────────────
 *
 * `emailBouncedAt`. Une adresse fermée après rebond ne reçoit plus rien (§8) ;
 * garder ce drapeau sur une adresse NEUVE la condamnerait avant son premier
 * courriel, et le registre dirait « adresse fermee apres rebond » d'une adresse
 * qui n'a jamais rien reçu.
 *
 * Usage :
 *   npm run admin:adresse -- koli@premiummarketafrica.com                # montre
 *   npm run admin:adresse -- koli@premiummarketafrica.com --appliquer    # écrit
 */

import { chargerEnv } from "./env.mjs";

/* `.env` SEUL : c'est la base EN LIGNE qu'on modifie, comme `admin:motdepasse`
   et `nettoyer-registre.mjs`. Lire `.env.local` changerait le compte du poste
   en croyant changer celui de la production. */
chargerEnv(".env");

const { Pool } = await import("pg");

/* Recopiée de `lib/notifications/textes.ts`, pas importée : ce script tourne
   hors du bundle Next, et un import de TypeScript compilé y traînerait toute
   l'application. Si la liste change là-bas, ce contrôle devient trop laxiste —
   jamais trop strict, donc le défaut penche du bon côté. */
const DOMAINES_FICTIFS = ["koli.ci", "exemple.ci", "example.com", "test.local"];

const arguments_ = process.argv.slice(2);
const appliquer = arguments_.includes("--appliquer");
const adresse = (arguments_.find((a) => !a.startsWith("--")) ?? "").trim().toLowerCase();

if (!adresse || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse)) {
  console.error(
    "\nIl faut une adresse : npm run admin:adresse -- quelqu-un@domaine.com\n"
  );
  process.exit(1);
}

const domaine = adresse.split("@")[1];
if (DOMAINES_FICTIFS.includes(domaine)) {
  console.error(
    `\n« ${domaine} » est un domaine de DEMONSTRATION : le canal de courriel l'ecarte.\n` +
      `Poser cette adresse reviendrait a remplacer un silence par un autre.\n`
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

try {
  const admins = await q(
    `SELECT id, name, email, phone, "emailBouncedAt" FROM "User" WHERE role = 'ADMIN'`
  );

  if (admins.length === 0) {
    console.error("\nAucun compte administrateur en ligne.\n");
    process.exit(1);
  }
  if (admins.length > 1) {
    console.error(
      `\n${admins.length} administrateurs : ce script ne sait pas lequel changer.\n`
    );
    process.exit(1);
  }

  const [admin] = admins;
  const occupee = await q(`SELECT id FROM "User" WHERE lower(email) = $1 AND id <> $2`, [
    adresse,
    admin.id,
  ]);

  console.log(`\n=== Compte administrateur ===\n`);
  console.log(`  nom       : ${admin.name}`);
  console.log(`  telephone : ${admin.phone}`);
  console.log(`  adresse   : ${admin.email ?? "(aucune)"}  →  ${adresse}`);
  console.log(
    `  rebond    : ${admin.emailBouncedAt ? "oui — sera remis a zero" : "aucun"}\n`
  );

  if (occupee.length > 0) {
    console.error(
      "Cette adresse est deja portee par un autre compte : elle sert d'identifiant\n" +
        "de connexion, et deux comptes qui la partagent rendraient la connexion ambigue.\n"
    );
    process.exit(1);
  }

  if (!appliquer) {
    console.log("  Rien n'est ecrit. Pour appliquer :");
    console.log(`    npm run admin:adresse -- ${adresse} --appliquer\n`);
    console.log("  ⚠ Apres ce changement, on se connecte avec la NOUVELLE adresse");
    console.log("    (ou avec le numero de telephone). Le mot de passe ne change pas.\n");
    process.exit(0);
  }

  const changes = await q(
    `UPDATE "User" SET email = $1, "emailBouncedAt" = NULL WHERE id = $2 RETURNING id, email`,
    [adresse, admin.id]
  );

  if (changes.length !== 1) {
    console.error("\nRien n'a ete ecrit.\n");
    process.exit(1);
  }

  /* Verification par l'EFFET : on relit, on ne suppose pas. */
  const [relu] = await q(
    `SELECT email, "emailBouncedAt" FROM "User" WHERE id = $1`,
    [admin.id]
  );
  console.log(`  ✓ adresse posee et relue : ${relu.email}`);
  console.log(
    `  ✓ drapeau de rebond : ${relu.emailBouncedAt ? "TOUJOURS LA (anormal)" : "aucun"}`
  );
  console.log(
    `\n  Connexion : /connexion avec ${relu.email} — ou le numero ${admin.phone}.\n`
  );
} finally {
  await pool.end();
}
