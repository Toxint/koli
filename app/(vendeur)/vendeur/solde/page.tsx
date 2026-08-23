import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/actions";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { formatCFA } from "@/lib/format";
import { NAV_VENDEUR } from "@/lib/navigation";
import { chargerSoldeVendeur } from "@/lib/finance/solde";
import { chargerJournal } from "@/lib/finance/journal";
import { TableauJournal } from "@/components/domain/TableauJournal";
import { Icone } from "@/components/ui/Icone";

export const metadata: Metadata = { title: "Solde" };

const DERNIERS_MOUVEMENTS = 10;

export default async function SoldeVendeurPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  const sellerId = user.sellerProfile.id;

  // Le solde vient d'un module partagé avec le tableau de bord (§42) : deux
  // calculs séparés d'un même chiffre finissent toujours par diverger.
  const [solde, journal] = await Promise.all([
    chargerSoldeVendeur(sellerId),
    chargerJournal({ sellerId, page: 1, parPage: DERNIERS_MOUVEMENTS }),
  ]);

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <DashboardNav
        userName={user.sellerProfile.businessName || user.name}
        roleName="Vendeur"
        homeHref="/vendeur/dashboard"
        navItems={NAV_VENDEUR}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Mon solde
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Tous les montants sont simulés — KOLI fonctionne en mode test.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-hairline p-5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
              Fonds sécurisés (test)
            </span>
            <div className="text-2xl font-bold text-brand">
              {formatCFA(solde.fondsSecurises)}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Commandes payées, en attente de confirmation par le client.
            </p>
          </div>

          <div className="rounded-2xl border border-hairline p-5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
              Solde disponible (test)
            </span>
            <div className="text-2xl font-bold text-brand">
              {formatCFA(solde.soldeDisponible)}
            </div>
            {/* Le solde est net de commission. Le dire ici évite qu'un vendeur
                compare ce chiffre au montant de ses ventes et croie à une
                erreur — il manquerait sinon quelques milliers de francs sans
                aucune explication à l'écran. */}
            <p className="mt-1 text-xs text-ink-muted">
              {solde.commissionRetenue > 0 ? (
                <>
                  {formatCFA(solde.brutLibere)} libérés, moins{" "}
                  {formatCFA(solde.commissionRetenue)} de commission KOLI.
                </>
              ) : (
                "Libéré après confirmation de réception."
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-hairline p-5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
              Total gagné (test)
            </span>
            <div className="text-2xl font-bold">
              {formatCFA(solde.totalGagne)}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Sécurisé et disponible cumulés.
            </p>
          </div>
        </div>

        {/* §43 — l'interface de retrait existe, mais aucun transfert reel. */}
        <section className="rounded-2xl border border-brand-border bg-brand-soft p-6">
          <h2 className="text-lg">Retirer mes fonds</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Les retraits réels seront disponibles après activation du système de
            paiement KOLI.
          </p>
          <button
            type="button"
            disabled
            className="mt-4 inline-flex items-center justify-center min-h-[48px] px-6 rounded-2xl bg-brand text-white font-semibold text-sm disabled:opacity-50 cursor-not-allowed"
          >
            Retirer mes fonds
          </button>
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-lg">Derniers mouvements</h2>
            <Link
              href="/vendeur/transactions"
              className="inline-flex items-center gap-1 min-h-[44px] text-xs font-semibold text-brand hover:underline"
            >
              Voir tout le journal
              <Icone nom="fleche-droite" className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="rounded-2xl border border-hairline p-4 sm:p-6">
            <TableauJournal
              lignes={journal.lignes}
              lienCommande={(reference) => `/pay/${reference}`}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
