/**
 * Retirer d une base Supabase EN SERVICE ce qui n a rien a y faire.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  A ne pas confondre avec `prisma/vider.ts`, son equivalent LOCAL.        │
 * │                                                                          │
 * │  `prisma/vider.ts`         Prisma, base locale, 20 appels successifs.    │
 * │  `nettoyer-supabase.mjs`   SQL brut, par le pooler, UNE transaction.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ── Pourquoi un second outil ────────────────────────────────────────────────
 *
 * Deux raisons, et la seconde est la vraie.
 *
 *   1. `prisma/vider.ts` VIDE TOUT ou GARDE TOUT. Son option `--comptes`
 *      supprime l integralite des comptes. Sur une base en service, il fallait
 *      retirer CINQ comptes de demonstration nommes, et laisser intacts les
 *      trois comptes reels deja inscrits. Aucune option ne le permettait, et
 *      un lancement aveugle aurait detruit les comptes des utilisateurs.
 *
 *   2. Vingt `deleteMany` successifs, c est vingt occasions de s interrompre —
 *      et le VPN de ce poste porte l aller-retour vers Supabase a une seconde
 *      (§5 de CLAUDE.md). Une base a moitie videe est PIRE qu une base
 *      intacte : il reste des factures sans commande, des transactions sans
 *      paiement, et plus personne ne sait ce qui a ete retire.
 *
 * D ou ce script : UNE transaction, tout passe ou rien.
 *
 * ⚠ Ce qui n est PAS la raison, malgre les apparences. Un premier lancement de
 * `prisma/vider.ts` contre Supabase a expire au bout de six minutes quarante
 * sans supprimer une ligne, et il etait tentant d en conclure que Prisma ne
 * passe pas par le pooler. C est faux : `prisma/amorce.ts` y passe en quelques
 * secondes, et `pgbouncer=true` figure deja dans l adresse. Le fautif etait
 * l EXTRACTION de l adresse par `sed` dans la ligne de commande, qui rendait
 * une valeur inexploitable. Le diagnostic facile aurait fait reecrire tout
 * l outillage Prisma pour rien.
 *
 * ── Ce qu il fait, et ce qu il ne fait pas ──────────────────────────────────
 *
 *   Il SUPPRIME  les mouvements — commandes, paiements, transactions,
 *                factures, livraisons, litiges, produits, notifications,
 *                journal d audit.
 *   Il SUPPRIME  les comptes nommes par `--comptes=a@b,c@d`, et eux seuls.
 *   Il GARDE     tous les autres comptes, les reglages, la commission.
 *
 * Il ne devine JAMAIS quels comptes sont jetables : la liste est donnee a la
 * main. Un « supprime les comptes de demonstration » qui se fonde sur le
 * domaine de l adresse effacerait un vrai client le jour ou quelqu un
 * s inscrira avec une adresse qui y ressemble.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   node scripts/nettoyer-supabase.mjs --etat
 *   node scripts/nettoyer-supabase.mjs --mouvements
 *   node scripts/nettoyer-supabase.mjs --mouvements --comptes=admin@koli.ci,vendeur@koli.ci
 *
 * Sans `--mouvements` ni `--comptes`, il ne fait qu afficher l etat : on ne
 * detruit rien par defaut, ni par inadvertance.
 *
 * Il lit `.env` SEUL, jamais `.env.local` — meme exception deliberee que
 * `preparer-supabase.mjs`. Un script qui viderait la base locale en croyant
 * viser Supabase serait une gene ; l inverse serait une catastrophe.
 */
import fs from "node:fs";
import pg from "pg";

const args = process.argv.slice(2);
const MOUVEMENTS = args.includes("--mouvements");
const COMPTES = (args.find((a) => a.startsWith("--comptes=")) ?? "")
  .replace("--comptes=", "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

if (!fs.existsSync(".env")) {
  console.error("\n  .env introuvable — c est lui qui designe la base Supabase.\n");
  process.exit(1);
}
const brut = fs.readFileSync(".env", "utf8");
const lire = (c) => brut.match(new RegExp(`^${c}\\s*=\\s*"?([^"\\n]+)"?`, "m"))?.[1] ?? null;

// Le POOLER de preference : c est l inverse du reste du projet, et pour la
// raison inverse — ici c est la connexion directe qui est hors d atteinte.
const url = lire("DATABASE_URL") ?? lire("DIRECT_URL");
if (!url) {
  console.error("\n  DATABASE_URL absent de .env.\n");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 20000 });
await client.connect();

console.log(`\nBase visee : ${url.match(/@([^:/]+)/)?.[1] ?? "?"}\n`);

