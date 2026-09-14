/**
 * Ferme À LA MAIN un paiement en attente dont on a VÉRIFIÉ qu'il n'a débité
 * personne.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  iKeePay n'offre aucune route de consultation : le code ne peut PAS      │
 * │  savoir si une intention de paiement a abouti chez eux. Seul un humain   │
 * │  qui lit leur tableau de bord le sait.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * C'est la suite de `/admin/rapprochement` (§8) : l'écran MONTRE les paiements
 * restés en attente, l'humain va voir chez iKeePay, et ce script consigne la
 * conclusion quand il n'y a rien — la référence est absente de leur historique,
 * donc aucun argent n'a bougé.
 *
 * ── Pourquoi cela ne se fait pas depuis un écran ────────────────────────────
 *
 * L'écran de rapprochement n'a délibérément AUCUN bouton : conclure d'un clic
 * sur la seule foi d'une liste, c'est se donner le pouvoir de refermer un
 * dossier sans être allé voir. Ici, il faut nommer la référence, dire ce qu'on
 * a constaté, et ajouter `--appliquer`. Trois gestes délibérés.
 *
 * ── Ce qu'il ne fait PAS, et c'est voulu ────────────────────────────────────
 *
 * · Il ne conclut JAMAIS un paiement ABOUTI. Faire expédier un colis sur la
 *   parole d'un script est exactement ce que le séquestre existe pour empêcher.
 *   Un paiement réellement encaissé se traite autrement, et à plusieurs.
 * · Il n'efface rien. Le paiement passe à `EXPIRED` avec son motif, et le
 *   journal d'audit garde qui a conclu, quand, et sur quelle constatation. Un
 *   registre financier ne se réécrit pas, il s'annote.
 * · Il ne touche pas au stock : un paiement en attente n'a rien décrémenté —
 *   le décompte se fait à l'aboutissement (§17).
 *
 * Usage :
 *   npm run paiement:expirer -- KOLI-XXXXXXXX                # montre
 *   npm run paiement:expirer -- KOLI-XXXXXXXX --appliquer    # écrit
 */

import { chargerEnv } from "./env.mjs";

/*
 * `.env` SEUL, comme `nettoyer-registre.mjs`.
 *
 * `.env.local` désigne la base LOCALE. Ce script écrit dans un registre
 * financier : lire l'une en croyant lire l'autre ferait conclure un dossier
 * sur la mauvaise base, et le vrai resterait ouvert sans que personne le voie.
 */
chargerEnv(".env");

const { Pool } = await import("pg");

const arguments_ = process.argv.slice(2);
const appliquer = arguments_.includes("--appliquer");
const reference = arguments_.find((a) => !a.startsWith("--"));

if (!reference) {
  console.error(
    "\nIl faut nommer la commande : npm run paiement:expirer -- KOLI-XXXXXXXX\n"
  );
  process.exit(1);
}

const EN_ATTENTE = ["PENDING", "AWAITING_CUSTOMER"];
const MOTIF =
  "Verifie chez iKeePay : aucune transaction ne porte cette reference, donc aucun client debite.";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

try {
  const [ligne] = await q(
    `SELECT p.id, p.status, p.provider, p.amount, p."collectedAmount",
            p."collectedCurrency", p."simulatedOutcome", p."createdAt",
            o.id AS commande, o.currency, o.status AS statut_commande, o."buyerName"
       FROM "Payment" p
       JOIN "Order" o ON o.id = p."orderId"
      WHERE o.reference = $1
      ORDER BY p."createdAt" DESC
      LIMIT 1`,
    [reference]
  );

  if (!ligne) {
    console.error(`\nAucun paiement pour la commande ${reference}.\n`);
    process.exit(1);
  }

  const age = Math.round((Date.now() - new Date(ligne.createdAt).getTime()) / 60000);
  console.log(`\n=== ${reference} — ${ligne.buyerName} ===\n`);
  console.log(`  paiement    : ${ligne.status} chez ${ligne.provider}`);
  console.log(`  montant     : ${ligne.amount} ${ligne.currency}`);
  console.log(`  encaisse    : ${ligne.collectedAmount ?? "—"} ${ligne.collectedCurrency ?? ""}`);
  console.log(`  simule      : ${ligne.simulatedOutcome ?? "non (mode reel)"}`);
  console.log(`  en attente  : depuis ${age} minutes`);
  console.log(`  commande    : ${ligne.statut_commande}\n`);

  if (!EN_ATTENTE.includes(ligne.status)) {
    /* Un paiement conclu — abouti, echoue, deja expire — ne se rouvre pas ici.
       C'est la garde qui empeche ce script de defaire un encaissement reel. */
    console.error(
      `Ce paiement n'est pas en attente (${ligne.status}) : rien a fermer.\n`
    );
    process.exit(1);
  }

  if (!appliquer) {
    console.log("  Rien n'est ecrit. Pour conclure ce dossier :");
    console.log(`    npm run paiement:expirer -- ${reference} --appliquer\n`);
    console.log("  ⚠ A ne faire qu'APRES avoir cherche cette reference dans");
    console.log("    l'historique iKeePay et ne l'y avoir PAS trouvee.\n");
    process.exit(0);
  }

  /* Ecriture conditionnelle sur l'etat de depart : un rappel arrive pendant
     qu'on lisait l'ecran a pu conclure le paiement, et l'expirer apres coup
     effacerait un encaissement abouti. */
  const fermes = await q(
    `UPDATE "Payment"
        SET status = 'EXPIRED', "failureReason" = $2, "lastCheckedAt" = now()
      WHERE id = $1 AND status = ANY($3::"PaymentStatus"[])
      RETURNING id`,
    [ligne.id, MOTIF, EN_ATTENTE]
  );

  if (fermes.length === 0) {
    console.error("Le paiement a change d'etat entre-temps : rien n'a ete ecrit.\n");
    process.exit(1);
  }

  await q(
    `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", metadata, "actorName", "actorRole", "createdAt")
     VALUES ($1, 'PAYMENT_EXPIRED_MANUALLY', 'Payment', $2, $3, 'Administration (outillage)', 'ADMIN', now())`,
    [
      `audit-exp-${Date.now().toString(36)}`,
      reference,
      JSON.stringify({
        motif: MOTIF,
        statutPrecedent: ligne.status,
        montant: ligne.amount,
        devise: ligne.currency,
        montantRecu: ligne.collectedAmount,
        deviseRecue: ligne.collectedCurrency,
      }),
    ]
  );

  console.log("  ✓ paiement ferme (EXPIRED) et conclusion consignee au journal.");
  console.log("  ✓ il disparait de /admin/rapprochement.\n");
} finally {
  await pool.end();
}
