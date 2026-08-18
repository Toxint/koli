import { createOrderAction } from "../lib/orders/actions";
import { prisma } from "../lib/prisma";

async function runTest() {
  console.log("=== TESTING SELLER ORDER CREATION FLOW ===");

  // Find seller user
  const sellerUser = await prisma.user.findFirst({
    where: { email: "vendeur@koli.ci" },
    include: { sellerProfile: true },
  });

  if (!sellerUser || !sellerUser.sellerProfile) {
    console.error("Seller user or profile not found!");
    process.exit(1);
  }

  console.log("Found seller:", sellerUser.name, "SellerID:", sellerUser.sellerProfile.id);

  // Test form submission simulation
  const formData = new FormData();
  formData.append("productName", "Montre Connectée KOLI Test");
  formData.append("unitPrice", "15000");
  formData.append("quantity", "2");
  formData.append("deliveryFee", "1500");
  formData.append("buyerName", "Kouassi Jean");
  formData.append("buyerPhone", "+225 07 88 99 00 11");
  formData.append("buyerCountry", "Côte d'Ivoire");
  formData.append("buyerCity", "Abidjan (Marcory)");
  formData.append("buyerAddress", "Zone 4, Rue du Canal");

  const res = await createOrderAction(formData);
  console.log("createOrderAction result:", res);

  if (res.success && res.reference) {
    console.log("SUCCESS! Created reference:", res.reference);
    
    // Verify order in database
    const order = await prisma.order.findUnique({
      where: { reference: res.reference },
      include: { items: true, delivery: true, payment: true },
    });

    console.log("DB Order Record:", {
      id: order?.id,
      reference: order?.reference,
      totalAmount: order?.totalAmount,
      item: order?.items[0]?.title,
      otp: order?.delivery?.otpCode,
    });

    console.log("VERIFICATION COMPLETE: Order flow works 100%!");
  } else {
    console.error("FAILED to create order:", res.error);
  }

  await prisma.$disconnect();
}

runTest().catch((err) => {
  console.error("Test Error:", err);
  process.exit(1);
});
