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
 * Il verifie cinq choses :
 *
 *  1. les clefs etrangeres declarees sont toutes VALIDEES ;
 *  2. toute colonne en `<chose>Id` porte une VRAIE clef etrangere ;
 *  3. aucune ligne orpheline ne subsiste ;
 *  4. chaque sequestre revient au vendeur de sa commande ;
 *  5. les migrations couvrent bien l'etat du schema.
 *
 * **Il interroge la base REELLE**, celle que designe `DATABASE_URL`. Il a lu
 * un fichier SQLite local jusqu'au passage a Postgres, ce qui le rendait vert
 * quoi qu'il arrive sur Supabase : un controle d'integrite qui inspecte une
 * autre base que celle qui sert est pire que pas de controle du tout.
 *
 * Usage : node scripts/verifier-schema.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { lire, lireUne, fermer } from "./base-donnees.mjs";

console.log("\n=== INTEGRITE DU SCHEMA ===\n");

let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

// Les clefs etrangeres du schema, colonne par colonne. `conkey` et `confkey`
// sont des TABLEAUX de numeros de colonne — d'ou le depliage par `unnest`,
// apparie sur le rang pour que la colonne source corresponde a sa cible.
const clefs = await lire(`
  SELECT con.conname       AS nom,
         src.relname       AS table_source,
         sa.attname        AS colonne_source,
         cible.relname     AS table_cible,
         ca.attname        AS colonne_cible,
         con.convalidated  AS validee
  FROM pg_constraint con
  JOIN pg_class src   ON src.oid = con.conrelid
  JOIN pg_class cible ON cible.oid = con.confrelid
  JOIN unnest(con.conkey)  WITH ORDINALITY AS s(attnum, ord) ON true
  JOIN unnest(con.confkey) WITH ORDINALITY AS c(attnum, ord) ON c.ord = s.ord
  JOIN pg_attribute sa ON sa.attrelid = con.conrelid   AND sa.attnum = s.attnum
  JOIN pg_attribute ca ON ca.attrelid = con.confrelid  AND ca.attnum = c.attnum
  WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
  ORDER BY 2, 3`);

// ═══════════ 1. Les clefs etrangeres sont-elles respectees ?
{
  // Postgres les fait respecter d'office — sauf celles ajoutees en NOT VALID,
  // qui laissent passer les lignes deja presentes. C'est l'equivalent exact du
  // `PRAGMA foreign_keys` qu'il fallait activer sous SQLite.
  const suspendues = clefs.filter((c) => !c.validee).map((c) => c.nom);

  verifier(clefs.length > 0, "le schema declare des clefs etrangeres", `${clefs.length}`);
  verifier(
    suspendues.length === 0,
    "toutes les clefs etrangeres sont validees",
    suspendues.join(", ")
  );
}

// ═══════════ 2. Toute colonne « <chose>Id » porte une clef
{
  const colonnes = await lire(`
    SELECT table_name AS "table", column_name AS colonne
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name NOT LIKE '\\_prisma%'
      AND column_name LIKE '%Id'
      AND column_name <> 'id'
    ORDER BY 1, 2`);

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

  const portantUneClef = new Set(
    clefs.map((c) => `${c.table_source}.${c.colonne_source}`)
  );

  const manquantes = colonnes
    .map((c) => `${c.table}.${c.colonne}`)
    .filter((q) => !exceptions.has(q) && !portantUneClef.has(q));

  verifier(
    manquantes.length === 0,
    "chaque colonne d'identifiant porte une clef etrangere",
    manquantes.join(", ")
  );
}

// ═══════════ 3. Aucune ligne orpheline
{
  // `PRAGMA foreign_key_check` n'a pas d'equivalent : on le refait a la main,
  // clef par clef. Verifier que les contraintes EXISTENT ne suffit pas — une
  // contrainte posee en NOT VALID puis validee a tort laisserait derriere elle
  // exactement les lignes que ce controle cherche.
  const orphelines = [];

  for (const c of clefs) {
    const { n } = await lireUne(
      `SELECT COUNT(*) AS n
         FROM "${c.table_source}" s
         LEFT JOIN "${c.table_cible}" t ON t."${c.colonne_cible}" = s."${c.colonne_source}"
        WHERE s."${c.colonne_source}" IS NOT NULL
          AND t."${c.colonne_cible}" IS NULL`
    );
    if (n > 0) orphelines.push(`${c.table_source}.${c.colonne_source} (${n})`);
  }

  verifier(
    orphelines.length === 0,
    "aucune ligne orpheline dans la base",
    orphelines.join(", ")
  );
}

// ═══════════ 4. Les fonds pointent le bon vendeur
{
  // Meme avec la clef, rien n'impose que `Fund.sellerId` corresponde au
  // vendeur de la COMMANDE. Une divergence rendrait le solde faux des deux
  // cotes a la fois.
  const { n: ecarts } = await lireUne(
    `SELECT COUNT(*) AS n
       FROM "Fund" f
       JOIN "Order" o ON o.id = f."orderId"
      WHERE o."sellerId" <> f."sellerId"`
  );

  verifier(
    ecarts === 0,
    "chaque sequestre est attribue au vendeur de sa commande",
    `${ecarts} ecart(s)`
  );
}

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

    const appliquees = (
      await lire(
        `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
      )
    ).map((r) => r.migration_name);

    const nonAppliquees = migrations.filter((m) => !appliquees.includes(m));
    verifier(
      nonAppliquees.length === 0,
      "toutes les migrations sont appliquees a la base qui sert",
      nonAppliquees.join(", ")
    );
  }
}

await fermer();

console.log("");
console.log(
  echecs === 0
    ? "Le schema est complet et coherent."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
