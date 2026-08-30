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
 *         node scripts/preparer-supabase.mjs --ecraser        (base non vide)
 *         node scripts/preparer-supabase.mjs --par-le-pooler  (port 5432 filtre)
 */

import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chargerEnv } from "./env.mjs";
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

// `.env` SEUL, jamais `.env.local`.
//
// Ce script prepare SUPABASE. `.env.local` designe la base de developpement
// locale : le lire ici ferait croire au script qu il s adresse a Supabase
// alors qu il viserait localhost — et son option `--ecraser` supprime le
// schema public. Une confusion entre les deux bases n est pas une gene, c est
// une destruction.
chargerEnv(".env");

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

// Le controle porte sur LES DEUX adresses : un mot de passe oublie dans le
// pooler passerait inapercu jusqu a une erreur de connexion illisible.
// Deux formes possibles : MOTDEPASSE (notre .env.example) et [YOUR-PASSWORD]
// (ce que Supabase met dans le presse-papier).
const restePlaceholder = /MOTDEPASSE|\[[^\]]*\]/;

if (restePlaceholder.test(POOLER) || restePlaceholder.test(DIRECT)) {
  arreter(
    "Le mot de passe n a pas ete remplace dans .env.",
    "Remplacez MOTDEPASSE (ou [YOUR-PASSWORD] si l adresse vient de Supabase)\n" +
      "   par le mot de passe de la base, DANS LES DEUX LIGNES."
  );
}

// Supabase refuse les connexions en clair. Sans ce controle, l echec arrive
// deux etapes plus loin, sous une erreur reseau qui ne nomme pas la cause.
for (const [nom, url] of [
  ["DATABASE_URL", POOLER],
  ["DIRECT_URL", DIRECT],
]) {
  if (!/[?&]sslmode=/.test(url)) {
    arreter(
      `${nom} n indique pas sslmode.`,
      "Ajoutez ?sslmode=require a la fin de l adresse : Supabase refuse les\n" +
        "   connexions non chiffrees."
    );
  }
}

// Les deux adresses inversees : DIRECT pointant sur le pooler, et
// `migrate deploy` echoue sur une erreur qui ne nomme jamais le port.
if (/:6543\//.test(DIRECT)) {
  arreter(
    "DIRECT_URL utilise le port 6543, celui du pooler.",
    "Les migrations exigent la connexion directe, port 5432 : les deux lignes\n" +
      "   sont probablement inversees."
  );
}

ok(`pooler  : ${POOLER.replace(/:[^:@]+@/, ":****@").slice(0, 70)}…`);
ok(`direct  : ${DIRECT.replace(/:[^:@]+@/, ":****@").slice(0, 70)}…`);

// ═══════════ 2. La base repond-elle ?
etape(2, "Connexion");

// Depuis pg 8.23, `sslmode=require` est interprete comme `verify-full`, soit la
// verification complete de la chaine de certificats — que Supabase ne passe pas
// (chaine auto-signee), et que Prisma ne demande pas. Sans cette option, ce
// controle serait PLUS strict que l outil qu il prepare : il annoncerait
// « connexion impossible » sur une configuration qui fonctionne. La connexion
// reste chiffree ; c est la verification de l autorite qui est assouplie.
const libpq = (url) =>
  url.includes("uselibpqcompat")
    ? url
    : url + (url.includes("?") ? "&" : "?") + "uselibpqcompat=true";

// --par-le-pooler : le port 5432 est filtre (VPN, partage de connexion mobile,
// reseau d entreprise). On passe alors par le pooler pour TOUT, y compris le
// schema. Voir l etape 4 pour ce que cela coute.
const PAR_LE_POOLER = process.argv.includes("--par-le-pooler");
const ADMIN = PAR_LE_POOLER ? POOLER : DIRECT;

if (PAR_LE_POOLER) {
  console.log("   ! --par-le-pooler : le port 5432 est contourne");
}

// Sans delai d attente, un port filtre par un VPN ne provoque aucune erreur :
// pg attend le verdict du systeme, soit plusieurs minutes de silence. Mieux
// vaut echouer en dix secondes avec un message que reussir a se taire.
const client = new pg.Client({
  connectionString: libpq(ADMIN),
  connectionTimeoutMillis: 10_000,
});

