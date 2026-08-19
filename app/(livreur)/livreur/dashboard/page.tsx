import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { formatCFA } from "@/lib/format";
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <DashboardNav
        userName={user.name}
        roleName="Espace Livreur"
        roleBadgeColor="bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
        {/* Or Doré Banner */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-600 rounded-3xl p-6 sm:p-8 text-slate-950 shadow-xl shadow-amber-500/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden border border-amber-300/40">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-yellow-300/20 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-slate-950/10 text-slate-950 mb-2">
              ⚡ Espace Livreur KOLI
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950">
              Bienvenue, {user.name} 🛵
            </h1>
            <p className="text-slate-900 text-xs sm:text-sm font-medium mt-1">
              Véhicule : <strong className="font-bold">{user.driverProfile.vehicle || "Moto KOLI Express"}</strong> • Numéro Vendeur & Client disponibles ci-dessous.
            </p>
          </div>
          <div className="bg-slate-950/90 text-amber-400 backdrop-blur-md px-4 py-2.5 rounded-2xl text-xs font-extrabold border border-amber-400/30 shadow-lg shrink-0 relative z-10">
            {deliveries.length} livraison(s) enregistrée(s)
          </div>
        </div>

        {/* Deliveries list */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>📋</span> Vos courses & livraisons en cours
            </h2>
          </div>

          {deliveries.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm">
              <span className="text-5xl block mb-3 animate-float">🛵</span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Aucune livraison en attente
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Les nouvelles commandes à livrer apparaîtront automatiquement dès qu&apos;un vendeur vous en assignera une.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {deliveries.map((delivery) => {
                const order = delivery.order;
                const totalAmount = order.items.reduce(
                  (acc, item) => acc + item.unitPrice * item.quantity,
                  order.deliveryFee
                );
                const isDelivered = delivery.status === "CONFIRMED";

                return (
                  <div
                    key={delivery.id}
                    className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-7 shadow-lg shadow-slate-200/40 dark:shadow-none space-y-5 transition-all hover:border-amber-400/50"
                  >
                    {/* Header */}
                    <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 rounded-xl text-xs font-mono font-black bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700">
                          {order.reference}
                        </span>
                        <div>
                          <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                            Client : {order.buyerName}
                          </h3>
                          <span className="text-xs text-slate-500 font-medium">
                            📞 {order.buyerPhone}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-extrabold ${
                            isDelivered
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300/50"
                          }`}
                        >
                          {isDelivered ? "✅ LIVRÉE" : "⏳ EN COURS DE LIVRAISON"}
                        </span>
                      </div>
                    </div>

                    {/* Delivery details grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1">
                        <span className="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                          📍 Adresse de Livraison Client
                        </span>
                        <p className="font-bold text-slate-900 dark:text-slate-100">
                          {order.buyerAddress}, {order.buyerCity}
                        </p>
                        <p className="text-xs text-slate-500">
                          Pays : {order.buyerCountry}
                        </p>
                        {order.buyerLandmark && (
                          <p className="text-xs text-amber-700 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/50 px-2 py-1 rounded-lg inline-block mt-1 border border-amber-200 dark:border-amber-800">
                            Repère : {order.buyerLandmark}
                          </p>
                        )}
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1">
                        <span className="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                          🏬 Vendeur Expéditeur
                        </span>
                        <p className="font-bold text-slate-900 dark:text-slate-100">
                          {order.seller.businessName || order.seller.user.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          Tél Vendeur : <strong className="text-slate-800 dark:text-slate-200">{order.seller.user.phone}</strong>
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Article : {order.items[0]?.product.name || "Colis KOLI"} (x{order.items[0]?.quantity || 1})
                        </p>
                      </div>
                    </div>

                    {/* Footer CTA & OTP Validation Modal */}
                    <div className="flex flex-wrap justify-between items-center pt-3 gap-4 border-t border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                          Montant à vérifier
                        </span>
                        <span className="text-xl font-black text-amber-600 dark:text-amber-400">
                          {formatCFA(totalAmount)}
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
