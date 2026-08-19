import { prisma } from "@/lib/db/prisma";
import { PayFlow } from "./pay-flow";

export default async function PayReferencePage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;

  // Recherche par reference uniquement : l'identifiant interne n'est pas cense
  // circuler, et c'est la reference qui fait office de capacite d'acces
  // (voir lib/payments/actions.ts).
  const dbOrder = await prisma.order.findUnique({
    where: { reference },
    include: {
      seller: { include: { user: true } },
      items: { include: { product: true } },
      payment: true,
      delivery: true,
    },
  });

  if (dbOrder) {
    const formattedOrder = {
      id: dbOrder.id,
      reference: dbOrder.reference,
      buyerName: dbOrder.buyerName,
      buyerPhone: dbOrder.buyerPhone,
      buyerCountry: dbOrder.buyerCountry,
      buyerCity: dbOrder.buyerCity,
      buyerAddress: dbOrder.buyerAddress,
      buyerLandmark: dbOrder.buyerLandmark,
      deliveryFee: dbOrder.deliveryFee,
      status: dbOrder.status,
      sellerName: dbOrder.seller.businessName || dbOrder.seller.user.name,
      items: dbOrder.items.map((item) => ({
        id: item.id,
        name: item.product.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
    };

    return (
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <PayFlow order={formattedOrder} />
      </main>
    );
  }

  // Commande introuvable
  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-3xl mx-auto">
          ⚠️
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Commande introuvable
        </h1>
        <p className="text-sm text-slate-500">
          La référence de commande <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-emerald-600">{reference}</code> n&apos;existe pas ou a expiré.
        </p>
      </div>
    </main>
  );
}
