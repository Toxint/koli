import pg from "pg";
import { chargerEnv } from "./env.mjs";

chargerEnv();

/**
 * Acces a la base pour les scripts de verification.
 *
 * Les douze scripts lisaient la base directement avec `better-sqlite3`, chacun
 * avec sa propre petite fonction. Au passage a Postgres, il aurait fallu les
 * modifier un par un — et l un d eux aurait fini par diverger.
 *
 * Trois differences entre SQLite et Postgres sont absorbees ici, et chacune
 * casserait les scripts en silence si on les ignorait :
 *
 * **1. Les parametres.** SQLite ecrit `?`, Postgres `$1`, `$2`… Les requetes
 * gardent la forme `?` et sont traduites ici : les reecrire toutes serait une
 * occasion de faute pour rien.
 *
 * **2. `COUNT(*)` rend une CHAINE.** Postgres renvoie les `bigint` en texte,
 * pour ne pas perdre de precision. Un `n === avant + 1` comparait donc
 * silencieusement `"3"` a `3` — toujours faux. Les entiers sont reconvertis.
 *
 * **3. La casse des identifiants.** Postgres replie les noms non guillemetes
 * en minuscules. Les tables du schema Prisma sont en capitales initiales
 * (`"Order"`, `"Payment"`) : elles DOIVENT etre guillemetees, sinon la
 * requete cherche une table `order` qui n existe pas.
 */

// Le POOLER d abord, et non la connexion directe. Les verifications ne
// touchent pas au schema : le mode transaction leur suffit. Et le port 5432
// est frequemment filtre — VPN, partage de connexion mobile, reseau
// d entreprise —, auquel cas toute la campagne echouerait sur un motif
// etranger a ce qu elle verifie.
const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;

if (!url) {
  console.error(
    "DATABASE_URL manquant : les verifications lisent la base reelle et " +
      "refusent de deviner laquelle."
  );
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  // Les scripts sont brefs : inutile d ouvrir dix connexions, et un pool trop
  // large sature la limite du plan gratuit quand plusieurs tests s enchainent.
  max: 3,
  // Un test bloque sur une requete doit echouer, pas attendre indefiniment.
  connectionTimeoutMillis: 15000,
});

/** `?` → `$1`, `$2`… dans l ordre d apparition. */
function traduireParametres(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

/** Les `bigint` de Postgres arrivent en chaine : on les rend comparables. */
function normaliser(ligne) {
  const sortie = {};
  for (const [cle, valeur] of Object.entries(ligne)) {
    sortie[cle] =
      typeof valeur === "string" && /^-?\d+$/.test(valeur) && cle !== "id"
        ? Number(valeur)
        : valeur;
  }
  return sortie;
}

/** Toutes les lignes. */
export async function lire(requete, ...params) {
  const r = await pool.query(traduireParametres(requete), params);
  return r.rows.map(normaliser);
}

/** La premiere ligne, ou `undefined`. */
export async function lireUne(requete, ...params) {
  return (await lire(requete, ...params))[0];
}

/** Ecriture (fabrication d un cas de test). Rend le nombre de lignes touchees. */
export async function ecrire(requete, ...params) {
  const r = await pool.query(traduireParametres(requete), params);
  return r.rowCount ?? 0;
}

/**
 * Duree moyenne d un aller-retour vers la base, connexion deja etablie.
 *
 * Ce n est pas une curiosite. Les tests de bout en bout enchainent des dizaines
 * de requetes : a 40 ms, une page se rend en une demi-seconde ; a 700 ms, la
 * meme page met vingt-six secondes et tous les delais d attente expirent. Les
 * scripts rapportent alors des regressions qui n existent pas — c est
 * exactement ce qui s est produit, et il a fallu une demi-journee pour
 * comprendre que la faute etait au reseau et non au code.
 */
export async function mesurerLatence(tirs = 5) {
  await pool.query("SELECT 1");
  const debut = Date.now();
  for (let i = 0; i < tirs; i++) await pool.query("SELECT 1");
  return Math.round((Date.now() - debut) / tirs);
}

/**
 * A appeler en fin de script.
 *
 * Sans cela, le processus Node ne se termine jamais : le pool garde ses
 * connexions ouvertes et le test paraît figé alors qu il a fini.
 */
export async function fermer() {
  await pool.end();
}
