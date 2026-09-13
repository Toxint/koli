import { redirect } from "next/navigation";
import type { Prisma, OrderStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import { MenuEspace } from "@/components/ui/MenuEspace";
import {
  ActionListe,
  CarteListe,
  Cellule,
  Colonne,
  EnTeteListe,
  EnTeteTableau,
  LigneTableau,
  ListeVide,
  Pastille,
} from "@/components/ui/Liste";
import { formatMontant } from "@/lib/format";
import { deviseDuVendeur } from "@/data/markets";
import { libelleStatut, classesBadgeStatut } from "@/lib/orders/statusLabels";
import { listAvailableDriversAction } from "@/lib/deliveries/assign";
import { AssignerLivreur } from "@/components/domain/AssignerLivreur";
import { ColisPret } from "@/components/domain/ColisPret";
import { PreuveLivraison } from "@/components/domain/PreuveLivraison";
import Link from "next/link";
import { Icone } from "@/components/ui/Icone";

const PAR_PAGE = 20;
const JOUR_FR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/**
 * Les colonnes sur lesquelles on sait TRIER.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Le total n'en fait pas partie, et ce n'est pas un oubli.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Il n'existe dans aucune colonne : il se calcule en additionnant les lignes
 * de la commande et les frais de livraison. Trier dessus supposerait de
 * charger TOUTES les commandes du vendeur pour les classer en mémoire — ce que
 * le §46 interdit précisément, et ce que cette page a cessé de faire.
 *
 * Un en-tête qui promet un tri qu'il ne sait pas rendre est pire qu'un en-tête
 * muet : on clique, rien ne bouge, et l'on conclut que l'écran est cassé.
 */
const TRIS: Record<string, keyof Prisma.OrderOrderByWithRelationInput> = {
  reference: "reference",
  client: "buyerName",
  statut: "status",
  date: "createdAt",
};

export default async function SellerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    statut?: string;
    page?: string;
    tri?: string;
    sens?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  /*
   * La devise du vendeur, une fois pour tout l'écran.
   *
   * Un vendeur a une monnaie — celle qu'il a choisie, à défaut celle de son
   * pays — et depuis que la commande suit le vendeur et non l'acheteur,
   * TOUTES ses écritures sont dans cette monnaie. Rien ne se mélange ici,
   * contrairement aux écrans de l'administration qui agrègent des vendeurs.
   */
  const devise = deviseDuVendeur(user.sellerProfile);

  const {
    q,
    statut,
    page: pageBrute,
    tri: triBrut,
    sens: sensBrut,
  } = await searchParams;
  const page = Math.max(1, Number(pageBrute) || 1);

  /*
   * Le tri vient de l'ADRESSE, et il est validé avant d'atteindre la base.
   *
   * `TRIS` est une liste blanche : une clef inconnue dans l'URL retombe sur la
   * date, sans erreur. Passer la valeur brute à Prisma laisserait quelqu'un
   * classer par un champ qu'on n'a pas choisi de montrer.
   */
  const tri = triBrut && triBrut in TRIS ? triBrut : "date";
  const sens: "asc" | "desc" =
    sensBrut === "asc" ? "asc" : sensBrut === "desc" ? "desc" : "desc";

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
      orderBy: { [TRIS[tri]]: sens },
      skip: (page - 1) * PAR_PAGE,
      take: PAR_PAGE,
    }),
    prisma.order.count({ where }),
    listAvailableDriversAction(),
  ]);

  const parametres = { q, statut };
  const chemin = "/vendeur/commandes";
  const colonne = { tri, sens, chemin, parametres };

  return (
    <div className="min-h-screen bg-cream text-ink">
      <MenuEspace
        user={user}
        nomAffiche={user.sellerProfile.businessName || user.name}
      />

      <main className="mx-auto max-w-[86rem] space-y-4 px-4 py-6 sm:px-6">
        <EnTeteListe
          titre="Commandes"
          nombre={total}
          actions={
            <ActionListe
              href="/vendeur/commandes/nouvelle"
              icone="nouveau"
              principal
            >
              Créer une commande
            </ActionListe>
          }
        />

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

        <CarteListe
          pagination={
            <Pagination
              page={page}
              total={total}
              parPage={PAR_PAGE}
              parametres={parametres}
              chemin={chemin}
              nom="commandes"
            />
          }
        >
          {orders.length === 0 ? (
            <ListeVide
              titre={
                q || statut
                  ? "Aucune commande ne correspond à cette recherche"
                  : "Aucune commande enregistrée"
              }
              explication={
                q || statut
                  ? "Essayez une autre référence, un autre nom, ou retirez le filtre."
                  : "Créez votre première commande : KOLI génère un lien de paiement à partager, et garde l'argent jusqu'à la réception."
              }
              action={
                !q && !statut ? (
                  <ActionListe
                    href="/vendeur/commandes/nouvelle"
                    icone="nouveau"
                    principal
                  >
                    Créer une commande
                  </ActionListe>
                ) : undefined
              }
            />
          ) : (
            <table className="w-full min-w-[68rem] border-collapse">
              <caption className="sr-only">
                Vos commandes, de la plus récente à la plus ancienne
              </caption>
              <EnTeteTableau>
                <Colonne cle="reference" {...colonne}>
                  Référence
                </Colonne>
                <Colonne cle="client" {...colonne}>
                  Client
                </Colonne>
                <Colonne cle="statut" {...colonne}>
                  Statut
                </Colonne>
                <Colonne>Livraison</Colonne>
                <Colonne aDroite>Total</Colonne>
                <Colonne cle="date" {...colonne}>
                  Créée le
                </Colonne>
                <Colonne aDroite>Actions</Colonne>
              </EnTeteTableau>

              <tbody>
                {orders.map((order) => {
                  const montant = order.items.reduce(
                    (acc, item) => acc + item.unitPrice * item.quantity,
                    order.deliveryFee
                  );

                  return (
                    <LigneTableau key={order.id}>
                      <Cellule>
                        <span className="font-mono text-sm font-bold text-brand">
                          {order.reference}
                        </span>
                      </Cellule>

                      <Cellule>
                        <span className="block font-semibold text-ink">
                          {order.buyerName}
                        </span>
                        {/*
                          * Le téléphone est CLIQUABLE : sur un mobile, c'est
                          * ainsi qu'un vendeur rappelle son client.
                          *
                          * ⚠ Donc une cible tactile, donc 44 px (§74). Il en
                          * faisait 15 — la hauteur de son texte. Un numéro
                          * qu'on rate deux fois sur trois n'est pas un
                          * raccourci, c'est un agacement ; et le doigt qui
                          * dérape touche la ligne du dessous.
                          *
                          * `-my-2` reprend la hauteur ajoutée à la cellule :
                          * la zone touchable déborde sur le remplissage de la
                          * ligne, qui n'appartient à personne d'autre.
                          */}
                        <a
                          href={`tel:${order.buyerPhone.replace(/\s/g, "")}`}
                          className="-my-2 inline-flex min-h-[44px] items-center text-xs text-ink-muted hover:text-brand"
                        >
                          {order.buyerPhone}
                        </a>
                      </Cellule>

                      <Cellule>
                        <Pastille classes={classesBadgeStatut(order.status)}>
                          {libelleStatut(order.status)}
                        </Pastille>
                      </Cellule>

                      {/*
                        * La LIVRAISON est une colonne, pas un repli.
                        *
                        * ┌──────────────────────────────────────────────────┐
                        * │  Assigner un livreur est un acte du vendeur      │
                        * │  (§26) — sans lui, la commande n'apparaît sur le │
                        * │  tableau de bord d'aucun livreur.                │
                        * └──────────────────────────────────────────────────┘
                        *
                        * Le renvoyer sur une page de détail aurait rendu le
                        * tableau plus net et le travail plus long : c'est le
                        * geste qu'on vient faire ici. Il vit donc dans la
                        * ligne, et la colonne montre à chaque instant où en
                        * est le colis.
                        */}
                      <Cellule className="whitespace-normal">
                        {order.delivery?.proof ? (
                          <PreuveLivraison
                            compact
                            preuve={{
                              code: order.delivery.proof.otpCode,
                              date: order.delivery.proof.confirmedAt,
                              livreur: order.delivery.driver?.user.name ?? null,
                              vehicule: order.delivery.driver?.vehicle ?? null,
                              signatureUrl: order.delivery.proof.signatureUrl,
                              photoUrl: order.delivery.proof.photoUrl,
                              latitude: order.delivery.proof.latitude,
                              longitude: order.delivery.proof.longitude,
                            }}
                          />
                        ) : order.fund?.secured ? (
                          <div className="min-w-[15rem] space-y-2">
                            <AssignerLivreur
                              orderReference={order.reference}
                              drivers={livreurs}
                              livreurActuel={
                                order.delivery?.driver?.user.name ?? null
                              }
                            />
                            {/* §26 : déclarer le colis prêt prévient le
                                livreur. Le bouton disparaît une fois fait. */}
                            {order.delivery?.driverId &&
                              order.delivery.status === "ASSIGNED" && (
                                <ColisPret reference={order.reference} />
                              )}
                          </div>
                        ) : (
                          /* Pas encore payée : rien à assigner. On le DIT,
                             plutôt que de laisser une case vide qui ressemble
                             à une donnée manquante. */
                          <span className="text-xs text-ink-muted">
                            En attente du paiement
                          </span>
                        )}
                      </Cellule>

                      <Cellule aDroite>
                        <span className="font-semibold text-ink">
                          {formatMontant(montant, devise)}
                        </span>
                      </Cellule>

                      <Cellule>
                        <span className="text-ink-muted">
                          {JOUR_FR.format(order.createdAt)}
                        </span>
                      </Cellule>

                      <Cellule aDroite>
                        <div className="flex items-center justify-end gap-1">
                          {/* §38 : le reçu n'existe qu'une fois le paiement
                              abouti — une commande non réglée n'a pas de
                              pièce. */}
                          {order.invoice && (
                            <Link
                              href={`/facture/${order.reference}`}
                              aria-label={`Reçu de la commande ${order.reference}`}
                              title="Reçu"
                              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-hairline text-ink-muted transition-colors hover:border-brand-border hover:text-brand"
                            >
                              <Icone nom="recu" className="h-4 w-4" />
                            </Link>
                          )}
                          <Link
                            href={`/pay/${order.reference}`}
                            aria-label={`Ouvrir le lien de paiement de la commande ${order.reference}`}
                            title="Lien de paiement"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors hover:bg-brand-border"
                          >
                            <Icone nom="lien" className="h-4 w-4" />
                          </Link>
                        </div>
                      </Cellule>
                    </LigneTableau>
                  );
                })}
              </tbody>
            </table>
          )}
        </CarteListe>
      </main>
    </div>
  );
}
