import { PrismaClient, UserRole, UserStatus, SellerVerificationStatus, OrderStatus, PaymentStatus, PaymentProviderType, DeliveryStatus } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL || "file:./prisma/dev.db";
const adapter = new PrismaBetterSqlite3({ url });
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
        },
      },
    },
    include: { driverProfile: true },
  });

  const driverProfileId = driverUser.driverProfile!.id;

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
      images: {
        create: [
          { url: "/images/products/robe-wax.jpg", position: 0 },
        ],
      },
    },
  });

  const product2 = await prisma.product.create({
    data: {
      sellerId: sellerProfileId,
      name: "Sac en Cuir Artisanal",
      description: "Sac à main fait main en cuir véritable, fabrication artisanale locale.",
      category: "Accessoires",
      price: 25000,
      quantity: 8,
      weightKg: 0.8,
      images: {
        create: [
          { url: "/images/products/sac-cuir.jpg", position: 0 },
        ],
      },
    },
  });

  // 6. Demo Orders
  // Order 1: Initial test order matching KOLI-000124
  const order1 = await prisma.order.create({
    data: {
      reference: "KOLI-000124",
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

  console.log("✅ Database seeded successfully!");
  console.log("-----------------------------------------");
  console.log("Comptes de démonstration (Mot de passe: Password123!) :");
  console.log(`- Admin:   ${admin.email} (${admin.phone})`);
  console.log(`- Vendeur: ${sellerUser.email} (${sellerUser.phone})`);
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
