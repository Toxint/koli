import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { ValidateOtpModal } from "@/components/driver/ValidateOtpModal";

export default async function DriverDashboardPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DRIVER" || !user.driverProfile) {
    redirect("/connexion");
  }

  const driverProfileId = user.driverProfile.id;

  const deliveries = await prisma.delivery.findMany({
    where: { driverId: driverProfileId },
    include: {
      order: {
        include: {
          items: { include: { product: true } },
          seller: { include: { user: true } },
        },
      },
      // Volontairement PAS d'`otpCodes` ici : les charger cote serveur les
      // ferait transiter dans la charge utile envoyee au navigateur du livreur,
      // ou ils seraient lisibles. Le code n'appartient qu'au client (§27).
    },
    orderBy: { assignedAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-brand dark:text-white">
      <DashboardNav
        userName={user.name}
        roleName="Livreur"
        roleBadgeColor="bg-brand-soft text-brand dark:bg-amber-950/80 dark:text-amber-300 border border-brand-border dark:border-amber-700"
        homeHref="/livreur/dashboard"
        navItems={[{ label: "Mes livraisons", href: "/livreur/dashboard" }]}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
        {/* Or Doré Banner */}
        <div className="bg-brand rounded-3xl p-6 sm:p-8 text-white shadow-lg shadow-brand/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden border border-brand-border/40">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/20 text-white mb-2">
              ⚡ Espace Livreur KOLI
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Bienvenue, {user.name} 🛵
            </h1>
            <p className="text-white/90 text-xs sm:text-sm font-medium mt-1">
              Véhicule : <strong className="font-bold">{user.driverProfile.vehicle || "Moto KOLI Express"}</strong> • Numéro Vendeur & Client disponibles ci-dessous.
            </p>
          </div>
          <div className="bg-white text-brand backdrop-blur-md px-4 py-2.5 rounded-2xl text-xs font-semibold border border-white/30 shadow-lg shrink-0 relative z-10">
            {deliveries.length} livraison(s) enregistrée(s)
          </div>
        </div>

        {/* Deliveries list */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
              <span>📋</span> Vos courses & livraisons en cours
            </h2>
          </div>

          {deliveries.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900 border border-hairline dark:border-slate-800 rounded-3xl p-8 shadow-sm">
              <span className="text-5xl block mb-3 animate-float">🛵</span>
              <h3 className="text-base font-bold dark:text-white">
                Aucune livraison en attente
              </h3>
              <p className="text-xs text-ink-muted max-w-md mx-auto mt-1">
                Les nouvelles commandes à livrer apparaîtront automatiquement dès qu&apos;un vendeur vous en assignera une.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {deliveries.map((delivery) => {
                const order = delivery.order;
                // Aucun montant n'est calcule ici : §25 interdit d'exposer au
                // livreur des informations financieres qui ne lui servent pas.
                const isDelivered = delivery.status === "CONFIRMED";

                return (
                  <div
                    key={delivery.id}
                    className="bg-white dark:bg-slate-900 rounded-3xl border border-hairline/80 dark:border-slate-800 p-6 sm:p-7 shadow-lg shadow-slate-200/40 dark:shadow-none space-y-5 transition-all hover:border-amber-400/50"
                  >
                    {/* Header */}
                    <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                        <span className="shrink-0 px-3 py-1 rounded-xl text-xs font-mono font-bold bg-brand-soft text-brand dark:bg-amber-950 dark:text-amber-300 border border-brand-border/60 dark:border-amber-700">
                          {order.reference}
                        </span>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-base dark:text-white break-words">
                            Client : {order.buyerName}
                          </h3>
                          {/* Lien telephonique : le livreur appelle d'un tap
                              plutot que de recopier le numero a la main. */}
                          <a
                            href={`tel:${order.buyerPhone.replace(/\s/g, "")}`}
                            className="inline-flex items-center min-h-[44px] text-xs text-ink-muted dark:text-slate-400 font-medium whitespace-nowrap hover:text-brand"
                          >
                            📞 {order.buyerPhone}
                          </a>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            isDelivered
                              ? "bg-brand-soft text-brand dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-brand-soft text-brand dark:bg-amber-950 dark:text-amber-300 border border-brand-border/50"
                          }`}
                        >
                          {isDelivered ? "✅ LIVRÉE" : "⏳ EN COURS DE LIVRAISON"}
                        </span>
                      </div>
                    </div>

                    {/* Delivery details grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div className="bg-white dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1">
                        <span className="text-[11px] font-semibold text-brand dark:text-amber-400 uppercase tracking-wider block">
                          📍 Adresse de Livraison Client
                        </span>
                        <p className="font-bold text-brand dark:text-slate-100">
                          {order.buyerAddress}, {order.buyerCity}
                        </p>
                        <p className="text-xs text-ink-muted">
                          Pays : {order.buyerCountry}
                        </p>
                        {order.buyerLandmark && (
                          <p className="text-xs text-brand dark:text-amber-400 font-medium bg-brand-soft dark:bg-amber-950/50 px-2 py-1 rounded-lg inline-block mt-1 border border-brand-border dark:border-amber-800">
                            Repère : {order.buyerLandmark}
                          </p>
                        )}
                      </div>

                      <div className="bg-white dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1">
                        <span className="text-[11px] font-semibold text-brand dark:text-amber-400 uppercase tracking-wider block">
                          🏬 Vendeur Expéditeur
                        </span>
                        <p className="font-bold text-brand dark:text-slate-100">
                          {order.seller.businessName || order.seller.user.name}
                        </p>
                        <a
                          href={`tel:${order.seller.user.phone.replace(/\s/g, "")}`}
                          className="inline-flex items-center min-h-[44px] text-xs text-ink-muted dark:text-slate-400 whitespace-nowrap hover:text-brand"
                        >
                          Tél vendeur :&nbsp;
                          <strong className="text-brand dark:text-slate-200">
                            {order.seller.user.phone}
                          </strong>
                        </a>
                        <p className="text-xs text-ink-muted mt-1">
                          Article : {order.items[0]?.product.name || "Colis KOLI"} (x{order.items[0]?.quantity || 1})
                        </p>
                      </div>
                    </div>

                    {/* Footer CTA & OTP Validation Modal */}
                    <div className="flex flex-wrap justify-between items-center pt-3 gap-4 border-t border-slate-100 dark:border-slate-800">
                      {/* §25 : ne jamais afficher au livreur d'informations
                          financieres inutiles. La commande est deja payee et
                          sequestree — le livreur n'encaisse rien, le montant
                          n'a donc aucune utilite operationnelle pour lui. */}
                      <div>
                        <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider block">
                          Paiement
                        </span>
                        <span className="text-sm font-bold text-brand dark:text-emerald-400">
                          Déjà réglé — rien à encaisser
                        </span>
                      </div>

                      {/* Interactive OTP Validation Modal */}
                      <ValidateOtpModal
                        deliveryId={delivery.id}
                        orderReference={order.reference}
                        buyerName={order.buyerName}
                        isDelivered={isDelivered}
                      />
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
