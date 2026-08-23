import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import { NAV_CLIENT } from "@/lib/navigation";
import { chargerFacturesClient } from "@/lib/invoices/liste";
import { TableauFactures } from "@/components/domain/TableauFactures";
import { pluriel } from "@/lib/format";
import { Icone } from "@/components/ui/Icone";

export const metadata: Metadata = { title: "Mes reçus" };

const PAR_PAGE = 20;

export default async function FacturesClientPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "CLIENT" && user.role !== "ADMIN")) {
    redirect("/connexion");
  }

  const { q, page: pageBrute } = await searchParams;
  const page = Math.max(1, Number(pageBrute) || 1);

  // Compte ET téléphone : une grande partie des achats se font en mode invité
  // via un lien WhatsApp, le compte n'étant créé qu'ensuite. Sans le
  // téléphone, ces reçus resteraient invisibles à la personne qui les a payés.
  const factures = await chargerFacturesClient(
    { customerId: user.customerProfile?.id ?? null, telephone: user.phone },
    { recherche: q, page, parPage: PAR_PAGE }
  );

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <DashboardNav
        userName={user.name}
        roleName="Client"
        homeHref="/client/dashboard"
        navItems={NAV_CLIENT}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          {/* « Reçus » et non « Factures » : côté client, c'est la preuve de
              ce qu'il a payé. Le mot « facture » évoque une somme à régler. */}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Mes reçus
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            La preuve de chacun de vos paiements, conservée par KOLI. Mode
            test — aucun paiement réel.
          </p>
        </div>

        <div className="rounded-2xl border border-brand-border bg-brand-soft/40 p-4 flex gap-3">
          <Icone nom="bouclier" className="w-5 h-5 shrink-0 text-brand mt-0.5" />
          <p className="text-xs text-ink">
            Vos reçus restent accessibles ici même si vous avez commandé{" "}
            <span className="font-semibold">sans compte</span> : ils sont
            rattachés à votre numéro de téléphone.
          </p>
        </div>

        <BarreRecherche placeholder="Numéro de reçu ou référence de commande…" />

        <div className="bg-white rounded-2xl border border-hairline shadow-sm p-6">
          <p className="text-xs text-ink-muted mb-4">
            {pluriel(factures.total, "reçu", "reçus")}
          </p>

          <TableauFactures
            lignes={factures.lignes}
            libelleContrepartie="Vendeur"
            vide={{
              titre: q ? "Aucun reçu ne correspond" : "Aucun reçu",
              explication: q
                ? "Essayez un numéro de reçu ou une référence de commande."
                : "Un reçu est créé automatiquement dès qu'un de vos paiements aboutit.",
            }}
          />

          <Pagination
            page={page}
            total={factures.total}
            parPage={PAR_PAGE}
            parametres={{ q }}
            chemin="/client/factures"
          />
        </div>
      </main>
    </div>
  );
}
