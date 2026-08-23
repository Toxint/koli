import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { DisputeStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { NAV_ADMIN } from "@/lib/navigation";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import { formatCFA, pluriel } from "@/lib/format";
import {
  libelleMotif,
  libelleStatutLitige,
  classesStatutLitige,
} from "@/lib/disputes/libelles";
import { Icone } from "@/components/ui/Icone";

const PAR_PAGE = 20;

const DATE_FR = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Instruction des litiges (§32) — reserve a l'administration. */
export default async function AdminLitigesPage({
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

  const where: Prisma.DisputeWhereInput = {
    ...(statut ? { status: statut as DisputeStatus } : {}),
    ...(q
      ? {
          OR: [
            { order: { reference: { contains: q } } },
            { order: { buyerName: { contains: q } } },
            { description: { contains: q } },
          ],
        }
      : {}),
  };

  const [litiges, total, aTrancher] = await Promise.all([
    prisma.dispute.findMany({
      where,
      include: {
        order: {
          include: {
            fund: true,
            seller: {
              select: { businessName: true, user: { select: { name: true } } },
            },
          },
        },
        _count: { select: { messages: true } },
      },
      // Les litiges non tranches d'abord, puis les plus anciens : c'est ce
      // qui reste a faire, et l'anciennete mesure l'attente des parties.
      orderBy: [{ resolvedAt: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * PAR_PAGE,
      take: PAR_PAGE,
    }),
    prisma.dispute.count({ where }),
    prisma.dispute.count({ where: { resolvedAt: null } }),
  ]);

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[15.5rem]">
      <DashboardNav
        userName={user.name}
        roleName="Admin"
        homeHref="/admin/dashboard"
        navItems={NAV_ADMIN}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Litiges</h1>
          <p className="text-xs text-ink-muted mt-1">
            {pluriel(aTrancher, "litige en attente", "litiges en attente")} sur{" "}
            {total} au total
          </p>
        </div>

        <div className="rounded-2xl border border-brand-border bg-brand-soft/50 p-4">
          <p className="flex items-start gap-2 text-xs text-ink-muted">
            <Icone nom="cadenas" className="w-4 h-4 shrink-0 text-brand" />
            <span>
              Tant qu&apos;un litige est ouvert, les fonds de la commande
              restent bloques (§33). Trancher deplace l&apos;argent : vers le
              vendeur, ou vers un remboursement du client.
            </span>
          </p>
        </div>

        <BarreRecherche
          placeholder="Reference, nom du client ou description…"
          filtres={[
            {
              cle: "statut",
              libelle: "Filtrer par etat du litige",
              libelleTous: "Tous les litiges",
              options: [
                { valeur: "OPEN", libelle: "Ouverts" },
                { valeur: "ADMIN_REVIEW", libelle: "En examen" },
                { valeur: "SELLER_WINS", libelle: "Vendeur" },
                { valeur: "CUSTOMER_WINS", libelle: "Client" },
              ],
            },
          ]}
        />

        <div className="bg-white rounded-2xl border border-hairline shadow-sm p-6">
          {litiges.length === 0 ? (
            <div className="text-center py-12">
              <Icone nom="bouclier" className="w-9 h-9 mx-auto mb-2 text-brand" />
              <p className="text-sm font-semibold">
                {q || statut
                  ? "Aucun litige ne correspond a cette recherche"
                  : "Aucun litige ouvert"}
              </p>
              {!q && !statut && (
                <p className="text-xs text-ink-muted mt-1">
                  Les signalements des clients apparaitront ici.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4 divide-y divide-hairline">
              {litiges.map((litige) => (
                <div
                  key={litige.id}
                  className="pt-4 first:pt-0 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-brand text-sm break-all">
                        {litige.order.reference}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${classesStatutLitige(litige.status)}`}
                      >
                        {libelleStatutLitige(litige.status)}
                      </span>
                    </div>

                    <h2 className="font-semibold text-base mt-1 break-words">
                      {libelleMotif(litige.reason)}
                    </h2>
                    <p className="text-xs text-ink-muted break-words">
                      {litige.order.buyerName} contre{" "}
                      {litige.order.seller.businessName ||
                        litige.order.seller.user.name}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      Ouvert le {DATE_FR.format(litige.createdAt)} ·{" "}
                      {pluriel(litige._count.messages, "message")}
                    </p>
                  </div>

                  <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0">
                    <div className="lg:text-right">
                      <span className="text-xs text-ink-muted block">
                        Fonds bloques
                      </span>
                      <span className="text-base font-semibold">
                        {formatCFA(litige.order.fund?.amount ?? 0)}
                      </span>
                    </div>

                    <Link
                      href={`/litige/${litige.order.reference}`}
                      className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-bold"
                    >
                      {litige.resolvedAt ? "Consulter" : "Instruire"}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Pagination
            page={page}
            total={total}
            parPage={PAR_PAGE}
            parametres={{ q, statut }}
            chemin="/admin/litiges"
          />
        </div>
      </main>
    </div>
  );
}
