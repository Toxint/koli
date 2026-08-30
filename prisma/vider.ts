/**
 * VIDER — retirer les données de démonstration, garder l'application debout.
 *
 * `prisma/seed.ts` remplit la base de commandes, de paiements, de factures et
 * de transactions inventés. C'est ce qu'il faut pour la campagne de
 * vérification. Ce n'est pas ce qu'on veut avoir sous les yeux quand on regarde
 * le produit : le tableau de bord annonce alors des encaissements qui ne sont
 * ceux de personne, et on finit par les croire.
 *
 * Ce script les enlève. Les tableaux de bord repassent à zéro et affichent
 * leurs vrais états vides — « Aucun mouvement sur la période », « Créez votre
 * première commande » —, qui sont écrits et vérifiés mais qu'on ne voit jamais
 * tant que la démonstration les recouvre.
 *
 *   npm run base:vider              les mouvements, en gardant les comptes
 *   npm run base:vider -- --comptes les comptes de démonstration AUSSI
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  GARDE LES COMPTES par défaut, et ce n'est pas de la timidité : sans      │
 * │  eux, plus personne ne peut se connecter pour constater le résultat.      │
 * │  Les réglages et le taux de commission restent également — les retirer    │
 * │  ne « viderait » pas la base, il la casserait.                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ Il ne fait PAS la différence entre une commande de démonstration et une
 * vraie : il n'y en a aucune dans les données. À ne lancer que sur une base
 * dont on sait qu'elle ne porte rien de réel.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { chargerEnv } from "../scripts/env.mjs";

chargerEnv();

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL manquant : refus de vider une base sans savoir laquelle."
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const AUSSI_LES_COMPTES = process.argv.includes("--comptes");

async function main() {
  console.log(`\nBase visée : ${url!.replace(/:\/\/[^@]*@/, "://***@")}\n`);

  /*
   * L'ordre est celui des dépendances, des feuilles vers la racine.
   *
   * Plusieurs relations sont en `Restrict` ou en `SetNull` plutôt qu'en
   * cascade : supprimer une commande avant sa livraison échoue sur une
   * contrainte de clé étrangère. Les cascades existantes rendraient la moitié
   * de ces lignes superflues — on les garde toutes, parce qu'une suppression
   * qui compte sur une cascade se casse le jour où la cascade change, et
   * qu'elle se casse alors en silence, sur une base à moitié vidée.
   */
  const etapes: [string, () => Promise<{ count: number }>][] = [
    ["journal d'audit", () => prisma.auditLog.deleteMany()],
    ["notifications", () => prisma.notification.deleteMany()],
    ["messages de litige", () => prisma.disputeMessage.deleteMany()],
    ["litiges", () => prisma.dispute.deleteMany()],
    ["codes OTP", () => prisma.otpCode.deleteMany()],
    ["preuves de livraison", () => prisma.deliveryProof.deleteMany()],
    ["livraisons", () => prisma.delivery.deleteMany()],
    ["factures", () => prisma.invoice.deleteMany()],
    ["remboursements", () => prisma.refund.deleteMany()],
    ["fonds", () => prisma.fund.deleteMany()],
    ["transactions", () => prisma.transaction.deleteMany()],
    ["paiements", () => prisma.payment.deleteMany()],
    ["historique des statuts", () => prisma.orderStatusHistory.deleteMany()],
    ["lignes de commande", () => prisma.orderItem.deleteMany()],
    ["commandes", () => prisma.order.deleteMany()],
    ["images de produit", () => prisma.productImage.deleteMany()],
    ["produits", () => prisma.product.deleteMany()],
  ];

  if (AUSSI_LES_COMPTES) {
    etapes.push(
      // §5.3 — les équipes de livraison partent avec les comptes qu'elles
      // relient. Elles n'ont aucun sens sans eux.
      ["équipes de livraison", () => prisma.sellerDriver.deleteMany()],
      ["invitations livreur", () => prisma.driverInvite.deleteMany()],
      ["pièces KYC", () => prisma.kycDocument.deleteMany()],
      ["profils vendeur", () => prisma.sellerProfile.deleteMany()],
      ["profils client", () => prisma.customerProfile.deleteMany()],
      ["profils livreur", () => prisma.driverProfile.deleteMany()],
      ["comptes", () => prisma.user.deleteMany()]
    );
  }

  let total = 0;
  for (const [nom, executer] of etapes) {
    const { count } = await executer();
    total += count;
    if (count > 0) console.log(`  · ${count} ${nom}`);
  }

  console.log(`\n  ✓ ${total} enregistrement(s) supprimé(s)`);

  if (!AUSSI_LES_COMPTES) {
    const comptes = await prisma.user.count();
    console.log(
      `  · ${comptes} compte(s) conservé(s) — vous pouvez toujours vous connecter`
    );
  }

  /* Ce qui reste DOIT rester : sans commission active, la première commande
     échouerait sur une base qu'on croit propre. */
  const commission = await prisma.commission.findFirst({ where: { isActive: true } });
  console.log(
    commission
      ? `  · commission active à ${commission.ratePercent} % — conservée`
      : "  ! AUCUNE commission active : lancez `npm run base:amorcer`"
  );

  const restant = await prisma.order.count();
  console.log(
    restant === 0
      ? "\nLes tableaux de bord repartent de zéro.\n"
      : `\n! ${restant} commande(s) subsistent — la suppression n'a pas abouti.\n`
  );

  if (restant !== 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
