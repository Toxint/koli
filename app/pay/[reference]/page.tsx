import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/actions";
import { PayFlow } from "./pay-flow";
import { chargerPreuveLivraison } from "@/lib/deliveries/preuve";
import { PreuveLivraison } from "@/components/domain/PreuveLivraison";
import { Icone } from "@/components/ui/Icone";
import { BarreCompte } from "@/components/ui/BarreCompte";
import { isTestMode, getPaymentProvider } from "@/lib/config/mode";

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
      invoice: true,
      delivery: { include: { otpCodes: true } },
    },
  });

  if (dbOrder) {
    // Cette page est atteignable par toute personne detenant le lien — donc
    // aussi par le vendeur, qui le partage, et par le livreur, qui voit la
    // reference sur sa fiche. Deux informations sont donc reservees au CLIENT
    // authentifie et rattache a la commande : le code de reception, et le
    // bouton de confirmation qui declenche le versement au vendeur.
    const user = await getCurrentUser();

    const estLeClient =
      user != null &&
      user.customerProfile != null &&
      !(user.sellerProfile && user.sellerProfile.id === dbOrder.sellerId) &&
      (dbOrder.customerId === user.customerProfile.id ||
        (dbOrder.customerId === null && user.phone === dbOrder.buyerPhone));

    const codeReception = estLeClient
      ? (dbOrder.delivery?.otpCodes.find((o) => o.consumedAt === null)?.code ??
        null)
      : null;

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

    /*
     * Le total, recalcule ICI, cote serveur, a partir des lignes de la
     * commande : c'est lui qui part chez l'agregateur. Le prendre d'un champ
     * calcule ailleurs, ou pire du navigateur, reviendrait a laisser quelqu'un
     * choisir combien il paie.
     */
    const montantTotal =
      dbOrder.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0) +
      dbOrder.deliveryFee;

    // §28 : la preuve existait en base depuis la premiere livraison, sans
    // jamais etre montree a personne. Elle est visible par quiconque detient
    // le lien — client, vendeur, livreur : c'est ce qui en fait une preuve
    // opposable, et elle ne revele rien qu'un code deja consomme.
    const preuve = await chargerPreuveLivraison(dbOrder.id);

    // §38 : la facture n'existe qu'une fois le paiement abouti.
    const facture = dbOrder.invoice;

    return (
      <main className="min-h-screen bg-cream">
        {/* Le suivi est ouvert a quiconque detient le lien. La barre de compte
            n'apparait donc que si une session existe — et elle porte alors la
            deconnexion, qui n'etait atteignable depuis aucun de ces ecrans. */}
        {user && (
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
            <BarreCompte connecte />
          </div>
        )}

        <PayFlow
          order={formattedOrder}
          estLeClient={estLeClient}
          codeReception={codeReception}
          modeTest={isTestMode()}
          checkoutUrl={await adresseDuTunnel(
            dbOrder.reference,
            montantTotal
          )}
        />

        {(facture || preuve) && (
          <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 space-y-4">
            {preuve && <PreuveLivraison preuve={preuve} />}

            {facture && (
              <Link
                href={`/facture/${dbOrder.reference}`}
                className="carte-koli bg-white rounded-2xl p-5 flex items-center justify-between gap-4"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    Reçu de paiement
                  </span>
                  <span className="block text-xs text-ink-muted font-mono break-all">
                    {facture.number}
                  </span>
                </span>
                <Icone nom="recu" className="w-6 h-6 shrink-0 text-brand" />
              </Link>
            )}
          </div>
        )}
      </main>
    );
  }

  // Reference inconnue : un vrai 404, et non une page « introuvable »
  // renvoyee avec un code de succes. L ecran vit dans not-found.tsx.
  notFound();
}

/**
 * L'adresse du tunnel de paiement, ou `null`.
 *
 * `null` en mode test — il n'y a rien a ouvrir — et `null` aussi si la
 * configuration d'iKeePay est incomplete. Dans ce second cas l'ecran le DIT,
 * plutot que d'afficher un bouton qui ne mene nulle part : le constructeur du
 * fournisseur jette quand une clef manque, et cette page ne doit pas tomber
 * avec lui. Un acheteur ne doit jamais voir une page d'erreur a l'instant de
 * payer.
 *
 * `initiate()` ne deplace aucun argent et n'appelle personne : pour le tunnel
 * iframe, il ne fait que batir une adresse. On peut donc l'appeler a chaque
 * affichage sans effet de bord.
 */
async function adresseDuTunnel(
  reference: string,
  montant: number
): Promise<string | null> {
  if (isTestMode()) return null;

  try {
    const intention = await getPaymentProvider().initiate({
      orderReference: reference,
      amount: montant,
      currency: "XOF",
      // La reference tient lieu de clef : deux affichages de la meme commande
      // batissent la meme adresse, donc le meme `order_id` chez iKeePay.
      idempotencyKey: reference,
    });
    return intention.checkoutUrl ?? null;
  } catch {
    return null;
  }
}
