import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { OrderStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { NAV_ADMIN } from "@/lib/navigation";
import { formatCFA, pluriel } from "@/lib/format";
import { VerificationVendeur } from "@/components/domain/VerificationVendeur";
import { Icone } from "@/components/ui/Icone";

const PAR_PAGE = 20;

export default async function AdminVendeursPage({
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

  const where: Prisma.SellerProfileWhereInput = {
    ...(statut
      ? { verificationStatus: statut as Prisma.SellerProfileWhereInput["verificationStatus"] }
      : {}),
    ...(q
      ? {
          OR: [
            { businessName: { contains: q } },
            { user: { name: { contains: q } } },
            { user: { phone: { contains: q } } },
            { user: { email: { contains: q } } },
          ],
        }
      : {}),
  };

  const [vendeurs, total] = await Promise.all([
    prisma.sellerProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            status: true,
            createdAt: true,
          },
        },
        _count: { select: { orders: true, products: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAR_PAGE,
      take: PAR_PAGE,
    }),
    prisma.sellerProfile.count({ where }),
  ]);

  /**
   * Chiffre d'affaires (§36) : somme des fonds LIBERES du vendeur, c'est-a-dire
   * l'argent que la plateforme lui doit reellement. On exclut volontairement
   * le sequestre non libere — une commande encore protegee n'est pas un
   * revenu acquis, et l'y compter surevaluerait chaque vendeur.
   *
   * Un `groupBy` unique plutot qu'une requete par vendeur : la page en
   * afficherait vingt.
   */
  const idsVendeurs = vendeurs.map((v) => v.id);
  const [revenus, commandesTerminees] = await Promise.all([
    idsVendeurs.length
      ? prisma.fund.groupBy({
          by: ["sellerId"],
          where: { sellerId: { in: idsVendeurs }, released: true },
          _sum: { amount: true },
        })
      : Promise.resolve([]),
    idsVendeurs.length
      ? prisma.order.groupBy({
          by: ["sellerId"],
          where: {
            sellerId: { in: idsVendeurs },
            status: OrderStatus.COMPLETED,
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const revenuPar = new Map(
    revenus.map((r) => [r.sellerId, r._sum.amount ?? 0])
  );
  const termineesPar = new Map(
    commandesTerminees.map((c) => [c.sellerId, c._count._all])
  );

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[15.5rem]">
      <DashboardNav
        userName={user.name}
        roleName="Admin"
        roleBadgeColor="bg-brand-soft text-brand border border-brand-border"
        homeHref="/admin/dashboard"
        navItems={NAV_ADMIN}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vendeurs</h1>
          <p className="text-xs text-ink-muted mt-1">
            {pluriel(total, "vendeur inscrit", "vendeurs inscrits")}
          </p>
        </div>

        <div className="rounded-2xl border border-brand-border bg-brand-soft/50 p-4">
          <p className="text-xs text-ink-muted">
            La décision de vérification est <strong>manuelle</strong> à ce
            stade : aucun document n&apos;est encore collecté. Le §37 prévoit
            que le KYC soit préparé sans bloquer le MVP — la remise de
            pièces justificatives arrive en phase 24.
          </p>
        </div>

        <BarreRecherche
          placeholder="Boutique, nom, téléphone ou email…"
          filtres={[
            {
              cle: "statut",
              libelle: "Filtrer par statut de vérification",
              libelleTous: "Toutes les vérifications",
              options: [
                { valeur: "PENDING", libelle: "En attente" },
                { valeur: "VERIFIED", libelle: "Vérifiés" },
                { valeur: "REJECTED", libelle: "Rejetés" },
              ],
            },
          ]}
        />

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-hairline dark:border-slate-800 shadow-sm p-6">
          {vendeurs.length === 0 ? (
            <div className="text-center py-12">
              <Icone nom="boutique" className="w-8 h-8 mx-auto text-brand" />
              <p className="text-sm font-semibold">
                {q || statut
                  ? "Aucun vendeur ne correspond à cette recherche"
                  : "Aucun vendeur inscrit"}
              </p>
            </div>
          ) : (
            /* Cartes et non tableau : le §36 demande cinq colonnes, ce qui est
               illisible sur un téléphone. */
            <div className="space-y-4 divide-y divide-hairline dark:divide-slate-800">
              {vendeurs.map((v) => (
                <div
                  key={v.id}
                  className="pt-4 first:pt-0 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-base break-words">
                        {v.businessName || v.user.name}
                      </h3>
                      {v.user.status !== "ACTIVE" && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-danger">
                          Compte suspendu
                        </span>
                      )}
                    </div>

                    {v.businessName && (
                      <p className="text-xs text-ink-muted mt-0.5 break-words">
                        {v.user.name}
                      </p>
                    )}

                    <a
                      href={`tel:${v.user.phone.replace(/\s/g, "")}`}
                      className="inline-flex items-center min-h-[44px] text-xs font-mono text-ink-muted hover:text-brand whitespace-nowrap"
                    >
                      {v.user.phone}
                    </a>
                    {v.user.email && (
                      <span className="block text-xs text-ink-muted break-all">
                        {v.user.email}
                      </span>
                    )}

                    <p className="text-xs text-ink-muted mt-1">
                      {pluriel(v._count.orders, "commande")} ·{" "}
                      {pluriel(termineesPar.get(v.id) ?? 0, "terminée")} ·{" "}
                      {pluriel(v._count.products, "produit")}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row lg:items-center gap-4">
                    <div className="sm:text-right lg:min-w-[9rem]">
                      <span className="text-xs text-ink-muted block">
                        Chiffre d&apos;affaires
                      </span>
                      <span className="text-base font-semibold">
                        {formatCFA(revenuPar.get(v.id) ?? 0)}
                      </span>
                      <span className="block text-[11px] text-ink-muted">
                        fonds libérés
                      </span>
                    </div>

                    <VerificationVendeur
                      sellerId={v.id}
                      nom={v.businessName || v.user.name}
                      statut={v.verificationStatus}
                    />
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
            chemin="/admin/vendeurs"
          />
        </div>
      </main>
    </div>
  );
}