try {
  await client.connect();
  const { rows } = await client.query("SELECT version()");
  ok(rows[0].version.split(" ").slice(0, 2).join(" "));
} catch (e) {
  arreter(
    `Connexion impossible : ${e.message}`,
    "Si le message parle d authentification, le mot de passe est faux.\n" +
      "   S il parle de coupure ou d attente (ECONNRESET, timeout), c est le reseau :\n" +
      "   un VPN ou un partage de connexion mobile bloque souvent le port 5432."
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

// ═══════════ 4. Migrations
etape(4, "Migrations");

if (!PAR_LE_POOLER) {
  await client.end();
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
    ok("schema applique");
  } catch {
    arreter("Les migrations ont echoue.");
  }
} else {
  // `prisma migrate deploy` exige la connexion directe : il prend un verrou de
  // session, que le pooler en mode transaction ne sait pas tenir. On applique
  // donc les fichiers nous-memes, dans l ordre, chacun d un seul envoi — donc
  // dans une seule transaction implicite : un fichier passe entierement ou
  // pas du tout.
  //
  // Ce que cela coute : Prisma ne pilote plus l operation, il en herite. Le
  // journal `_prisma_migrations` est tenu a la main, avec la meme empreinte
  // SHA-256 que celle qu il aurait calculee — sans quoi il declarerait la
  // migration alteree au prochain passage.
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

  const racine = "prisma/migrations";
  const dossiers = fs
    .readdirSync(racine, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(racine, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort();

  if (dossiers.length === 0) arreter("Aucune migration trouvee dans prisma/migrations.");

  const { rows: deja } = await client.query(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
  );
  const appliquees = new Set(deja.map((r) => r.migration_name));

  for (const nom of dossiers) {
    if (appliquees.has(nom)) {
      ok(`${nom} — deja appliquee`);
      continue;
    }
    const sql = fs.readFileSync(path.join(racine, nom, "migration.sql"), "utf8");
    try {
      await client.query(sql);
    } catch (e) {
      await client.end();
      arreter(`${nom} a echoue : ${e.message}`);
    }
    await client.query(
      `INSERT INTO "_prisma_migrations"
         (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
       VALUES ($1, $2, $3, now(), now(), 1)`,
      [crypto.randomUUID(), crypto.createHash("sha256").update(sql).digest("hex"), nom]
    );
    ok(`${nom} — appliquee`);
  }

  await client.end();
  ok("schema applique par le pooler");
}

// ═══════════ 5. Amorce
//
// ┌────────────────────────────────────────────────────────────────────────┐
// │  L AMORCE, PAS LE JEU DE DEMONSTRATION.                                 │
// └────────────────────────────────────────────────────────────────────────┘
//
// Cette etape lancait `prisma/seed.ts`, c est-a-dire le jeu COMPLET : quatre
// comptes de demonstration avec leur mot de passe commun, des produits, des
// commandes, des paiements, des factures et des transactions.
//
// Contre la base de DEPLOIEMENT, la consequence etait directe et muette : le
// tout premier vendeur a ouvrir son tableau de bord y aurait lu des
// encaissements, une courbe et un solde qui ne sont ceux de personne. Et
// `admin@koli.ci` / `Password123!` aurait ouvert l administration de la
// plateforme a quiconque a lu le depot.
//
// `prisma/amorce.ts` ne pose que ce sans quoi l application ne demarre pas :
// reglages, taux de commission, et un administrateur dont le mot de passe vient
// de `ADMIN_PASSWORD` — sans valeur de repli. Aucune commande, aucun mouvement.
// Les tableaux de bord partent de zero, et affichent leurs etats vides.
//
// `--avec-demonstration` retablit l ancien comportement, pour une base de
// preproduction dont on sait qu elle ne sert a personne.
const AVEC_DEMONSTRATION = process.argv.includes("--avec-demonstration");

etape(
  5,
  AVEC_DEMONSTRATION
    ? "Jeu de donnees de DEMONSTRATION (--avec-demonstration)"
    : "Amorce — reglages, commission, administrateur"
);

if (AVEC_DEMONSTRATION) {
  console.log(
    "   ! Cette base recevra des commandes et des comptes FICTIFS.\n" +
      "     A ne faire que sur une base qui ne sert a aucun utilisateur reel."
  );
}

try {
  // L amorce comme le jeu preferent DIRECT_URL — c est justement le port hors
  // d atteinte ici. On leur presente le pooler sous ce nom : ils n ont pas a
  // connaitre la contrainte reseau, et le mode transaction suffit.
  execSync(
    AVEC_DEMONSTRATION ? "npx tsx prisma/seed.ts" : "npx tsx prisma/amorce.ts",
    {
      stdio: "inherit",
      env: PAR_LE_POOLER
        ? { ...process.env, DIRECT_URL: libpq(POOLER) }
        : process.env,
    }
  );
  ok(AVEC_DEMONSTRATION ? "comptes et commandes de demonstration crees" : "amorce posee");
} catch {
  arreter(
    AVEC_DEMONSTRATION
      ? "Le jeu de donnees a echoue."
      : "L amorce a echoue. ADMIN_EMAIL, ADMIN_PASSWORD et ADMIN_PHONE sont-ils renseignes ?"
  );
}

// ═══════════ 6. Controle final
etape(6, "Integrite du schema");

const verif = new pg.Client({
  connectionString: libpq(ADMIN),
  connectionTimeoutMillis: 10_000,
});
await verif.connect();

const { rows: compte } = await verif.query(
  `SELECT
     (SELECT COUNT(*) FROM pg_tables WHERE schemaname='public') AS tables,
     (SELECT COUNT(*) FROM "User") AS utilisateurs,
     (SELECT COUNT(*) FROM "Order") AS commandes`
);

const c = compte[0];
ok(`${c.tables} tables · ${c.utilisateurs} comptes · ${c.commandes} commandes`);

if (Number(c.tables) === 0) {
  await verif.end();
  arreter("Aucune table : les migrations n ont pas abouti.");
}

/*
 * Le controle qui compte : une base de deploiement ne porte AUCUNE commande.
 *
 * Il ne peut pas echouer sur une amorce reussie — l amorce n en cree pas une
 * seule. Il attrape le cas ou la base avait deja recu le jeu de demonstration
 * lors d une preparation precedente : les tables sont la, les migrations
 * passent, tout parait sain, et les premiers vrais utilisateurs lisent des
 * chiffres inventes. C est exactement le genre de defaut qu on ne voit pas en
 * regardant si « ca marche ».
 */
if (!AVEC_DEMONSTRATION && Number(c.commandes) > 0) {
  console.log(
    `\n   ! ATTENTION — ${c.commandes} commande(s) deja en base.\n` +
      "     Cette base a probablement recu le jeu de DEMONSTRATION.\n" +
      "     Les tableaux de bord afficheront des chiffres qui ne sont ceux\n" +
      "     de personne. Pour repartir de zero sans perdre les comptes :\n" +
      "       DATABASE_URL=<supabase> npm run base:vider"
  );
}

await verif.end();

console.log("\nKOLI est en place sur Supabase.");
console.log("Etape suivante : npm run verif:tout\n");
