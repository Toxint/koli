import { redirect } from "next/navigation";
import type { Prisma, OrderStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { NAV_VENDEUR } from "@/lib/navigation";
import { formatCFA, pluriel } from "@/lib/format";
import { libelleStatut, classesBadgeStatut } from "@/lib/orders/statusLabels";
import { listAvailableDriversAction } from "@/lib/deliveries/assign";
import { AssignerLivreur } from "@/components/domain/AssignerLivreur";
import { PreuveLivraison } from "@/components/domain/PreuveLivraison";
import Link from "next/link";
import { Icone } from "@/components/ui/Icone";

const PAR_PAGE = 20;

export default async function SellerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  const { q, statut, page: pageBrute } = await searchParams;
  const page = Math.max(1, Number(pageBrute) || 1);

  // §46 : recherche, filtre et pagination effectues EN BASE. La page chargeait
  // auparavant l'integralite des commandes du vendeur, sans limite.
  const where: Prisma.OrderWhereInput = {
    sellerId: user.sellerProfile.id,
    ...(statut ? { status: statut as OrderStatus } : {}),
    ...(q
      ? {
          OR: [
            { reference: { contains: q } },
            { buyerName: { contains: q } },
            { buyerPhone: { contains: q } },
          ],
        }
      : {}),
  };

  const [orders, total, livreurs] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: { include: { product: true } },
        payment: true,
        // §38 : le vendeur doit pouvoir retrouver la piece de chaque vente.
        invoice: true,
        // Volontairement PAS d'`otpCodes` : le code de reception n'appartient
        // qu'au client (§27). Il etait charge ici sans jamais etre affiche, ce
        // qui le faisait transiter dans la charge utile envoyee au vendeur.
        // `proof` : la preuve de livraison (§28) etait ecrite en base depuis
        // la premiere remise sans jamais etre montree au vendeur.
        delivery: {
          include: { driver: { include: { user: true } }, proof: true },
        },
        fund: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAR_PAGE,
      take: PAR_PAGE,
    }),
    prisma.order.count({ where }),
    listAvailableDriversAction(),
  ]);

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[15.5rem]">
      <DashboardNav
        userName={user.sellerProfile.businessName || user.name}
        roleName="Vendeur"
        homeHref="/vendeur/dashboard"
        navItems={NAV_VENDEUR}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Gestion de vos commandes
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              {pluriel(total, "commande générée", "commandes générées")}
            </p>
          </div>

          <Link
            href="/vendeur/commandes/nouvelle"
            className="min-h-[48px] px-4 rounded-xl bg-brand hover:bg-brand-strong text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
          >
            <span>+ Créer une commande</span>
          </Link>
        </div>

        <BarreRecherche
          placeholder="Référence, nom ou téléphone du client…"
          filtres={[
            {
              cle: "statut",
              libelle: "Filtrer par statut de commande",
              libelleTous: "Tous les statuts",
              options: [
                { valeur: "PAYMENT_PENDING", libelle: "En attente de paiement" },
                { valeur: "FUNDS_SECURED", libelle: "Paiement sécurisé" },
                { valeur: "SELLER_ACCEPTED", libelle: "Acceptée" },
                { valeur: "DELIVERED", libelle: "Livrée — à confirmer" },
                { valeur: "COMPLETED", libelle: "Terminée" },
              ],
            },
          ]}
        />

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-hairline dark:border-slate-800 shadow-sm p-6">
          {orders.length === 0 ? (
            <div className="text-center py-12">
              <Icone nom="colis" className="w-9 h-9 mx-auto text-brand" />
              <p className="text-sm font-semibold">
                {q || statut
                  ? "Aucune commande ne correspond à cette recherche"
                  : "Aucune commande enregistrée"}
              </p>
              {!q && !statut && (
                <Link
                  href="/vendeur/commandes/nouvelle"
                  className="inline-flex items-center justify-center min-h-[44px] px-5 mt-4 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-semibold"
                >
                  Créer une commande
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-4 divide-y divide-hairline dark:divide-slate-800">
              {orders.map((order) => {
                const totalAmount = order.items.reduce(
                  (acc, item) => acc + item.unitPrice * item.quantity,
                  order.deliveryFee
                );

                return (
                  /* `items-stretch` sous sm : avec `items-start`, chaque
                     colonne se dimensionnait sur son contenu maximal et
                     pouvait depasser la largeur de l'ecran. */
                  <div key={order.id} className="pt-4 first:pt-0 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-brand text-sm break-all">
                          {order.reference}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${classesBadgeStatut(order.status)}`}
                        >
                          {libelleStatut(order.status)}
                        </span>
                      </div>
                      <h3 className="font-semibold text-base mt-1 break-words">
                        Client : {order.buyerName}
                      </h3>
                      <a
                        href={`tel:${order.buyerPhone.replace(/\s/g, "")}`}
                        className="inline-flex items-center min-h-[44px] text-xs text-ink-muted whitespace-nowrap hover:text-brand"
                      >
                        {order.buyerPhone}
                      </a>
                      <p className="text-xs text-ink-muted">
                        {order.buyerAddress}, {order.buyerCity}
                      </p>

                      {/* §28 : la preuve de la remise, sous forme courte. Le
                          vendeur n'avait jusqu'ici aucun moyen de constater
                          que son colis avait bien ete remis en main propre. */}
                      {order.delivery?.proof && (
                        <div className="mt-2 rounded-xl bg-brand-soft/50 border border-brand-border px-3 py-2">
                          <PreuveLivraison
                            compact
                            preuve={{
                              code: order.delivery.proof.otpCode,
                              date: order.delivery.proof.confirmedAt,
                              livreur:
                                order.delivery.driver?.user.name ?? null,
                              vehicule: order.delivery.driver?.vehicle ?? null,
                              signatureUrl: order.delivery.proof.signatureUrl,
                              photoUrl: order.delivery.proof.photoUrl,
                              latitude: order.delivery.proof.latitude,
                              longitude: order.delivery.proof.longitude,
                            }}
                          />
                        </div>
                      )}

                      {/* §26 : l'assignation d'un livreur est un acte explicite
                          du vendeur. Sans elle, la commande n'apparaissait dans
                          le tableau de bord d'aucun livreur. */}
                      {order.fund?.secured && (
                        <div className="mt-3 max-w-md">
                          <AssignerLivreur
                            orderReference={order.reference}
                            drivers={livreurs}
                            livreurActuel={
                              order.delivery?.driver?.user.name ?? null
                            }
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                      <div className="text-right">
                        <span className="text-xs text-ink-muted block">Total</span>
                        <span className="text-base font-semibold">{formatCFA(totalAmount)}</span>
                      </div>

                      {/* §38 : le recu n'existe qu'une fois le paiement
                          abouti — une commande non reglee n'a pas de piece. */}
                      {order.invoice && (
                        <Link
                          href={`/facture/${order.reference}`}
                          aria-label={`Reçu de la commande ${order.reference}`}
                          className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg border border-hairline hover:bg-brand-soft/40 text-xs font-bold"
                        >
                          <Icone nom="recu" className="w-4 h-4" /> Reçu
                        </Link>
                      )}

                      <Link
                        href={`/pay/${order.reference}`}
                        aria-label={`Ouvrir le lien de paiement de la commande ${order.reference}`}
                        className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg bg-brand-soft text-brand hover:bg-brand-soft dark:bg-emerald-950/60 dark:text-emerald-300 text-xs font-bold transition-all"
                      >
                        <Icone nom="lien" className="w-4 h-4" /> Lien
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Pagination
            page={page}
            total={total}
            parPage={PAR_PAGE}
            parametres={{ q, statut }}
            chemin="/vendeur/commandes"
          />
        </div>
      </main>
    </div>
  );
}
