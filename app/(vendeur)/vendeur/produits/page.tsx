import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { NAV_VENDEUR } from "@/lib/navigation";
import { formatCFA, pluriel } from "@/lib/format";
import { BoutonStatutProduit } from "@/components/domain/BoutonStatutProduit";

const PAR_PAGE = 20;

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  const { q, statut, page: pageBrute } = await searchParams;
  const page = Math.max(1, Number(pageBrute) || 1);

  // Recherche et pagination en base (§46), comme pour les commandes : un
  // catalogue peut devenir long, on ne le charge jamais en entier.
  const where: Prisma.ProductWhereInput = {
    sellerId: user.sellerProfile.id,
    ...(statut ? { status: statut } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { category: { contains: q } },
            { description: { contains: q } },
          ],
        }
      : {}),
  };

  const [produits, total, actifs] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { images: { orderBy: { position: "asc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAR_PAGE,
      take: PAR_PAGE,
    }),
    prisma.product.count({ where }),
    prisma.product.count({
      where: { sellerId: user.sellerProfile.id, status: "ACTIVE" },
    }),
  ]);

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[15.5rem]">
      <DashboardNav
        userName={user.sellerProfile.businessName || user.name}
        roleName="Vendeur"
        homeHref="/vendeur/dashboard"
        navItems={NAV_VENDEUR}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Mon catalogue
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              {pluriel(actifs, "produit")} au catalogue
            </p>
          </div>

          <Link
            href="/vendeur/produits/nouveau"
            className="min-h-[48px] px-4 rounded-xl bg-brand hover:bg-brand-strong text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
          >
            <span>+ Ajouter un produit</span>
          </Link>
        </div>

        <BarreRecherche
          placeholder="Nom, catégorie ou description…"
          filtres={[
            {
              cle: "statut",
              libelle: "Filtrer par disponibilité",
              libelleTous: "Tous les produits",
              options: [
                { valeur: "ACTIVE", libelle: "Au catalogue" },
                { valeur: "ARCHIVED", libelle: "Retirés" },
              ],
            },
          ]}
        />

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-hairline dark:border-slate-800 shadow-sm p-6">
          {produits.length === 0 ? (
            <div className="text-center py-12">
              <span className="text-4xl block mb-2" aria-hidden="true">
                🏷️
              </span>
              <p className="text-sm font-semibold">
                {q || statut
                  ? "Aucun produit ne correspond à cette recherche"
                  : "Votre catalogue est vide"}
              </p>
              {!q && !statut && (
                <>
                  <p className="text-xs text-ink-muted mt-2 max-w-sm mx-auto">
                    Enregistrez vos produits une seule fois : vous les
                    sélectionnerez ensuite en un geste à chaque commande.
                  </p>
                  <Link
                    href="/vendeur/produits/nouveau"
                    className="inline-flex items-center justify-center min-h-[44px] px-5 mt-4 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-semibold"
                  >
                    Ajouter mon premier produit
                  </Link>
                </>
              )}
            </div>
          ) : (
            /* Cartes et non tableau : a 390px, cinq colonnes deviennent
               illisibles ou debordent horizontalement. */
            <div className="space-y-4 divide-y divide-hairline dark:divide-slate-800">
              {produits.map((produit) => {
                const image = produit.images[0];
                const rupture = produit.quantity === 0;

                return (
                  <div
                    key={produit.id}
                    /* `items-stretch` sous sm : `items-start` dimensionne chaque
                       colonne sur son contenu maximal, ce qui fait deborder la
                       page des qu'un libelle est long. */
                    className="pt-4 first:pt-0 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4"
                  >
                    <div className="flex gap-3 min-w-0">
                      {image ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={image.url}
                          alt=""
                          className="w-14 h-14 rounded-xl object-cover border border-hairline shrink-0"
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          className="w-14 h-14 rounded-xl bg-brand-soft flex items-center justify-center text-xl shrink-0"
                        >
                          🏷️
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-base break-words">
                            {produit.name}
                          </h3>
                          {produit.status !== "ACTIVE" && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-hairline text-ink-muted">
                              Retiré
                            </span>
                          )}
                          {rupture && produit.status === "ACTIVE" && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-danger">
                              Rupture de stock
                            </span>
                          )}
                        </div>

                        {produit.category && (
                          <p className="text-xs text-ink-muted mt-0.5">
                            {produit.category}
                          </p>
                        )}
                        <p className="text-xs text-ink-muted mt-0.5">
                          Stock : {produit.quantity}
                          {produit.weightKg ? ` · ${produit.weightKg} kg` : ""}
                        </p>
                      </div>
                    </div>

                    {/* Prix a gauche, actions groupees a droite : si la place
                        manque, c'est le GROUPE de boutons qui passe a la ligne
                        d'un bloc, au lieu de se disloquer bouton par bouton. */}
                    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-x-4 gap-y-2 shrink-0">
                      <div className="text-left sm:text-right">
                        <span className="text-xs text-ink-muted block">
                          Prix
                        </span>
                        <span className="text-base font-semibold">
                          {formatCFA(produit.price)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          href={`/vendeur/produits/${produit.id}`}
                          aria-label={`Modifier ${produit.name}`}
                          className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg bg-brand-soft text-brand hover:bg-brand-soft dark:bg-emerald-950/60 dark:text-emerald-300 text-xs font-bold transition-all"
                        >
                          Modifier
                        </Link>

                        <BoutonStatutProduit
                          produitId={produit.id}
                          nom={produit.name}
                          statut={produit.status}
                        />
                      </div>
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
            chemin="/vendeur/produits"
          />
        </div>
      </main>
    </div>
  );
}
