import { PrismaClient, UserRole, UserStatus, SellerVerificationStatus, OrderStatus, PaymentStatus, PaymentProviderType, DeliveryStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { generateOrderReference } from "../lib/orders/reference";
import { formaterNumeroFacture } from "../lib/invoices/numero";
import { chargerEnv } from "../scripts/env.mjs";

// Lance directement (`npx tsx prisma/seed.ts`), ce fichier ne beneficie pas du
// chargement que Next fait pour l application : sans cette ligne il refuse de
// s executer en annoncant « DATABASE_URL manquant » alors que la valeur est
// dans `.env.local`. L ordre est celui de Next : la base locale d abord.
chargerEnv();

// Connexion DIRECTE de preference : le jeu de donnees supprime et recree des
// tables entieres, ce que le pooler en mode transaction supporte mal.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL manquant : le jeu de donnees initial refuse de s executer " +
      "sans savoir SUR QUELLE BASE il ecrit."
  );
}
const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting KOLI SaaS database seed...");

  // Clear existing data
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.disputeMessage.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.deliveryProof.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.fund.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  // §5.3 — les equipes et les invitations, AVANT les profils qui les portent.
  // Les deux cascadent depuis `SellerProfile`, donc ces lignes sont
  // techniquement superflues aujourd hui. On les ecrit quand meme : une
  // suppression qui compte sur une cascade se casse le jour ou la cascade
  // change, et elle se casse en silence, sur une base a moitie videe.
  await prisma.sellerDriver.deleteMany();
  await prisma.driverInvite.deleteMany();
  await prisma.kycDocument.deleteMany();
  await prisma.sellerProfile.deleteMany();
  await prisma.customerProfile.deleteMany();
  await prisma.driverProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.commission.deleteMany();

  // Create default settings & commissions
  await prisma.commission.create({
    data: {
      ratePercent: 5.0,
      isActive: true,
    },
  });

  await prisma.setting.createMany({
    data: [
      { key: "DEFAULT_COMMISSION_RATE", value: "5" },
      { key: "TEST_PAYMENT_ENABLED", value: "true" },
      { key: "PLATFORM_NAME", value: "KOLI" },
    ],
  });

  const defaultPasswordHash = await bcrypt.hash("Password123!", 10);

  // 1. Admin User
  const admin = await prisma.user.create({
    data: {
      name: "Administrateur KOLI",
      phone: "+2250700000000",
      email: "admin@koli.ci",
      passwordHash: defaultPasswordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  // 2. Seller User
  const sellerUser = await prisma.user.create({
    data: {
      name: "Boutique Chic Abidjan",
      phone: "+2250701020304",
      email: "vendeur@koli.ci",
      passwordHash: defaultPasswordHash,
      role: UserRole.SELLER,
      status: UserStatus.ACTIVE,
      sellerProfile: {
        create: {
          businessName: "Boutique Chic",
          verificationStatus: SellerVerificationStatus.VERIFIED,
        },
      },
    },
    include: { sellerProfile: true },
  });

  const sellerProfileId = sellerUser.sellerProfile!.id;

  // 2 bis. Un SECOND vendeur — pas un ornement.
  //
  // Plusieurs contrôles portent sur le cloisonnement : un vendeur ne doit voir
  // ni les factures, ni le journal financier, ni les clients d'un autre. Avec
  // un seul vendeur en base, ces contrôles n'avaient rien à comparer et le
  // disaient — « cloisonnement NON vérifié ». Un contrôle qui ne peut pas
  // échouer ne protège rien : la faille resterait invisible jusqu'au jour où
  // un vrai second vendeur s'inscrirait.
  const autreVendeur = await prisma.user.create({
    data: {
      name: "Maison Baoulé",
      phone: "+2250709080706",
      email: "vendeur2@koli.ci",
      passwordHash: defaultPasswordHash,
      role: UserRole.SELLER,
      status: UserStatus.ACTIVE,
      sellerProfile: {
        create: {
          businessName: "Maison Baoulé",
          verificationStatus: SellerVerificationStatus.VERIFIED,
        },
      },
    },
    include: { sellerProfile: true },
  });

  const autreSellerProfileId = autreVendeur.sellerProfile!.id;

  const pagne = await prisma.product.create({
    data: {
      sellerId: autreSellerProfileId,
      name: "Pagne Baoulé tissé main",
      description: "Pagne tissé à la main, motifs traditionnels baoulé.",
      category: "Mode",
      price: 32000,
      quantity: 6,
      weightKg: 0.6,
    },
  });

  // 3. Customer User
  const customerUser = await prisma.user.create({
    data: {
      name: "Awa Koné",
      phone: "+2250505050505",
      email: "client@koli.ci",
      passwordHash: defaultPasswordHash,
      role: UserRole.CLIENT,
      status: UserStatus.ACTIVE,
      customerProfile: {
        create: {
          city: "Abidjan",
          country: "Côte d'Ivoire",
          address: "Cocody Angré 8ème Tranche",
        },
      },
    },
    include: { customerProfile: true },
  });

  const customerProfileId = customerUser.customerProfile!.id;

  // 4. Driver User
  const driverUser = await prisma.user.create({
    data: {
      name: "Kouassi Express",
      phone: "+2250102030405",
      email: "livreur@koli.ci",
      passwordHash: defaultPasswordHash,
      role: UserRole.DRIVER,
      status: UserStatus.ACTIVE,
      driverProfile: {
        create: {
          vehicle: "Moto YBR 125 - Immatriculation AB-123-CI",
          zone: "Yopougon, Adjamé et Plateau",
          available: true,
        },
      },
    },
    include: { driverProfile: true },
  });

  const driverProfileId = driverUser.driverProfile!.id;

  // 4 bis. Les EQUIPES de livraison (§5.3).
  //
  // « Au debut, chaque vendeur peut utiliser son propre livreur. » Depuis que
  // cette phrase est implementee, un vendeur ne peut assigner QUE les livreurs
  // de son equipe — la liste ne renvoie plus tous les livreurs actifs de la
  // plateforme, et `assignDriverAction` refuse un livreur hors equipe.
  //
  // Sans ces deux lignes, le jeu de donnees produirait une base ou le parcours
  // du §80 s arrete a l assignation : « ce livreur ne fait pas partie de votre
  // equipe ». Le meme livreur sert aux deux vendeurs, ce qui est justement le
  // cas reel qu une table de jonction permet et qu un `sellerId` interdisait.
  await prisma.sellerDriver.createMany({
    data: [
      { sellerId: sellerProfileId, driverId: driverProfileId },
      { sellerId: autreSellerProfileId, driverId: driverProfileId },
    ],
  });

  // 5. Products
  const product1 = await prisma.product.create({
    data: {
      sellerId: sellerProfileId,
      name: "Robe Wax Traditionnelle",
      description: "Superbe robe sur mesure en tissu Wax 100% coton imprimé de qualité premium.",
      category: "Mode",
      price: 18500,
      quantity: 15,
      weightKg: 0.5,
      // Pas d'images : les chemins /images/products/*.jpg n'existent pas dans
      // public/, et le catalogue affichait donc des vignettes cassees.
    },
  });

  await prisma.product.create({
    data: {
      sellerId: sellerProfileId,
      name: "Sac en Cuir Artisanal",
      description: "Sac à main fait main en cuir véritable, fabrication artisanale locale.",
      category: "Accessoires",
      price: 25000,
      quantity: 8,
      weightKg: 0.8,
    },
  });

  // Un produit en rupture, pour que le comportement « stock epuise » soit
  // visible sans manipulation prealable.
  await prisma.product.create({
    data: {
      sellerId: sellerProfileId,
      name: "Sandales cuir tressé",
      description: "Sandales artisanales, pointures 38 à 42.",
      category: "Chaussures",
      price: 12000,
      quantity: 0,
      weightKg: 0.4,
    },
  });

  // 6. Commande de demonstration
  // La reference est generee comme en production : le format sequentiel
  // "KOLI-000124" ne passe plus la validation, la reference faisant desormais
  // office de capacite d'acces au lien de paiement (lib/orders/reference.ts).
  const order1 = await prisma.order.create({
    data: {
      reference: generateOrderReference(),
      sellerId: sellerProfileId,
      customerId: customerProfileId,
      buyerName: "Awa Koné",
      buyerPhone: "+2250505050505",
      buyerCountry: "Côte d'Ivoire",
      buyerCity: "Abidjan",
      buyerAddress: "Cocody Angré 8ème Tranche",
      buyerLandmark: "Près de la pharmacie du Soleil",
      deliveryFee: 2000,
      status: OrderStatus.FUNDS_SECURED,
      items: {
        create: [
          {
            productId: product1.id,
            quantity: 1,
            unitPrice: 18500,
          },
        ],
      },
      payment: {
        create: {
          provider: PaymentProviderType.TEST,
          status: PaymentStatus.SUCCEEDED,
          amount: 20500,
          simulatedOutcome: "SUCCESS",
          confirmedAt: new Date(),
        },
      },
      fund: {
        create: {
          sellerId: sellerProfileId,
          amount: 18500,
          secured: true,
          released: false,
          securedAt: new Date(),
        },
      },
      delivery: {
        create: {
          driverId: driverProfileId,
          status: DeliveryStatus.ASSIGNED,
          assignedAt: new Date(),
          otpCodes: {
            create: [
              {
                code: "4829",
              },
            ],
          },
        },
      },
      // §38 : toute commande reglee a une facture. Le seed ecrit la commande
      // directement, sans passer par `simulatePaymentAction` qui l'emet : sans
      // cette ligne, la commande de demonstration etait payee mais sans piece,
      // ce que le reste de l'application tient pour impossible.
      invoice: {
        create: { number: formaterNumeroFacture(new Date().getFullYear(), 1) },
      },
      statusHistory: {
        create: [
          { fromStatus: null, toStatus: OrderStatus.DRAFT, actorUserId: sellerUser.id },
          { fromStatus: OrderStatus.DRAFT, toStatus: OrderStatus.PAYMENT_PENDING, actorUserId: sellerUser.id },
          { fromStatus: OrderStatus.PAYMENT_PENDING, toStatus: OrderStatus.PAYMENT_CONFIRMED, actorUserId: customerUser.id },
          { fromStatus: OrderStatus.PAYMENT_CONFIRMED, toStatus: OrderStatus.FUNDS_SECURED, actorUserId: admin.id },
        ],
      },
    },
  });

  // 7. Une commande chez le SECOND vendeur.
  //
  // Le produit ne suffisait pas : les contrôles de cloisonnement cherchent une
  // COMMANDE appartenant à un concurrent, pour vérifier qu'elle n'apparaît ni
  // dans le journal financier, ni dans les factures du premier vendeur. Sans
  // elle, ils s'abstenaient — et un contrôle qui s'abstient ne prouve rien.
  await prisma.order.create({
    data: {
      reference: generateOrderReference(),
      sellerId: autreSellerProfileId,
      buyerName: "Kouadio Yao",
      buyerPhone: "+2250788990011",
      buyerCountry: "Côte d'Ivoire",
      buyerCity: "Bouaké",
      buyerAddress: "Quartier Air France",
      deliveryFee: 1500,
      status: OrderStatus.FUNDS_SECURED,
      items: {
        create: [{ productId: pagne.id, quantity: 1, unitPrice: 32000 }],
      },
      payment: {
        create: {
          provider: PaymentProviderType.TEST,
          status: PaymentStatus.SUCCEEDED,
          amount: 33500,
          simulatedOutcome: "SUCCESS",
          confirmedAt: new Date(),
        },
      },
      fund: {
        create: {
          sellerId: autreSellerProfileId,
          amount: 32000,
          secured: true,
          released: false,
          securedAt: new Date(),
        },
      },
      // Une livraison SANS livreur — comme en produisent les vraies commandes.
      //
      // `lib/orders/actions.ts` cree systematiquement la livraison en meme
      // temps que la commande, vide, en attente d assignation. Cette commande
      // de demonstration n en avait pas : elle etait donc dans un etat qu aucun
      // parcours reel ne produit, et `assignDriverAction` y echouait sur un
      // « enregistrement introuvable » plutot que sur ses propres regles.
      //
      // Un jeu de donnees qui fabrique des etats impossibles fait echouer les
      // controles pour de mauvaises raisons — ou pire, les fait passer.
      delivery: {
        create: {
          driverId: null,
          status: DeliveryStatus.UNASSIGNED,
          otpCodes: { create: [{ code: "7351" }] },
        },
      },
      invoice: {
        create: { number: formaterNumeroFacture(new Date().getFullYear(), 2) },
      },
    },
  });

  console.log("✅ Database seeded successfully!");
  console.log("-----------------------------------------");
  console.log("Comptes de démonstration (Mot de passe: Password123!) :");
  console.log(`- Admin:   ${admin.email} (${admin.phone})`);
  console.log(`- Vendeur: ${sellerUser.email} (${sellerUser.phone})`);
  console.log(`- Vendeur 2: ${autreVendeur.email} (${autreVendeur.phone}) — pour les controles de cloisonnement`);
  console.log(`- Client:  ${customerUser.email} (${customerUser.phone})`);
  console.log(`- Livreur: ${driverUser.email} (${driverUser.phone})`);
  console.log("-----------------------------------------");
  console.log(`Commande de test générée : ${order1.reference}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
