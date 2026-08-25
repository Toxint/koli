/**
 * Une base PostgreSQL locale, pour developper sans dependre du reseau.
 *
 * Pourquoi elle existe : la base de production est chez Supabase, en Irlande.
 * Depuis une liaison degradee — VPN obligatoire, partage de connexion mobile —
 * l aller-retour atteint 700 a 1100 ms. Les pages du produit enchainant une
 * dizaine de requetes, la moindre d entre elles met vingt secondes, et les
 * scripts de verification rapportent des defauts imaginaires. Ce n est pas un
 * inconfort : c est une campagne de verification qui ment.
 *
 * Ici, l aller-retour est de l ordre du dixieme de milliseconde.
 *
 * Ce n est pas un ersatz : c est le MEME moteur, dans la MEME version que
 * Supabase (17.6), avec les memes migrations. Ce qui passe ici passe la-bas —
 * c est precisement ce que le passage a PostgreSQL a rendu possible.
 *
 * Aucun droit administrateur, aucun Docker : les binaires sont fournis par le
 * paquet `embedded-postgres` et tournent depuis node_modules.
 *
 * Usage :
 *   node scripts/base-locale.mjs demarrer
 *   node scripts/base-locale.mjs arreter
 *   node scripts/base-locale.mjs etat
 *   node scripts/base-locale.mjs supprimer   (efface les donnees locales)
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const BIN = "node_modules/@embedded-postgres/windows-x64/native/bin";
const DONNEES = ".donnees/postgres";
const JOURNAL = ".donnees/postgres.log";
const PORT = 5433;
const BASE = "koli";
const UTILISATEUR = "postgres";
const MOTDEPASSE = "koli-local";

const outil = (nom) => path.resolve(BIN, `${nom}.exe`);

const ok = (m) => console.log(`   ✓ ${m}`);
const info = (m) => console.log(`   · ${m}`);
const arreter = (m, aide = "") => {
  console.error(`   ✗ ${m}`);
  if (aide) console.error(`\n   ${aide}`);
  process.exit(1);
};

if (!fs.existsSync(outil("pg_ctl"))) {
  arreter(
    "Les binaires PostgreSQL sont absents.",
    "Installez les dependances : npm install"
  );
}

/**
 * Lance un outil PostgreSQL et rend sa sortie, ou `null` s il echoue.
 *
 * L entree standard est FERMEE : un outil qui reclamerait une saisie doit
 * echouer, pas figer la commande. `PGPASSWORD` est fourni pour la meme
 * raison — sans lui, tout outil qui se connecte demande le mot de passe au
 * clavier et attend indefiniment.
 */
function lancer(nom, args, silencieux = false) {
  try {
    return execFileSync(outil(nom), args, {
      encoding: "utf8",
      env: { ...process.env, PGPASSWORD: MOTDEPASSE },
      stdio: silencieux ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "inherit"],
    });
  } catch (e) {
    if (silencieux) return null;
    throw e;
  }
}

/**
 * Lance un outil qui LAISSE un processus derriere lui, sans rien capturer.
 *
 * `pg_ctl start` detache le serveur, qui herite alors des tuyaux de sortie du
 * parent. Ceux-ci ne se referment donc jamais, et `execFileSync` attend
 * indefiniment la fin d une lecture qui ne viendra pas — pg_ctl a pourtant
 * rendu la main, et le serveur repond deja. Le blocage est total et muet.
 *
 * On ne capture donc rien : le serveur ecrit dans son journal (`-l`), qui est
 * de toute facon l endroit ou il faut aller lire.
 */
function lancerDetache(nom, args) {
  execFileSync(outil(nom), args, {
    env: { ...process.env, PGPASSWORD: MOTDEPASSE },
    stdio: "ignore",
  });
}

const enMarche = () => lancer("pg_ctl", ["-D", DONNEES, "status"], true) !== null;

const adresse = (base) =>
  `postgresql://${UTILISATEUR}:${MOTDEPASSE}@localhost:${PORT}/${base}`;

