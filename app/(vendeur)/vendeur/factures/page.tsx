import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { MenuEspace } from "@/components/ui/MenuEspace";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import { chargerFacturesVendeur } from "@/lib/invoices/liste";
import { TableauFactures } from "@/components/domain/TableauFactures";
import { CarteListe, EnTeteListe } from "@/components/ui/Liste";
import { formatMontant } from "@/lib/format";
import { deviseDuVendeur } from "@/data/markets";
import { MentionModeTest } from "@/components/ui/MentionModeTest";

export const metadata: Metadata = { title: "Factures" };

const PAR_PAGE = 20;

export default async function FacturesVendeurPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  /*
   * La devise du vendeur, une fois pour tout l'écran.
   *
   * Un vendeur a un pays, donc une monnaie ; et depuis que la commande suit
   * le vendeur et non l'acheteur, TOUTES ses écritures sont dans cette
   * monnaie. Rien ne se mélange ici — contrairement aux écrans de
   * l'administration, qui agrègent plusieurs vendeurs.
   */
  const devise = deviseDuVendeur(user.sellerProfile);

  const { q, page: pageBrute } = await searchParams;
  const page = Math.max(1, Number(pageBrute) || 1);

  // La portée vient de la session, jamais de l'URL : c'est ce qui empêche un
  // vendeur de lire les factures d'un concurrent en changeant un paramètre.
  const factures = await chargerFacturesVendeur(user.sellerProfile.id, {
    recherche: q,
    page,
    parPage: PAR_PAGE,
  });

  return (
    <div className="min-h-screen bg-cream text-ink">
      <MenuEspace user={user} nomAffiche={user.sellerProfile.businessName || user.name} />

      <main className="mx-auto max-w-[86rem] space-y-4 px-4 py-6 sm:px-6">
        <EnTeteListe titre="Factures" nombre={factures.total} />
        <p className="-mt-2 text-sm text-ink-muted">
          Une facture est émise automatiquement dès qu&apos;un paiement
          aboutit.<MentionModeTest> Mode test — aucun paiement réel.</MentionModeTest>
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-hairline bg-white p-5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
              Factures émises
            </span>
            <div className="text-2xl font-bold text-brand">
              {factures.total}
            </div>
          </div>

          <div className="rounded-2xl border border-hairline bg-white p-5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
              Montant facturé (test)
            </span>
            <div className="text-2xl font-bold text-brand">
              {formatMontant(factures.montantTotal, devise)}
            </div>
            {/* Ce chiffre inclut les frais de livraison — c'est le total réglé
                par le client, donc ce que porte la pièce. Il ne se confond pas
                avec le solde du vendeur, net de livraison et de commission. */}
            <p className="mt-1 text-xs text-ink-muted">
              Total réglé par vos clients, frais de livraison compris.
            </p>
          </div>
        </div>

        <BarreRecherche placeholder="Numéro de facture, référence ou client…" />

        <CarteListe
          pagination={
            <Pagination
              page={page}
              total={factures.total}
              parPage={PAR_PAGE}
              parametres={{ q }}
              chemin="/vendeur/factures"
              nom="factures"
            />
          }
        >
          <TableauFactures
            lignes={factures.lignes}
            libelleContrepartie="Client"
            vide={{
              titre: q ? "Aucune facture ne correspond" : "Aucune facture",
              explication: q
                ? "Essayez un numéro de facture, une référence de commande ou un nom de client."
                : "La première sera émise dès qu'un client réglera une de vos commandes.",
            }}
          />
        </CarteListe>
      </main>
    </div>
  );
}
