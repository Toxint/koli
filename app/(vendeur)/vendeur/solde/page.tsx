import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { formatCFA } from "@/lib/format";
import { NAV_VENDEUR } from "@/lib/navigation";

export const metadata: Metadata = { title: "Solde" };

export default async function SoldeVendeurPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  const sellerId = user.sellerProfile.id;

  // Agrege en base plutot que de charger toutes les lignes (§46, §70).
  const [sequestre, libere, mouvements] = await Promise.all([
    prisma.fund.aggregate({
      where: { sellerId, secured: true, released: false },
      _sum: { amount: true },
    }),
    prisma.fund.aggregate({
      where: { sellerId, released: true },
      _sum: { amount: true },
    }),
    // Historique (§42) : les ecritures comptables des commandes du vendeur.
    prisma.transaction.findMany({
      where: { order: { sellerId } },
      include: { order: { select: { reference: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const fondsSecurises = sequestre._sum.amount ?? 0;
  const soldeDisponible = libere._sum.amount ?? 0;
  const totalGagne = fondsSecurises + soldeDisponible;

  const libelleType: Record<string, string> = {
    PAYMENT: "Paiement du client",
    FUNDS_SECURED: "Fonds sécurisés",
    FUNDS_RELEASED: "Fonds libérés",
    COMMISSION: "Commission KOLI",
    REFUND: "Remboursement",
  };

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[15.5rem]">
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
              {formatCFA(fondsSecurises)}
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
              {formatCFA(soldeDisponible)}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Libéré après confirmation de réception.
            </p>
          </div>

          <div className="rounded-2xl border border-hairline p-5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
              Total gagné (test)
            </span>
            <div className="text-2xl font-bold">{formatCFA(totalGagne)}</div>
            <p className="mt-1 text-xs text-ink-muted">
              Sécurisé et libéré cumulés.
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
          <h2 className="text-lg mb-3">Historique des mouvements</h2>

          {mouvements.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-hairline rounded-2xl">
              <span className="text-4xl block mb-2" aria-hidden="true">
                📄
              </span>
              <p className="text-sm font-semibold">Aucun mouvement</p>
              <p className="text-xs text-ink-muted mt-1">
                Les paiements et libérations de vos commandes apparaîtront ici.
              </p>
              <Link
                href="/vendeur/commandes/nouvelle"
                className="inline-flex items-center justify-center min-h-[44px] px-5 mt-4 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-semibold"
              >
                Créer une commande
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-hairline border border-hairline rounded-2xl">
              {mouvements.map((m) => (
                <li
                  key={m.id}
                  className="p-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1"
                >
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {libelleType[m.type] ?? m.type}
                    </span>
                    <span className="block text-xs font-mono text-ink-muted break-all">
                      {m.order.reference}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="block font-semibold whitespace-nowrap">
                      {formatCFA(m.amount)}
                    </span>
                    <span className="block text-xs text-ink-muted whitespace-nowrap">
                      {m.createdAt.toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
