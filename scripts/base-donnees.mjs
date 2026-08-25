import pg from "pg";

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

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

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
 * A appeler en fin de script.
 *
 * Sans cela, le processus Node ne se termine jamais : le pool garde ses
 * connexions ouvertes et le test paraît figé alors qu il a fini.
 */
export async function fermer() {
  await pool.end();
}
