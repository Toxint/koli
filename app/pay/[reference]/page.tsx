import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/actions";
import { PayFlow } from "./pay-flow";
import { chargerPreuveLivraison } from "@/lib/deliveries/preuve";
import { PreuveLivraison } from "@/components/domain/PreuveLivraison";

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

    // §28 : la preuve existait en base depuis la premiere livraison, sans
    // jamais etre montree a personne. Elle est visible par quiconque detient
    // le lien — client, vendeur, livreur : c'est ce qui en fait une preuve
    // opposable, et elle ne revele rien qu'un code deja consomme.
    const preuve = await chargerPreuveLivraison(dbOrder.id);

    // §38 : la facture n'existe qu'une fois le paiement abouti.
    const facture = dbOrder.invoice;

    return (
      <main className="min-h-screen bg-cream">
        <PayFlow
          order={formattedOrder}
          estLeClient={estLeClient}
          codeReception={codeReception}
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
                <span aria-hidden="true" className="text-xl shrink-0">🧾</span>
              </Link>
            )}
          </div>
        )}
      </main>
    );
  }

  // Commande introuvable
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-brand-soft text-brand flex items-center justify-center text-3xl mx-auto">
          ⚠️
        </div>
        <h1 className="text-xl font-bold text-brand dark:text-white">
          Commande introuvable
        </h1>
        <p className="text-sm text-ink-muted">
          La référence de commande <code className="bg-brand-soft dark:bg-slate-800 px-1 py-0.5 rounded text-brand">{reference}</code> n&apos;existe pas ou a expiré.
        </p>
      </div>
    </main>
  );
}
