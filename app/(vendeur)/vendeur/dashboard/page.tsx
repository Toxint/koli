import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { formatCFA } from "@/lib/format";
import { libelleStatut, classesBadgeStatut } from "@/lib/orders/statusLabels";
import Link from "next/link";

export default async function SellerDashboardPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  const sellerProfileId = user.sellerProfile.id;

  // Fetch metrics & orders from database
  const productsCount = await prisma.product.count({
    where: { sellerId: sellerProfileId },
  });

  const orders = await prisma.order.findMany({
    where: { sellerId: sellerProfileId },
    include: {
      items: { include: { product: true } },
      fund: true,
      payment: true,
      delivery: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const totalOrdersCount = await prisma.order.count({
    where: { sellerId: sellerProfileId },
  });

  // Calculate funds (Test mode)
  const funds = await prisma.fund.findMany({
    where: { sellerId: sellerProfileId },
  });

  const securedAmount = funds
    .filter((f) => f.secured && !f.released)
    .reduce((acc, f) => acc + f.amount, 0);

  const releasedAmount = funds
    .filter((f) => f.released)
    .reduce((acc, f) => acc + f.amount, 0);

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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
        {/* Banner Or Doré */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-600 rounded-3xl p-6 sm:p-8 text-slate-950 shadow-xl shadow-amber-500/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden border border-amber-300/40">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-yellow-200/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-slate-950/10 text-slate-950 mb-2">
              🛍️ Espace Vendeur KOLI
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950">
              Bonjour, {user.sellerProfile.businessName || user.name} 👋
            </h1>
            <p className="text-slate-900 text-xs sm:text-sm font-semibold mt-1">
              Gérez vos ventes, générez des liens de paiement sécurisés KOLI et suivez vos livraisons.
            </p>
          </div>
          <div className="flex gap-3 relative z-10">
            <Link
              href="/vendeur/commandes/nouvelle"
              className="w-full sm:w-auto min-h-[48px] px-5 rounded-2xl bg-slate-950 text-amber-400 hover:text-amber-300 font-extrabold text-xs uppercase tracking-wider shadow-xl shadow-slate-950/30 active:scale-[0.98] transition-all border border-amber-400/40 flex items-center justify-center gap-2 text-center"
            >
              <span>+ Créer une commande</span>
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm hover:border-amber-400/50 transition-all">
            <span className="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-1">
              Fonds sécurisés (test)
            </span>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {formatCFA(securedAmount)}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              En attente de confirmation de réception par le client
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm hover:border-emerald-400/50 transition-all">
            <span className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block mb-1">
              Solde disponible (test)
            </span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {formatCFA(releasedAmount)}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Libéré après confirmation de réception par le client
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Total Commandes
            </span>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {totalOrdersCount}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Commandes enregistrées
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Produits en Catalogue
            </span>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {productsCount}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Articles actifs dans votre stock
            </p>
          </div>
        </div>

        {/* Recent Orders Section */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          <div className="flex flex-wrap justify-between items-center gap-x-4 gap-y-2 mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Commandes récentes
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Suivi des transactions KOLI (mode test)
              </p>
            </div>
            <Link
              href="/vendeur/commandes"
              className="inline-flex items-center min-h-[44px] text-xs font-semibold text-emerald-600 hover:text-emerald-500"
            >
              Voir toutes les commandes →
            </Link>
          </div>

          {orders.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <span className="text-4xl block mb-2">📦</span>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Aucune commande enregistrée pour l&apos;instant
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Créez votre première commande pour générer un lien de paiement KOLI.
              </p>
            </div>
          ) : (
            /* §8 et §68 : sur mobile, les tableaux deviennent des cartes.
               Le tableau a 5 colonnes demandait ~500px pour une carte de 240px :
               plus de la moitie de chaque ligne sortait de l'ecran. */
            <ul className="space-y-3 md:space-y-0 md:divide-y md:divide-slate-100 md:dark:divide-slate-800/60">
              {/* En-tetes, uniquement a partir de la tablette. */}
              <li className="hidden md:grid md:grid-cols-[1.2fr_1.4fr_1fr_1fr_auto] md:gap-4 md:pb-3 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <span>Référence</span>
                <span>Client</span>
                <span>Statut</span>
                <span>Montant</span>
                <span className="text-right">Lien</span>
              </li>

              {orders.map((order) => {
                const totalAmount = order.items.reduce(
                  (acc, item) => acc + item.unitPrice * item.quantity,
                  order.deliveryFee
                );

                return (
                  <li
                    key={order.id}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 md:border-0 md:rounded-none md:p-0 md:py-4 md:grid md:grid-cols-[1.2fr_1.4fr_1fr_1fr_auto] md:gap-4 md:items-center"
                  >
                    <div className="flex flex-wrap items-center gap-2 md:block">
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 break-all">
                        {order.reference}
                      </span>
                      <span
                        className={`md:hidden inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${classesBadgeStatut(order.status)}`}
                      >
                        {libelleStatut(order.status)}
                      </span>
                    </div>

                    <div className="mt-2 md:mt-0 min-w-0">
                      <span className="block font-medium text-slate-900 dark:text-white break-words">
                        {order.buyerName}
                      </span>
                      <a
                        href={`tel:${order.buyerPhone.replace(/\s/g, "")}`}
                        className="inline-flex items-center min-h-[44px] md:min-h-0 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap hover:text-emerald-700"
                      >
                        {order.buyerPhone}
                      </a>
                    </div>

                    <div className="hidden md:block">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classesBadgeStatut(order.status)}`}
                      >
                        {libelleStatut(order.status)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 md:block">
                      <span className="text-xs text-slate-600 dark:text-slate-400 md:hidden">
                        Montant
                      </span>
                      <span className="font-bold whitespace-nowrap">
                        {formatCFA(totalAmount)}
                      </span>
                    </div>

                    <div className="mt-3 md:mt-0 md:text-right">
                      <Link
                        href={`/pay/${order.reference}`}
                        aria-label={`Ouvrir le lien de paiement de la commande ${order.reference}`}
                        className="inline-flex items-center justify-center w-full md:w-auto min-h-[44px] px-3 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 text-xs font-bold transition-all"
                      >
                        Partager le lien 🔗
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
