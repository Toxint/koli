import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { NAV_CLIENT } from "@/lib/navigation";
import { formatCFA } from "@/lib/format";
import { libelleStatut, classesBadgeStatut } from "@/lib/orders/statusLabels";
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
    <div className="min-h-screen bg-white dark:bg-slate-950 text-brand dark:text-white">
      <DashboardNav
        userName={user.name}
        roleName="Client"
        roleBadgeColor="bg-brand-soft text-brand dark:bg-purple-950/80 dark:text-purple-300"
        homeHref="/client/dashboard"
        navItems={NAV_CLIENT}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Sur un aplat d'or vif, le texte doit etre l'or profond : le blanc
            n'y offre que 1:1 de contraste, soit un texte invisible. */}
        <div className="bg-brand rounded-2xl p-6 sm:p-8 text-white shadow-lg shadow-brand/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              Bienvenue, {user.name} 👋
            </h1>
            <p className="text-white/90 text-sm mt-1">
              Retrouvez l&apos;ensemble de vos achats sécurisés et suivez la livraison de vos colis en direct.
            </p>
          </div>
          <div className="bg-white/20 px-4 py-2 rounded-xl text-xs font-semibold text-white">
            {orders.length} commande(s) effectuée(s)
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-bold dark:text-white">
            Vos commandes et achats sécurisés
          </h2>

          {orders.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900 border border-hairline dark:border-slate-800 rounded-2xl p-8">
              <span className="text-4xl block mb-2">🛒</span>
              <p className="text-sm font-semibold">
                Vous n&apos;avez effectué aucune commande pour le moment.
              </p>
              <p className="text-xs text-ink-muted mt-1">
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
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-hairline dark:border-slate-800 p-6 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                  >
                    <div>
                      <span className="text-xs font-mono font-bold text-brand dark:text-emerald-400">
                        {order.reference}
                      </span>
                      <h3 className="font-bold text-base dark:text-white mt-0.5">
                        {order.items.map((i) => i.product.name).join(", ")}
                      </h3>
                      <p className="text-xs text-ink-muted dark:text-slate-400 mt-1">
                        Vendeur : {order.seller.businessName}
                      </p>
                      <span
                        className={`inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${classesBadgeStatut(order.status)}`}
                      >
                        {libelleStatut(order.status)}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 self-end sm:self-auto">
                      <div className="text-right">
                        <span className="text-xs text-ink-muted block">Total payé (test)</span>
                        <span className="text-lg font-bold text-brand dark:text-white">
                          {formatCFA(totalAmount)}
                        </span>
                      </div>

                      <Link
                        href={`/pay/${order.reference}`}
                        aria-label={`Suivre la commande ${order.reference}`}
                        className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-brand-soft text-brand hover:brightness-95 dark:bg-purple-950 dark:text-purple-300 font-bold text-xs transition-all whitespace-nowrap"
                      >
                        Suivi 📦
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
