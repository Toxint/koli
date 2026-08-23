import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { RefundStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { NAV_ADMIN } from "@/lib/navigation";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import { formatCFA, pluriel } from "@/lib/format";
import { libelleMotif } from "@/lib/disputes/libelles";
import { TraiterRemboursement } from "@/components/domain/TraiterRemboursement";
import { Icone } from "@/components/ui/Icone";

const PAR_PAGE = 20;

const DATE_FR = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Remboursements simulés (phase 22) — réservé à l'administration. */
export default async function AdminRemboursementsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/connexion");
  }

  const { q, statut, page: pageBrute } = await searchParams;
  const page = Math.max(1, Number(pageBrute) || 1);

  const where: Prisma.RefundWhereInput = {
    ...(statut ? { status: statut as RefundStatus } : {}),
    ...(q
      ? {
          OR: [
            { order: { reference: { contains: q } } },
            { order: { buyerName: { contains: q } } },
          ],
        }
      : {}),
  };

  const [remboursements, total, enAttente, volumeAttente] = await Promise.all([
    prisma.refund.findMany({
      where,
      include: {
        order: {
          include: {
            items: { include: { product: { select: { name: true } } } },
            dispute: { select: { reason: true } },
          },
        },
      },
      // Ce qui reste à faire d'abord, du plus ancien au plus récent :
      // l'ancienneté mesure l'attente du client.
      orderBy: [{ processedAt: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * PAR_PAGE,
      take: PAR_PAGE,
    }),
    prisma.refund.count({ where }),
    prisma.refund.count({ where: { status: RefundStatus.PENDING } }),
    prisma.refund.aggregate({
      where: { status: RefundStatus.PENDING },
      _sum: { amount: true },
    }),
  ]);

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <DashboardNav
        userName={user.name}
        roleName="Admin"
        homeHref="/admin/dashboard"
        navItems={NAV_ADMIN}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Remboursements
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            {pluriel(
              enAttente,
              "remboursement en attente",
              "remboursements en attente"
            )}
            {enAttente > 0 && ` · ${formatCFA(volumeAttente._sum.amount ?? 0)}`}
          </p>
        </div>

        <div className="rounded-2xl border border-brand-border bg-brand-soft/50 p-4">
          <p className="flex items-start gap-2 text-xs text-ink-muted">
            <Icone nom="eclair" className="w-4 h-4 shrink-0 text-test-mode" />
            <span>
              Mode test : aucun mouvement d&apos;argent réel. Le traitement
              inscrit le remboursement au journal et solde le séquestre — et ne
              peut être fait qu&apos;une seule fois (§30).
            </span>
          </p>
        </div>

        <BarreRecherche
          placeholder="Référence ou nom du client…"
          filtres={[
            {
              cle: "statut",
              libelle: "Filtrer par état",
              libelleTous: "Tous les remboursements",
              options: [
                { valeur: "PENDING", libelle: "En attente" },
                { valeur: "COMPLETED", libelle: "Traités" },
              ],
            },
          ]}
        />

        <div className="bg-white rounded-2xl border border-hairline shadow-sm p-6">
          {remboursements.length === 0 ? (
            <div className="text-center py-12">
              <Icone nom="argent" className="w-9 h-9 mx-auto mb-2 text-brand" />
              <p className="text-sm font-semibold">
                {q || statut
                  ? "Aucun remboursement ne correspond à cette recherche"
                  : "Aucun remboursement"}
              </p>
              {!q && !statut && (
                <p className="text-xs text-ink-muted mt-1">
                  Un remboursement naît d&apos;un litige tranché en faveur du
                  client.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4 divide-y divide-hairline">
              {remboursements.map((r) => {
                const traite = r.status === RefundStatus.COMPLETED;
                const articles = r.order.items
                  .map((i) => `${i.quantity} × ${i.product.name}`)
                  .join(", ");

                return (
                  <div
                    key={r.id}
                    className="pt-4 first:pt-0 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-brand text-sm break-all">
                          {r.order.reference}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            traite
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {traite ? "Remboursé" : "En attente"}
                        </span>
                      </div>

                      <h2 className="font-semibold text-base mt-1 break-words">
                        {r.order.buyerName}
                      </h2>
                      <p className="text-xs text-ink-muted break-words">
                        {articles}
                      </p>
                      {r.order.dispute && (
                        <p className="text-xs text-ink-muted mt-0.5">
                          Motif : {libelleMotif(r.order.dispute.reason)} ·{" "}
                          {/* `min-h-[44px]` : cible tactile (§74). Le lien
                              faisait 31px, difficile à viser au pouce sur un
                              écran de téléphone — l'appareil de la quasi
                              totalité des utilisateurs. */}
                          <Link
                            href={`/litige/${r.order.reference}`}
                            className="inline-flex items-center min-h-[44px] text-brand underline"
                          >
                            voir le litige
                          </Link>
                        </p>
                      )}
                      <p className="text-xs text-ink-muted mt-0.5">
                        {traite && r.processedAt
                          ? `Traité le ${DATE_FR.format(r.processedAt)}`
                          : `Ouvert le ${DATE_FR.format(r.createdAt)}`}
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row lg:items-center gap-4 shrink-0">
                      <div className="sm:text-right lg:min-w-[8rem]">
                        <span className="text-xs text-ink-muted block">
                          Montant
                        </span>
                        <span className="text-base font-semibold">
                          {formatCFA(r.amount)}
                        </span>
                      </div>

                      {traite ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                          <Icone nom="valide" className="w-4 h-4" />
                          Traité
                        </span>
                      ) : (
                        <TraiterRemboursement
                          reference={r.order.reference}
                          montant={r.amount}
                          clientNom={r.order.buyerName}
                          articles={articles}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Pagination
            page={page}
            total={total}
            parPage={PAR_PAGE}
            parametres={{ q, statut }}
            chemin="/admin/remboursements"
          />
        </div>
      </main>
    </div>
  );
}