async function etat(titre) {
  console.log(`  ── ${titre} ──`);
  const { rows } = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM "User")::int         AS comptes,
      (SELECT COUNT(*) FROM "Order")::int        AS commandes,
      (SELECT COUNT(*) FROM "Product")::int      AS produits,
      (SELECT COUNT(*) FROM "Transaction")::int  AS transactions,
      (SELECT COUNT(*) FROM "Invoice")::int      AS factures,
      (SELECT COUNT(*) FROM "Payment")::int      AS paiements`);
  const r = rows[0];
  console.log(
    `  ${r.comptes} compte(s) · ${r.commandes} commande(s) · ${r.produits} produit(s) · ` +
      `${r.transactions} transaction(s) · ${r.factures} facture(s) · ${r.paiements} paiement(s)`
  );
  return r;
}

await etat("AVANT");

if (!MOUVEMENTS && COMPTES.length === 0) {
  console.log("\n  Aucune action demandee — rien n a ete touche.");
  console.log("  Ajoutez --mouvements et/ou --comptes=a@b,c@d.\n");
  await client.end();
  process.exit(0);
}

/*
 * L ordre va des FEUILLES vers la racine.
 *
 * Plusieurs relations ne sont pas en cascade : supprimer une commande avant sa
 * livraison echoue sur une contrainte de cle etrangere. Les cascades qui
 * existent rendent une partie de ces lignes superflue — on les ecrit quand
 * meme, parce qu une suppression qui compte sur une cascade se casse le jour
 * ou la cascade change, et qu elle se casse en silence.
 */
const MOUVEMENT = [
  ['journal d audit', 'DELETE FROM "AuditLog"'],
  ["notifications", 'DELETE FROM "Notification"'],
  ["messages de litige", 'DELETE FROM "DisputeMessage"'],
  ["litiges", 'DELETE FROM "Dispute"'],
  ["codes OTP", 'DELETE FROM "OtpCode"'],
  ["preuves de livraison", 'DELETE FROM "DeliveryProof"'],
  ["livraisons", 'DELETE FROM "Delivery"'],
  ["factures", 'DELETE FROM "Invoice"'],
  ["remboursements", 'DELETE FROM "Refund"'],
  ["fonds", 'DELETE FROM "Fund"'],
  ["transactions", 'DELETE FROM "Transaction"'],
  ["paiements", 'DELETE FROM "Payment"'],
  ["historique des statuts", 'DELETE FROM "OrderStatusHistory"'],
  ["lignes de commande", 'DELETE FROM "OrderItem"'],
  ["commandes", 'DELETE FROM "Order"'],
  ["images de produit", 'DELETE FROM "ProductImage"'],
  ["produits", 'DELETE FROM "Product"'],
];

try {
  await client.query("BEGIN");

  if (MOUVEMENTS) {
    console.log("\n  ── mouvements ──");
    for (const [nom, sql] of MOUVEMENT) {
      const r = await client.query(sql);
      if (r.rowCount > 0) console.log(`  · ${r.rowCount} ${nom}`);
    }
  }

  if (COMPTES.length > 0) {
    console.log("\n  ── comptes nommes ──");
    // Les profils et les equipes cascadent depuis `User`. On les retire quand
    // meme explicitement, meme raison que plus haut.
    const r = await client.query(
      `DELETE FROM "User" WHERE lower(email) = ANY($1::text[]) RETURNING email, role`,
      [COMPTES]
    );
    for (const u of r.rows) console.log(`  · ${u.role} ${u.email}`);

    const absents = COMPTES.filter(
      (e) => !r.rows.some((u) => String(u.email).toLowerCase() === e)
    );
    for (const e of absents) console.log(`  ~ ${e} — introuvable, rien a supprimer`);
  }

  await client.query("COMMIT");
  console.log("\n  ✓ transaction validee");
} catch (e) {
  await client.query("ROLLBACK");
  console.error(`\n  ✗ echec : ${e.message}`);
  console.error("  La transaction est ANNULEE : la base est exactement comme avant.\n");
  await client.end();
  process.exit(1);
}

console.log("");
const apres = await etat("APRES");

/* Ce qui DOIT rester : sans commission active, la premiere commande echouerait
   sur une base qu on croit propre. */
const { rows: com } = await client.query(
  `SELECT "ratePercent" FROM "Commission" WHERE "isActive" = true LIMIT 1`
);
console.log(
  com.length > 0
    ? `  commission active a ${com[0].ratePercent} % — conservee`
    : "  ! AUCUNE commission active : lancez l amorce"
);

if (apres.commandes === 0) {
  console.log("\n  Les tableaux de bord partent de zero.\n");
} else {
  console.log(`\n  ${apres.commandes} commande(s) subsistent.\n`);
}

await client.end();
