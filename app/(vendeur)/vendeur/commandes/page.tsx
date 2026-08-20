import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { formatCFA } from "@/lib/format";
import Link from "next/link";

export default async function SellerOrdersPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  const orders = await prisma.order.findMany({
    where: { sellerId: user.sellerProfile.id },
    include: {
      items: { include: { product: true } },
      payment: true,
      delivery: { include: { otpCodes: true } },
      fund: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <DashboardNav
        userName={user.sellerProfile.businessName || user.name}
        roleName="Vendeur"
        homeHref="/vendeur/dashboard"
        navItems={[
          { label: "Tableau de bord", href: "/vendeur/dashboard" },
          { label: "Commandes", href: "/vendeur/commandes" },
          { label: "Nouvelle commande", href: "/vendeur/commandes/nouvelle" },
        ]}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Gestion de vos commandes
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {orders.length} commande(s) générée(s)
            </p>
          </div>

          <Link
            href="/vendeur/commandes/nouvelle"
            className="min-h-[48px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
          >
            <span>+ Créer une commande</span>
          </Link>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          {orders.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl block mb-2">📦</span>
              <p className="text-sm font-semibold">Aucune commande enregistrée</p>
            </div>
          ) : (
            <div className="space-y-4 divide-y divide-slate-100 dark:divide-slate-800">
              {orders.map((order) => {
                const totalAmount = order.items.reduce(
                  (acc, item) => acc + item.unitPrice * item.quantity,
                  order.deliveryFee
                );

                return (
                  <div key={order.id} className="pt-4 first:pt-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-600 text-sm">
                          {order.reference}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          {order.status}
                        </span>
                      </div>
                      <h3 className="font-bold text-base mt-1">
                        Client : {order.buyerName} ({order.buyerPhone})
                      </h3>
                      <p className="text-xs text-slate-500">
                        {order.buyerAddress}, {order.buyerCity}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-xs text-slate-400 block">Total</span>
                        <span className="text-base font-extrabold">{formatCFA(totalAmount)}</span>
                      </div>

                      <Link
                        href={`/pay/${order.reference}`}
                        aria-label={`Ouvrir le lien de paiement de la commande ${order.reference}`}
                        className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 text-xs font-bold transition-all"
                      >
                        Lien 🔗
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