/** Ouvre une connexion, fait le necessaire, referme quoi qu il arrive. */
async function surServeur(base, action) {
  const client = new pg.Client({
    connectionString: adresse(base),
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

async function baseExiste() {
  return surServeur("postgres", async (c) => {
    const { rows } = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [BASE]);
    return rows.length > 0;
  });
}

// ═══════════ Preparation du repertoire de donnees
function initialiser() {
  if (fs.existsSync(path.join(DONNEES, "PG_VERSION"))) return false;

  info("premier demarrage : preparation du repertoire de donnees");
  fs.mkdirSync(DONNEES, { recursive: true });

  // Le mot de passe passe par un FICHIER, jamais par la ligne de commande :
  // les arguments d un processus sont lisibles par les autres processus de la
  // machine. Il est efface aussitot.
  const fichierMdp = path.join(".donnees", "mdp-initial.txt");
  fs.writeFileSync(fichierMdp, MOTDEPASSE, "utf8");
  try {
    lancer("initdb", [
      "-D", DONNEES,
      "-U", UTILISATEUR,
      "--pwfile", fichierMdp,
      "--auth-local=scram-sha-256",
      "--auth-host=scram-sha-256",
      "--encoding=UTF8",
      "--locale=C",
    ]);
  } finally {
    fs.rmSync(fichierMdp, { force: true });
  }

  return true;
}

// ═══════════ Commandes
const commande = process.argv[2] ?? "etat";

if (commande === "demarrer") {
  if (enMarche()) {
    ok(`deja en marche sur le port ${PORT}`);
    process.exit(0);
  }

  initialiser();

  fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });

  // `listen_addresses=localhost` : la base n est JAMAIS exposee au reseau.
  // Une base de developpement ouverte sur un wifi partage est une base
  // publique, et celle-ci contient des comptes de demonstration dont les mots
  // de passe sont connus.
  lancerDetache("pg_ctl", [
    "-D", DONNEES,
    "-l", JOURNAL,
    "-o", `-p ${PORT} -c listen_addresses=localhost`,
    "-w",
    "start",
  ]);

  // La base applicative, distincte de `postgres` : les scripts de mise en
  // route suppriment le schema, ce qu on ne fait pas dans la base
  // d administration du serveur.
  //
  // Creee avec le pilote `pg` et non `createdb` : le paquet ne fournit que
  // trois binaires — initdb, pg_ctl, postgres. Ni `psql`, ni `createdb`. Les
  // appeler ne provoquait meme pas d erreur franche sous Windows, seulement un
  // blocage indefini.
  if (!(await baseExiste())) {
    await surServeur("postgres", (c) => c.query(`CREATE DATABASE "${BASE}"`));
    ok(`base « ${BASE} » creee`);
  }

  ok(`PostgreSQL en marche sur localhost:${PORT}`);
  console.log("");
  console.log("   Adresse a placer dans .env.local :");
  console.log(`   postgresql://${UTILISATEUR}:${MOTDEPASSE}@localhost:${PORT}/${BASE}`);
  process.exit(0);
}

if (commande === "arreter") {
  if (!enMarche()) {
    info("deja arretee");
    process.exit(0);
  }
  lancer("pg_ctl", ["-D", DONNEES, "-m", "fast", "-w", "stop"]);
  ok("PostgreSQL arretee");
  process.exit(0);
}

if (commande === "etat") {
  if (!enMarche()) {
    info("arretee");
    console.log("\n   Pour la demarrer : npm run base:demarrer");
    process.exit(1);
  }
  const version = await surServeur(
    BASE,
    async (c) => (await c.query("SELECT version()")).rows[0].version
  );
  ok(`en marche sur localhost:${PORT} — ${version.split(" ").slice(0, 2).join(" ")}`);
  process.exit(0);
}

if (commande === "supprimer") {
  // Destructif, donc explicite : on ne l enchaine pas dans un autre script.
  if (!process.argv.includes("--je-sais")) {
    arreter(
      "Cette commande EFFACE la base locale et tout ce qu elle contient.",
      "Si c est bien ce que vous voulez : npm run base:supprimer -- --je-sais"
    );
  }
  if (enMarche()) lancer("pg_ctl", ["-D", DONNEES, "-m", "immediate", "-w", "stop"]);
  fs.rmSync(DONNEES, { recursive: true, force: true });
  fs.rmSync(JOURNAL, { force: true });
  ok("base locale effacee");
  process.exit(0);
}

arreter(
  `Commande inconnue : ${commande}`,
  "Attendu : demarrer | arreter | etat | supprimer"
);
