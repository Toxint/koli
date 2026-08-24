/**
 * Integrite du schema de donnees.
 *
 * Ce controle existe a cause d'un defaut precis : `Fund.sellerId` a vecu des
 * mois comme une simple chaine, sans clef etrangere. Rien n'empechait d'y
 * ecrire un identifiant inexistant, et le sequestre correspondant serait
 * devenu invisible dans le solde du vendeur — sans qu'aucune erreur ne le
 * signale. Sur un registre qui dit combien la plateforme doit a qui, c'est le
 * genre d'ecart qu'on ne decouvre qu'au moment de payer.
 *
 * Il verifie quatre choses :
 *
 *  1. toute colonne en `<chose>Id` porte une VRAIE clef etrangere ;
 *  2. SQLite les fait respecter (elles sont decoratives sans le reglage) ;
 *  3. aucune ligne orpheline ne subsiste ;
 *  4. les migrations couvrent bien l'etat du schema.
 *
 * Usage : node scripts/verifier-schema.mjs
 */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

console.log("\n=== INTEGRITE DU SCHEMA ===\n");

let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const db = new Database("prisma/dev.db", { readonly: true });

// ═══════════ 1. Les clefs etrangeres sont-elles respectees ?
{
  const actif = db.pragma("foreign_keys", { simple: true });
  verifier(
    actif === 1,
    "SQLite fait respecter les clefs etrangeres",
    `PRAGMA foreign_keys = ${actif}`
  );
}

// ═══════════ 2. Toute colonne « <chose>Id » porte une clef
{
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'")
    .all()
    .map((t) => t.name);

  // Colonnes volontairement SANS clef, et pourquoi.
  const exceptions = new Map([
    // L'auteur d'une notification externe n'existe pas ; ce champ designe une
    // entite variable ("Order", "Commission"...) et ne peut pas pointer une
    // table unique.
    ["Notification.entityId", "cible polymorphe"],
    ["AuditLog.entityId", "cible polymorphe"],
    ["KycDocument.fileUrl", "chemin de fichier"],
    // Identifiant STABLE fourni par Google (claim `sub`) : ce n est pas une
    // reference vers une table a nous.
    ["User.googleId", "identifiant externe Google"],
  ]);

  const manquantes = [];

  for (const table of tables) {
    const colonnes = db.pragma(`table_info(${JSON.stringify(table)})`);
    const cles = db
      .pragma(`foreign_key_list(${JSON.stringify(table)})`)
      .map((f) => f.from);

    for (const c of colonnes) {
      if (!/Id$/.test(c.name) || c.name === "id") continue;
      if (exceptions.has(`${table}.${c.name}`)) continue;
      if (cles.includes(c.name)) continue;
      manquantes.push(`${table}.${c.name}`);
    }
  }

  verifier(
    manquantes.length === 0,
    "chaque colonne d'identifiant porte une clef etrangere",
    manquantes.join(", ")
  );
}

// ═══════════ 3. Aucune ligne orpheline
{
  const violations = db.pragma("foreign_key_check");
  verifier(
    violations.length === 0,
    "aucune ligne orpheline dans la base",
    violations.length
      ? `${violations.length} : ${JSON.stringify(violations.slice(0, 2))}`
      : ""
  );
}

// ═══════════ 4. Les fonds pointent le bon vendeur
{
  // Meme avec la clef, rien n'impose que `Fund.sellerId` corresponde au
  // vendeur de la COMMANDE. Une divergence rendrait le solde faux des deux
  // cotes a la fois.
  const ecarts = db
    .prepare(
      `SELECT COUNT(*) n FROM Fund f JOIN "Order" o ON o.id = f.orderId
        WHERE o.sellerId != f.sellerId`
    )
    .get().n;

  verifier(
    ecarts === 0,
    "chaque sequestre est attribue au vendeur de sa commande",
    `${ecarts} ecart(s)`
  );
}

db.close();

// ═══════════ 5. Les migrations existent et couvrent le schema
{
  const dossier = "prisma/migrations";
  const present = fs.existsSync(dossier);
  verifier(present, "un dossier de migrations existe");

  if (present) {
    const migrations = fs
      .readdirSync(dossier, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    verifier(
      migrations.length > 0,
      "au moins une migration est enregistree",
      `${migrations.length}`
    );

    // Chaque dossier doit contenir son SQL : un dossier vide casse
    // `migrate deploy` en production, et seulement la.
    const vides = migrations.filter(
      (m) => !fs.existsSync(path.join(dossier, m, "migration.sql"))
    );
    verifier(
      vides.length === 0,
      "chaque migration porte bien son fichier SQL",
      vides.join(", ")
    );

    const base = db2Ouvrir();
    const appliquees = base
      .prepare("SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL")
      .all()
      .map((r) => r.migration_name);
    base.close();

    const nonAppliquees = migrations.filter((m) => !appliquees.includes(m));
    verifier(
      nonAppliquees.length === 0,
      "toutes les migrations sont appliquees a la base locale",
      nonAppliquees.join(", ")
    );
  }
}

function db2Ouvrir() {
  return new Database("prisma/dev.db", { readonly: true });
}

console.log("");
console.log(
  echecs === 0
    ? "Le schema est complet et coherent."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
