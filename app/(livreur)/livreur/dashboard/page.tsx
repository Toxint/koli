import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { MenuEspace } from "@/components/ui/MenuEspace";
import { ValidateOtpModal } from "@/components/driver/ValidateOtpModal";
import { JalonLivraison } from "@/components/domain/JalonLivraison";
import { prochainJalonLivreur, JALONS } from "@/lib/deliveries/jalons";
import { pluriel, formatCFA } from "@/lib/format";
import { chargerRevenusLivreur } from "@/lib/finance/revenus-livreur";
import { chargerCourbeLivreur } from "@/lib/finance/courbes";
import { mettreEnForme } from "@/lib/finance/jours";
import { TEINTE_COURBE } from "@/lib/finance/teintes-courbes";
import { CourbePerformance } from "@/components/domain/CourbePerformance";
import { Icone } from "@/components/ui/Icone";

export default async function DriverDashboardPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "DRIVER" || !user.driverProfile) {
    redirect("/connexion");
  }

  const driverProfileId = user.driverProfile.id;

  const revenus = await chargerRevenusLivreur(driverProfileId);
  const courbe = mettreEnForme(await chargerCourbeLivreur(driverProfileId));

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
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <MenuEspace user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fade-in">
        {/* Or Doré Banner */}
        <div className="bg-brand rounded-3xl p-6 sm:p-8 text-white shadow-lg shadow-brand/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden border border-brand-border/40">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-white/20 text-white mb-2">
              <Icone nom="eclair" className="w-3.5 h-3.5" /> Espace livreur KOLI
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Bienvenue, {user.name}
            </h1>
            <p className="text-white/90 text-xs sm:text-sm font-medium mt-1">
              Véhicule : <strong className="font-bold">{user.driverProfile.vehicle || "Moto KOLI Express"}</strong> • Numéro Vendeur & Client disponibles ci-dessous.
            </p>
          </div>
          <div className="bg-white text-brand backdrop-blur-md px-4 py-2.5 rounded-2xl text-xs font-semibold border border-white/30 shadow-lg shrink-0 relative z-10">
            {pluriel(
              deliveries.length,
              "livraison enregistrée",
              "livraisons enregistrées"
            )}
          </div>
        </div>

        {/*
         * ════════════════════════════════════════════════════════════════
         * Journée du livreur — courses et revenus
         * ════════════════════════════════════════════════════════════════
         *
         * §25 : « Ne jamais afficher au livreur des informations financières
         * inutiles. » Ses PROPRES frais cessent d'être inutiles à partir du
         * moment où ils sont sa paie — c'est la seule somme montrée ici. La
         * valeur de la marchandise, la commission KOLI et le solde du vendeur
         * ne le regardent pas et n'apparaissent nulle part.
         */}
        <section aria-labelledby="titre-journee" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="titre-journee"
              className="flex items-center gap-2 text-xl font-bold"
            >
              <Icone nom="argent" className="h-5 w-5" /> Ma journée
            </h2>
            <span className="text-xs font-medium text-ink-muted">
              Depuis minuit · remis à jour à chaque course validée
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {/* Le chiffre du jour, mis en avant : c'est celui qu'un livreur
                regarde en premier, et souvent le seul. */}
            <div className="carte-koli rounded-2xl bg-brand p-5 text-white">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                Gagné aujourd&apos;hui
              </p>
              <p className="mt-2 text-2xl font-bold sm:text-3xl">
                {formatCFA(revenus.gagneAujourdhui)}
              </p>
              <p className="mt-1 text-[11px] text-white/80">
                {revenus.coursesAujourdhui > 0
                  ? `${formatCFA(revenus.moyenneAujourdhui)} en moyenne par course`
                  : "Aucune course terminée pour l'instant"}
              </p>
            </div>

            <div className="carte-koli rounded-2xl bg-white p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Courses du jour
              </p>
              <p className="mt-2 text-2xl font-bold text-brand sm:text-3xl">
                {revenus.coursesAujourdhui}
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">
                {pluriel(revenus.coursesTotal, "course au total", "courses au total")}
              </p>
            </div>

            <div className="carte-koli rounded-2xl bg-white p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                En cours
              </p>
              <p className="mt-2 text-2xl font-bold text-brand sm:text-3xl">
                {revenus.enCours}
              </p>
              <p className="mt-1 text-[11px] text-ink-muted">
                {revenus.aVenir > 0
                  ? pluriel(revenus.aVenir, "course à enlever", "courses à enlever")
                  : "Rien en attente d'enlèvement"}
              </p>
            </div>

            <div className="carte-koli rounded-2xl bg-white p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Gagné au total
              </p>
              <p className="mt-2 text-2xl font-bold text-brand sm:text-3xl">
                {formatCFA(revenus.gagneTotal)}
              </p>
              {/* Dire franchement que cet argent n'est pas encaissable. Un
                  chiffre qui grossit sans jamais arriver sur un compte serait
                  pris pour une promesse — et le §84 interdit de laisser croire
                  que KOLI detient des fonds. */}
              <p className="mt-1 text-[11px] font-semibold text-gold-deep">
                Mode test — aucun versement réel
              </p>
            </div>
          </div>

          {/* Courbe des revenus. UNE mesure : ce qui lui revient. Le nombre de
              courses est deja porte par les compteurs ci-dessus — l ajouter ici
              aurait demande une seconde echelle verticale. */}
          <div className="carte-koli rounded-2xl bg-white p-6">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div>
                <h3 className="text-base font-bold">Vos revenus, jour par jour</h3>
                <p className="text-xs text-ink-muted">
                  Quatorze derniers jours · frais de livraison acquis
                </p>
              </div>
              <span className="text-sm font-bold text-brand">
                {formatCFA(courbe.reduce((s, p) => s + p.valeur, 0))} sur la période
              </span>
            </div>

            <CourbePerformance
              points={courbe}
              couleur={TEINTE_COURBE}
              libelle="Frais de livraison acquis par jour"
            />
          </div>

          <p className="text-xs leading-relaxed text-ink-muted">
            Les frais de livraison vous sont acquis dès que le client vous donne
            son code de réception. Ils ne dépendent pas de sa confirmation
            ultérieure : la course est faite, elle est payée.
          </p>
        </section>

        {/* Deliveries list */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
              <Icone nom="document" className="w-5 h-5" /> Vos courses & livraisons en cours
            </h2>
          </div>

          {deliveries.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900 border border-hairline dark:border-slate-800 rounded-3xl p-8 shadow-sm">
              <Icone nom="livreur" className="w-12 h-12 mx-auto mb-3 text-brand" />
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
                // §26 : l'etape suivante, et elle seule. Le livreur n'a jamais
                // qu'une reponse juste a donner.
                const prochain = isDelivered
                  ? null
                  : prochainJalonLivreur(delivery.status);
                const etapeActuelle = JALONS.find(
                  (j) => j.statutLivraison === delivery.status
                );

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
                            <Icone nom="telephone" className="w-4 h-4" /> {order.buyerPhone}
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
                          <>
                            <Icone nom={isDelivered ? "valide" : "horloge"} className="w-3.5 h-3.5" />
                            {isDelivered
                              ? "Livrée"
                              : (etapeActuelle?.libelleClient ?? "En cours de livraison")}
                          </>
                        </span>
                      </div>
                    </div>

                    {/* Delivery details grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div className="bg-white dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1">
                        <span className="text-[11px] font-semibold text-brand dark:text-amber-400 uppercase tracking-wider block">
                          <Icone nom="position" className="w-3.5 h-3.5" /> Adresse de livraison
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
                          <Icone nom="boutique" className="w-3.5 h-3.5" /> Vendeur expéditeur
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

                      {/* §26 : l'etape suivante. Elle n'ouvre aucun droit —
                          la remise reste attestee par le code de reception. */}
                      {prochain && (
                        <JalonLivraison
                          deliveryId={delivery.id}
                          code={prochain.code}
                          libelle={prochain.actionLivreur}
                        />
                      )}

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
