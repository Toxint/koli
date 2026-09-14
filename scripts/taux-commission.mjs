/**
 * Change le TAUX DE COMMISSION sur la base EN LIGNE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  C'est la recette de la plateforme, et le chiffre qu'annoncent les      │
 * │  conditions d'utilisation — qui le LISENT en base (§8).                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le geste existe déjà dans l'application (`/admin/commissions`), et c'est
 * normalement par là qu'il passe : il est alors consigné au nom de celui qui
 * l'a fait. Ce script existe pour le cas où l'administration n'est pas encore
 * joignable depuis ce poste — il écrit la MÊME chose, y compris la trace
 * d'audit, sous le nom « Administration (outillage) ».
 *
 * ── Ce qu'il fait, dans une seule transaction ───────────────────────────────
 *
 * · désactive le taux courant — on ne supprime jamais une ligne de commission,
 *   les ventes passées ont été prélevées à ce taux-là et le registre doit
 *   pouvoir l'expliquer ;
 * · crée le nouveau ;
 * · consigne l'avant et l'après au journal (§48). Un taux qui change sans
 *   trace, c'est une recette qui bouge sans auteur.
 *
 * Usage :
 *   npm run admin:commission -- 10                # montre
 *   npm run admin:commission -- 10 --appliquer    # écrit
 */

import { chargerEnv } from "./env.mjs";

/* `.env` SEUL : c'est la base EN LIGNE. Lire `.env.local` changerait le taux du
   poste en croyant changer celui de la production — et le jeu de démonstration
   le réécrit à chaque `base:preparer`, donc l'erreur passerait inaperçue. */
chargerEnv(".env");

const { Pool } = await import("pg");

const arguments_ = process.argv.slice(2);
const appliquer = arguments_.includes("--appliquer");
const brut = (arguments_.find((a) => !a.startsWith("--")) ?? "").replace(",", ".");
const taux = Number(brut);

if (!brut || !Number.isFinite(taux) || taux <= 0 || taux > 100) {
  console.error("\nIl faut un taux entre 0 et 100 : npm run admin:commission -- 10\n");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

try {
  const [actif] = await q(
    `SELECT id, "ratePercent" FROM "Commission" WHERE "isActive" = true
      ORDER BY "createdAt" DESC LIMIT 1`
  );

  console.log(`\n=== Taux de commission (base EN LIGNE) ===\n`);
  console.log(`  actuel   : ${actif ? `${actif.ratePercent} %` : "aucun"}`);
  console.log(`  nouveau  : ${taux} %\n`);

  if (actif && Number(actif.ratePercent) === taux) {
    console.log("  Le taux est deja celui-la. Rien a faire.\n");
    process.exit(0);
  }

  if (!appliquer) {
    console.log("  Rien n'est ecrit. Pour appliquer :");
    console.log(`    npm run admin:commission -- ${taux} --appliquer\n`);
    console.log("  ⚠ Les ventes DEJA prelevees gardent leur taux : on ne relit");
    console.log("    pas un registre. Le nouveau taux vaut pour les suivantes.\n");
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE "Commission" SET "isActive" = false WHERE "isActive" = true`);
    const { rows: creees } = await client.query(
      `INSERT INTO "Commission" (id, "ratePercent", "isActive", "createdAt")
       VALUES ($1, $2, true, now()) RETURNING id`,
      [`comm-${Date.now().toString(36)}`, taux]
    );
    await client.query(
      `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", metadata, "actorName", "actorRole", "createdAt")
       VALUES ($1, 'COMMISSION_RATE_SET', 'Commission', $2, $3, 'Administration (outillage)', 'ADMIN', now())`,
      [
        `audit-comm-${Date.now().toString(36)}`,
        creees[0].id,
        JSON.stringify({
          avant: actif ? `${actif.ratePercent} %` : "aucune commission",
          apres: `${taux} %`,
        }),
      ]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  /* Verification par l'EFFET : on relit ce que l'application lira. */
  const [relu] = await q(
    `SELECT "ratePercent" FROM "Commission" WHERE "isActive" = true
      ORDER BY "createdAt" DESC LIMIT 1`
  );
  const actives = await q(`SELECT id FROM "Commission" WHERE "isActive" = true`);

  console.log(`  ✓ taux actif relu : ${relu.ratePercent} %`);
  console.log(
    `  ${actives.length === 1 ? "✓" : "✗"} un seul taux actif (${actives.length})`
  );
  console.log(
    `\n  Les conditions d'utilisation liront ce chiffre a leur prochaine revalidation (1 h).\n`
  );
} finally {
  await pool.end();
}
