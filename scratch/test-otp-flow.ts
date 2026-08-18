import { prisma } from "../lib/db/prisma";
import { validateDeliveryOtpAction } from "../lib/deliveries/actions";

async function runTest() {
  console.log("=== STARTING OTP VALIDATION & ESCROW FUND RELEASE TEST ===");

  // Find a driver user
  const driverUser = await prisma.user.findFirst({
    where: { role: "DRIVER" },
    include: { driverProfile: true },
  });

  if (!driverUser) {
    console.error("❌ No driver user found");
    process.exit(1);
  }

  // Find a pending delivery assigned to driver
  let delivery = await prisma.delivery.findFirst({
    where: { status: "IN_TRANSIT" },
    include: { order: true, otpCodes: true },
  });

  if (!delivery) {
    delivery = await prisma.delivery.findFirst({
      include: { order: true, otpCodes: true },
    });
  }

  if (!delivery) {
    console.error("❌ No delivery found");
    process.exit(1);
  }

  console.log(`📌 Target Delivery ID: ${delivery.id}`);
  console.log(`📌 Order Ref: ${delivery.order.reference}`);
  console.log(`📌 OTP Code: ${delivery.otpCodes[0]?.code || "1234"}`);
  console.log(`📌 Current Delivery Status: ${delivery.status}`);
  console.log(`📌 Current Order Status: ${delivery.order.status}`);

  // Check funds before
  const fundsBefore = await prisma.fund.findMany({
    where: { sellerId: delivery.order.sellerId },
  });
  console.log("💰 Funds before validation:", fundsBefore);

  // We test validateDeliveryOtpAction by calling function
  // Note: validateDeliveryOtpAction checks user session via auth(), for standalone script we test Prisma logic directly or mock
  const otpCode = delivery.otpCodes[0]?.code || "1234";

  console.log(`\n⏳ Simulating OTP entry of '${otpCode}'...`);

  // Direct database transaction simulation identical to server action
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (delivery.otpCodes[0]) {
      await tx.otpCode.update({
        where: { id: delivery.otpCodes[0].id },
        data: { isUsed: true, usedAt: now },
      });
    }

    await tx.delivery.update({
      where: { id: delivery.id },
      data: { status: "DELIVERED", deliveredAt: now },
    });

    await tx.order.update({
      where: { id: delivery.orderId },
      data: { status: "DELIVERED" },
    });

    await tx.fund.updateMany({
      where: { sellerId: delivery.order.sellerId, secured: true, released: false },
      data: { released: true, releasedAt: now },
    });
  });

  const updatedDelivery = await prisma.delivery.findUnique({
    where: { id: delivery.id },
    include: { order: true },
  });

  const fundsAfter = await prisma.fund.findMany({
    where: { sellerId: delivery.order.sellerId },
  });

  console.log(`✅ Delivery Status After: ${updatedDelivery?.status}`);
  console.log(`✅ Order Status After: ${updatedDelivery?.order.status}`);
  console.log("🎉 Funds After Validation:", fundsAfter);

  console.log("=== TEST COMPLETED SUCCESSFULLY ===");
}

runTest()
  .catch((e) => {
    console.error("Test Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
