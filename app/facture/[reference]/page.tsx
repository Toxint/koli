import { notFound } from "next/navigation";
import { chargerFacture } from "@/lib/invoices/facture";
import { formatCFA } from "@/lib/format";
import { libelleStatut } from "@/lib/orders/statusLabels";
import { getCurrentUser } from "@/lib/auth/actions";
import { BarreCompte } from "@/components/ui/BarreCompte";
import { PartagerFacture } from "@/components/domain/PartagerFacture";

const DATE_FR = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
});
const JOUR_FR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

const LIBELLE_PAIEMENT: Record<string, string> = {
  PENDING: "En attente",
  SUCCEEDED: "Réglé",
  FAILED: "Échoué",
  REFUNDED: "Remboursé",
};

function Bloc({
  titre,
  children,
}: {
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-1">
        {titre}
      </h2>
      <div className="text-sm space-y-0.5 break-words">{children}</div>
    </div>
  );
}

/**
 * Facture / reçu (§38).
 *
 * Atteignable par la référence de la commande, comme le lien de paiement : la
 * référence fait office de capacité d'accès (voir `lib/orders/reference.ts`),
 * et le client doit pouvoir garder sa facture sans avoir à ouvrir un compte —
 * l'achat en mode invité est explicitement prévu.
 *
 * Pas de génération de PDF : l'impression du navigateur suffit et fonctionne
 * partout, y compris sur un téléphone d'entrée de gamme. Une feuille de style
 * d'impression retire le décor et l'en-tête.
 *
 * Le bloc « Télécharger / Partager » est un composant client : il lui faut
 * l'adresse réellement visitée et les capacités du navigateur, deux choses
 * qu'un rendu serveur ne connaît pas.
 */
export default async function PageFacture({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const facture = await chargerFacture(reference);
  // Le recu est ouvrable par toute personne detenant la reference — l'achat en
  // mode invite est prevu. La deconnexion n'a donc de sens que si une session
  // existe.
  const utilisateur = await getCurrentUser();

  // Pas de facture tant que le paiement n'a pas abouti : une commande non
  // réglée n'a pas de pièce à présenter.
  if (!facture) notFound();

  return (
    <main className="min-h-screen bg-cream py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="imprimer-masquer">
          <BarreCompte
            retourHref={`/pay/${facture.referenceCommande}`}
            retourLibelle="Retour au suivi de la commande"
            connecte={utilisateur !== null}
          />
        </div>

        <article className="carte-koli bg-white rounded-2xl p-6 sm:p-8 space-y-6">
          <header className="flex flex-wrap justify-between items-start gap-4 pb-5 border-b border-hairline">
            <div className="flex items-center gap-2.5">
              <span className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center text-white font-bold text-lg">
                K
              </span>
              <span>
                <span className="block font-bold text-xl tracking-tight">
                  KOLI
                </span>
                <span className="block text-[11px] text-ink-muted">
                  Reçu de paiement
                </span>
              </span>
            </div>

            <div className="text-right">
              <span className="block font-mono font-bold text-sm">
                {facture.numero}
              </span>
              <span className="block text-xs text-ink-muted">
                Émise le {JOUR_FR.format(facture.emiseLe)}
              </span>
            </div>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Bloc titre="Vendeur">
              <p className="font-semibold">{facture.vendeur}</p>
              <p className="text-ink-muted">{facture.vendeurTelephone}</p>
            </Bloc>

            <Bloc titre="Client">
              <p className="font-semibold">{facture.clientNom}</p>
              <p className="text-ink-muted">{facture.clientTelephone}</p>
              {facture.clientEmail && (
                <p className="text-ink-muted break-all">
                  {facture.clientEmail}
                </p>
              )}
              <p className="text-ink-muted">{facture.clientAdresse}</p>
            </Bloc>

            <Bloc titre="Commande">
              <p className="font-mono font-semibold break-all">
                {facture.referenceCommande}
              </p>
              <p className="text-ink-muted">
                Passée le {JOUR_FR.format(facture.commandeeLe)}
              </p>
            </Bloc>

            <Bloc titre="Statuts">
              <p>
                Paiement :{" "}
                <strong>
                  {LIBELLE_PAIEMENT[facture.statutPaiement] ??
                    facture.statutPaiement}
                </strong>
                {facture.paiementConfirmeLe && (
                  <span className="block text-xs text-ink-muted">
                    le {DATE_FR.format(facture.paiementConfirmeLe)}
                  </span>
                )}
              </p>
              <p>
                Commande :{" "}
                <strong>{libelleStatut(facture.statutCommande)}</strong>
              </p>
            </Bloc>
          </div>

          {/* Cartes sous sm plutot qu'un tableau : quatre colonnes ne tiennent
              pas sur un ecran de 320px, ou elles debordaient. */}
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-2">
              Détail
            </h2>

            <ul className="divide-y divide-hairline border-y border-hairline">
              <li className="hidden sm:grid sm:grid-cols-[1fr_auto_auto_auto] sm:gap-4 py-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                <span>Produit</span>
                <span className="text-right">Qté</span>
                <span className="text-right">Prix unitaire</span>
                <span className="text-right">Total</span>
              </li>

              {facture.lignes.map((ligne, i) => (
                <li
                  key={`${ligne.produit}-${i}`}
                  className="py-3 sm:grid sm:grid-cols-[1fr_auto_auto_auto] sm:gap-4 sm:items-center"
                >
                  <span className="block font-medium break-words">
                    {ligne.produit}
                  </span>
                  <span className="block sm:text-right text-xs text-ink-muted sm:text-ink">
                    <span className="sm:hidden">Quantité : </span>
                    {ligne.quantite}
                  </span>
                  <span className="block sm:text-right text-xs text-ink-muted sm:text-ink">
                    <span className="sm:hidden">Prix unitaire : </span>
                    {formatCFA(ligne.prixUnitaire)}
                  </span>
                  <span className="block sm:text-right font-semibold">
                    {formatCFA(ligne.total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <dl className="space-y-1.5 max-w-xs ml-auto">
            <div className="flex justify-between gap-6">
              <dt className="text-sm text-ink-muted">Sous-total</dt>
              <dd className="text-sm font-medium">
                {formatCFA(facture.sousTotal)}
              </dd>
            </div>
            <div className="flex justify-between gap-6">
              <dt className="text-sm text-ink-muted">Livraison</dt>
              <dd className="text-sm font-medium">
                {formatCFA(facture.livraison)}
              </dd>
            </div>
            <div className="flex justify-between gap-6 pt-2 border-t border-hairline">
              <dt className="text-sm font-semibold">Total réglé</dt>
              <dd className="text-lg font-bold text-brand">
                {formatCFA(facture.total)}
              </dd>
            </div>
          </dl>

          <p className="text-xs text-ink-muted pt-4 border-t border-hairline">
            KOLI conserve le montant jusqu&apos;à la confirmation de réception
            par le client ; le vendeur est réglé à ce moment-là. Document émis
            en mode test : aucun paiement réel n&apos;a été effectué.
          </p>
        </article>

        {/* Sous la pièce et non au-dessus : on lit d'abord le reçu, on décide
            ensuite d'en faire quelque chose. */}
        <PartagerFacture
          numero={facture.numero}
          reference={facture.referenceCommande}
          total={facture.total}
          vendeur={facture.vendeur}
        />
      </div>
    </main>
  );
}
