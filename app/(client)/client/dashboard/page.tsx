import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { formatCFA } from "@/lib/format";
import Link from "next/link";

export default async function ClientDashboardPage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "CLIENT" && user.role !== "ADMIN")) {
    redirect("/connexion");
  }

  const customerProfileId = user.customerProfile?.id;

  const orders = customerProfileId
    ? await prisma.order.findMany({
        where: { customerId: customerProfileId },
        include: {
          items: { include: { product: true } },
          seller: true,
          payment: true,
          delivery: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <DashboardNav
        userName={user.name}
        roleName="Espace Client Acheteur"
        roleBadgeColor="bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300"
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-700 rounded-2xl p-6 sm:p-8 text-white shadow-xl shadow-purple-600/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Bienvenue, {user.name} 👋
            </h1>
            <p className="text-purple-100 text-sm mt-1">
              Retrouvez l'ensemble de vos achats sécurisés et suivez la livraison de vos colis en direct.
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl text-xs font-semibold">
            {orders.length} commande(s) effectuée(s)
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Vos commandes et achats sécurisés
          </h2>

          {orders.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8">
              <span className="text-4xl block mb-2">🛒</span>
              <p className="text-sm font-semibold">
                Vous n'avez effectué aucune commande pour le moment.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Lorsque vous effectuez un achat via un lien de paiement KOLI, il apparaît ici.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {orders.map((order) => {
                const totalAmount = order.items.reduce(
                  (acc, item) => acc + item.unitPrice * item.quantity,
                  order.deliveryFee
                );

                return (
                  <div
                    key={order.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                  >
                    <div>
                      <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {order.reference}
                      </span>
                      <h3 className="font-bold text-base text-slate-900 dark:text-white mt-0.5">
                        {order.items.map((i) => i.product.name).join(", ")}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Vendeur : {order.seller.businessName} • Statut : {order.status}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 self-end sm:self-auto">
                      <div className="text-right">
                        <span className="text-xs text-slate-400 block">Total payé</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-white">
                          {formatCFA(totalAmount)}
                        </span>
                      </div>

                      <Link
                        href={`/pay/${order.reference}`}
                        className="px-4 py-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-300 font-bold text-xs transition-all"
                      >
                        Suivi Commande 📦
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
