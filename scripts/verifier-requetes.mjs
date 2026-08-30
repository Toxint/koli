/**
 * Chaque requete SQL des scripts est-elle valide contre le VRAI schema ?
 *
 * Les scripts de verification lisent la base directement, en SQL ecrit a la
 * main. Rien ne le relit : une faute n'apparait qu'a l'execution du script
 * concerne — donc apres avoir demarre un navigateur, ouvert une session et
 * parcouru la moitie d'un tunnel de commande.
 *
 * Le passage de SQLite a Postgres a rendu ce risque concret. Postgres replie
 * en minuscules tout identifiant non guillemete : `FROM User` y cherche une
 * table `user`. Il refuse `isActive = 1` sur un booleen. Il n'a pas de
 * `rowid`. Aucune de ces trois fautes ne se voit a la lecture.
 *
 * Ce controle demande donc a Postgres de PREPARER chaque requete — il l'analyse
 * et resout les identifiants, sans jamais l'executer. Une commande de test
 * n'est creee nulle part ; le journal n'est pas touche.
 *
 * Usage : node scripts/verifier-requetes.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { chargerEnv } from "./env.mjs";
import pg from "pg";

chargerEnv();

const DOSSIER = "scripts";
const EST_SQL = /^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH)\b/i;

/**
 * Un SELECT CSS n'est pas un SELECT SQL.
 *
 * Les scripts Playwright visent des elements par selecteur, et `<select>` est
 * une balise HTML : `page.locator("select option")` et
 * `"select[id^='livreur-']"` commencent tous deux par le mot SELECT, et la
 * base les refusait avec une erreur de syntaxe parfaitement exacte — sur du
 * code parfaitement correct.
 *
 * Deux faux positifs suffisent a rendre ce controle inutilisable : on prend
 * l'habitude de voir du rouge, et le jour ou une VRAIE requete casse, on ne la
 * distingue plus. Un controle qui crie a tort finit par ne plus etre lu.
 *
 * On reconnait un selecteur CSS a ce qui ne peut pas apparaitre en tete d'une
 * requete SQL : un crochet d'attribut, un point de classe, un diese. Ecarter
 * ces formes ne relache RIEN — aucune requete SQL valide ne s'ecrit ainsi.
 */
const EST_SELECTEUR_CSS = /^\s*select\s*[[.#:>~,]|^\s*select\s+(option|optgroup)\b/i;

/** Les litteraux d'un fichier : gabarits, apostrophes, guillemets. */
function litteraux(source) {
  const trouves = [];
  const motif = /`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g;
  let m;
  while ((m = motif.exec(source))) {
    const corps = m[0].slice(1, -1);
    if (EST_SQL.test(corps) && !EST_SELECTEUR_CSS.test(corps)) {
      trouves.push({ sql: corps, ligne: source.slice(0, m.index).split("\n").length });
    }
  }
  return trouves;
}

/**
 * Met la requete en etat d'etre analysee.
 *
 * Les `?` deviennent `$1`, `$2`… — c'est la traduction que fait
 * `base-donnees.mjs` a l'execution. Les interpolations JavaScript deviennent
 * un mot quelconque : leur CONTENU ne regarde pas l'analyse, seule compte la
 * forme de la requete autour.
 */
function preparable(sql) {
  let n = 0;
  return sql
    .replace(/\$\{[^}]*\}/g, "x")
    .replace(/\?/g, () => `$${++n}`);
}

/**
 * Une requete dont le NOM DE TABLE est calcule ne peut pas etre analysee : on
 * ne saurait le remplacer par quoi que ce soit de reel. C'est le cas de
 * `verifier-schema.mjs`, qui parcourt les clefs etrangeres et fabrique une
 * requete par clef. Les compter comme refusees serait mentir sur l'etat du
 * code ; les passer sous silence aussi. Elles sont donc annoncees a part.
 */
const identifiantCalcule = (sql) =>
  // Entre guillemets : `"${table}"`.
  /"\$\{[^}]*\}"/.test(sql) ||
  // En position de nom : juste apres SELECT, FROM, JOIN, INTO, UPDATE.
  /\b(SELECT|FROM|JOIN|INTO|UPDATE)\s+\$\{/i.test(sql);

const fichiers = fs
  .readdirSync(DOSSIER)
  .filter((f) => f.endsWith(".mjs") && f !== path.basename(process.argv[1]))
  .sort();

const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
if (!url) {
  console.error("DATABASE_URL manquant : impossible de confronter les requetes au schema.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url.includes("uselibpqcompat")
    ? url
    : url + (url.includes("?") ? "&" : "?") + "uselibpqcompat=true",
  connectionTimeoutMillis: 15000,
});

await client.connect();

console.log("\n=== REQUETES DES SCRIPTS ===\n");

let total = 0;
let refusees = 0;
let passees = 0;
let compteur = 0;

for (const fichier of fichiers) {
  const source = fs.readFileSync(path.join(DOSSIER, fichier), "utf8");
  const requetes = litteraux(source);
  if (requetes.length === 0) continue;

  const echecs = [];
  let ignorees = 0;

  for (const { sql, ligne } of requetes) {
    if (identifiantCalcule(sql)) {
      ignorees++;
      passees++;
      continue;
    }
    total++;
    const nom = `verif_${compteur++}`;
    try {
      await client.query(`PREPARE ${nom} AS ${preparable(sql)}`);
      await client.query(`DEALLOCATE ${nom}`);
    } catch (e) {
      refusees++;
      echecs.push(`    ligne ${ligne} : ${e.message.split("\n")[0]}`);
    }
  }

  const suffixe = ignorees ? `, ${ignorees} a identifiant calcule` : "";
  if (echecs.length === 0) {
    console.log(`  ✓ ${fichier} — ${requetes.length - ignorees} requete(s)${suffixe}`);
  } else {
    console.log(`  ✗ ${fichier} — ${echecs.length} refusee(s) sur ${requetes.length - ignorees}${suffixe}`);
    for (const e of echecs) console.log(e);
  }
}

await client.end();

console.log("");
const reste = passees ? ` (${passees} a identifiant calcule, non verifiables)` : "";
console.log(
  refusees === 0
    ? `Les ${total} requetes des scripts sont valides contre le schema${reste}.`
    : `${refusees} requete(s) sur ${total} sont refusees par la base${reste}.`
);
process.exit(refusees > 0 ? 1 : 0);
