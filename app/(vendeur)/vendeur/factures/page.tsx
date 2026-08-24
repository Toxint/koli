import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { MenuEspace } from "@/components/ui/MenuEspace";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import { chargerFacturesVendeur } from "@/lib/invoices/liste";
import { TableauFactures } from "@/components/domain/TableauFactures";
import { formatCFA, pluriel } from "@/lib/format";

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
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <MenuEspace user={user} nomAffiche={user.sellerProfile.businessName || user.name} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Mes factures
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Une facture est émise automatiquement dès qu&apos;un paiement
            aboutit. Mode test — aucun paiement réel.
          </p>
        </div>

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
              {formatCFA(factures.montantTotal)}
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

        <div className="bg-white rounded-2xl border border-hairline shadow-sm p-6">
          <p className="text-xs text-ink-muted mb-4">
            {pluriel(factures.total, "facture", "factures")}
          </p>

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

          <Pagination
            page={page}
            total={factures.total}
            parPage={PAR_PAGE}
            parametres={{ q }}
            chemin="/vendeur/factures"
          />
        </div>
      </main>
    </div>
  );
}
