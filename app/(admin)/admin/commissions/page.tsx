import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { NAV_ADMIN } from "@/lib/navigation";
import { ReglageCommission } from "@/components/domain/ReglageCommission";
import { formatCFA, pluriel } from "@/lib/format";
import { Icone } from "@/components/ui/Icone";

export const metadata: Metadata = { title: "Commissions" };

/** Vente de référence pour l'aperçu quand aucune vente n'existe encore. */
const VENTE_PAR_DEFAUT = 20000;

const dateLongue = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function CommissionsAdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/connexion");
  }

  const [actif, historique, prelevees, moyenne, dernieres] = await Promise.all([
    prisma.commission.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.commission.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    // Ce qui a RÉELLEMENT été prélevé. Le tableau de bord n'affichait jusqu'ici
    // qu'une projection, faute de prélèvement effectif.
    prisma.transaction.aggregate({
      where: { type: "COMMISSION" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    // Panier moyen réel, pour que l'aperçu parle de la vraie activité.
    prisma.fund.aggregate({ _avg: { amount: true } }),
    prisma.transaction.findMany({
      where: { type: "COMMISSION" },
      include: { order: { select: { reference: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const totalPreleve = Math.abs(prelevees._sum.amount ?? 0);
  const exempleVente = Math.round(moyenne._avg.amount ?? 0) || VENTE_PAR_DEFAUT;

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <DashboardNav
        userName={user.name}
        roleName="Administrateur"
        homeHref="/admin/dashboard"
        navItems={NAV_ADMIN}
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Commission KOLI
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            La seule recette de la plateforme. Elle est prélevée au moment où
            les fonds sont versés au vendeur — jamais au paiement.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-hairline bg-white p-5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
              Taux en vigueur
            </span>
            <div className="text-2xl font-bold text-brand">
              {actif ? `${actif.ratePercent} %` : "Aucun"}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {actif
                ? `Depuis le ${dateLongue.format(actif.createdAt)}`
                : "Aucun prélèvement n'est effectué."}
            </p>
          </div>

          <div className="rounded-2xl border border-hairline bg-white p-5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
              Prélevé (test)
            </span>
            <div className="text-2xl font-bold text-brand">
              {formatCFA(totalPreleve)}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {pluriel(prelevees._count._all, "prélèvement", "prélèvements")}
            </p>
          </div>

          <div className="rounded-2xl border border-hairline bg-white p-5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
              Vente moyenne
            </span>
            <div className="text-2xl font-bold text-brand">
              {formatCFA(exempleVente)}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Hors frais de livraison — l&apos;assiette de la commission.
            </p>
          </div>
        </div>

        <section className="bg-white rounded-2xl border border-hairline shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-1">Modifier le taux</h2>
          <p className="text-xs text-ink-muted mb-4">
            Le nouveau taux ne vaut que pour l&apos;avenir : les commissions
            déjà prélevées gardent le leur, et ne sont jamais recalculées.
          </p>

          <ReglageCommission
            tauxActuel={actif?.ratePercent ?? null}
            exempleVente={exempleVente}
          />
        </section>

        <section className="bg-white rounded-2xl border border-hairline shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Derniers prélèvements</h2>

          {dernieres.length === 0 ? (
            <div className="text-center py-8">
              <Icone nom="pourcentage" className="w-8 h-8 mx-auto text-brand" />
              <p className="text-sm font-semibold mt-2">
                Aucune commission prélevée
              </p>
              <p className="text-xs text-ink-muted mt-1 max-w-sm mx-auto">
                La première sera inscrite dès qu&apos;un client confirmera avoir
                reçu sa commande.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {dernieres.map((l) => (
                <li
                  key={l.id}
                  className="py-3 first:pt-0 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <span className="font-mono font-semibold text-brand text-sm break-all">
                      {l.order.reference}
                    </span>
                    <span className="block text-[11px] text-ink-muted">
                      {dateLongue.format(l.createdAt)}
                      {l.rate !== null && ` · ${l.rate} %`}
                    </span>
                  </div>
                  <span className="font-semibold tabular-nums text-brand">
                    {formatCFA(Math.abs(l.amount))}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/admin/transactions?type=COMMISSION"
            className="inline-flex items-center gap-1 min-h-[44px] mt-2 text-xs font-semibold text-brand hover:underline"
          >
            Voir toutes les commissions au journal
            <Icone nom="fleche-droite" className="w-3.5 h-3.5" />
          </Link>
        </section>

        <section className="bg-white rounded-2xl border border-hairline shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-1">Historique des taux</h2>
          <p className="text-xs text-ink-muted mb-4">
            Chaque modification crée une ligne. Les anciennes ne sont jamais
            réécrites : c&apos;est ce qui permet de savoir quel taux était en
            vigueur à une date donnée.
          </p>

          <ul className="divide-y divide-hairline">
            {historique.map((c) => (
              <li
                key={c.id}
                className="py-3 first:pt-0 flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm">
                  <span className="font-semibold">{c.ratePercent} %</span>
                  <span className="text-ink-muted">
                    {" "}
                    · {dateLongue.format(c.createdAt)}
                  </span>
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                    c.isActive
                      ? "bg-brand-soft text-brand"
                      : "bg-hairline text-ink-muted"
                  }`}
                >
                  {c.isActive ? "En vigueur" : "Remplacé"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
