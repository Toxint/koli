import { redirect } from "next/navigation";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import { MenuEspace } from "@/components/ui/MenuEspace";
import {
  ActionListe,
  CarteListe,
  Cellule,
  Colonne,
  EnTeteListe,
  EnTeteTableau,
  LigneTableau,
  ListeVide,
  Pastille,
} from "@/components/ui/Liste";
import { formatMontant } from "@/lib/format";
import { deviseDuVendeur } from "@/data/markets";
import { BoutonStatutProduit } from "@/components/domain/BoutonStatutProduit";
import { Icone } from "@/components/ui/Icone";

const PAR_PAGE = 20;
const JOUR_FR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/**
 * Les colonnes triables — TOUTES celles qui portent un nombre ou un nom.
 *
 * Contrairement au total d'une commande, chacune est une vraie colonne en
 * base : le tri se fait par PostgreSQL, sur la page demandée seulement (§46).
 * La liste reste une liste blanche : une clef inconnue dans l'adresse retombe
 * sur la date, sans erreur.
 */
const TRIS: Record<string, keyof Prisma.ProductOrderByWithRelationInput> = {
  nom: "name",
  prix: "price",
  stock: "quantity",
  date: "createdAt",
};

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    statut?: string;
    page?: string;
    tri?: string;
    sens?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  /*
   * La devise du vendeur, une fois pour tout l'écran.
   *
   * Un vendeur a une monnaie — celle qu'il a choisie, à défaut celle de son
   * pays — et TOUS ses prix sont dans cette monnaie. Rien ne se mélange ici,
   * contrairement aux écrans de l'administration qui agrègent des vendeurs.
   */
  const devise = deviseDuVendeur(user.sellerProfile);

  const {
    q,
    statut,
    page: pageBrute,
    tri: triBrut,
    sens: sensBrut,
  } = await searchParams;
  const page = Math.max(1, Number(pageBrute) || 1);
  const tri = triBrut && triBrut in TRIS ? triBrut : "date";
  const sens: "asc" | "desc" = sensBrut === "asc" ? "asc" : "desc";

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

  const [produits, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { images: { orderBy: { position: "asc" }, take: 1 } },
      /* Départage par identifiant : deux produits au même prix, sans lui,
         changeraient d'ordre d'une page à l'autre — et l'un d'eux pourrait
         apparaître deux fois, ou jamais, en parcourant la pagination. */
      orderBy: [{ [TRIS[tri]]: sens }, { id: "asc" }],
      skip: (page - 1) * PAR_PAGE,
      take: PAR_PAGE,
    }),
    prisma.product.count({ where }),
  ]);

  const parametres = { q, statut };
  const chemin = "/vendeur/produits";
  const colonne = { tri, sens, chemin, parametres };

  return (
    <div className="min-h-screen bg-cream text-ink">
      <MenuEspace
        user={user}
        nomAffiche={user.sellerProfile.businessName || user.name}
      />

      <main className="mx-auto max-w-[86rem] space-y-4 px-4 py-6 sm:px-6">
        <EnTeteListe
          titre="Catalogue"
          nombre={total}
          actions={
            <ActionListe href="/vendeur/produits/nouveau" icone="nouveau" principal>
              Ajouter un produit
            </ActionListe>
          }
        />

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

        <CarteListe
          pagination={
            <Pagination
              page={page}
              total={total}
              parPage={PAR_PAGE}
              parametres={parametres}
              chemin={chemin}
              nom="produits"
            />
          }
        >
          {produits.length === 0 ? (
            <ListeVide
              titre={
                q || statut
                  ? "Aucun produit ne correspond à cette recherche"
                  : "Votre catalogue est vide"
              }
              explication={
                q || statut
                  ? "Essayez un autre nom ou une autre catégorie, ou retirez le filtre."
                  : "Enregistrez vos produits une seule fois : vous les sélectionnerez ensuite en un geste à chaque commande."
              }
              action={
                !q && !statut ? (
                  <ActionListe href="/vendeur/produits/nouveau" icone="nouveau" principal>
                    Ajouter mon premier produit
                  </ActionListe>
                ) : undefined
              }
            />
          ) : (
            <table className="w-full min-w-[52rem] border-collapse">
              <caption className="sr-only">Les produits de votre catalogue</caption>
              <EnTeteTableau>
                <Colonne cle="nom" {...colonne}>
                  Produit
                </Colonne>
                <Colonne cle="prix" aDroite {...colonne}>
                  Prix
                </Colonne>
                <Colonne cle="stock" aDroite {...colonne}>
                  Stock
                </Colonne>
                <Colonne>Statut</Colonne>
                <Colonne cle="date" {...colonne}>
                  Ajouté le
                </Colonne>
                <Colonne aDroite>Actions</Colonne>
              </EnTeteTableau>

              <tbody>
                {produits.map((produit) => {
                  const image = produit.images[0];
                  const retire = produit.status !== "ACTIVE";
                  const rupture = produit.quantity === 0;

                  return (
                    <LigneTableau key={produit.id}>
                      <Cellule>
                        <div className="flex items-center gap-3">
                          {image ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={image.url}
                              alt=""
                              className="h-10 w-10 shrink-0 rounded-lg border border-hairline object-cover"
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"
                            >
                              <Icone nom="etiquette" className="h-5 w-5" />
                            </span>
                          )}
                          {/* `whitespace-normal` + borne : un nom de produit
                              long passe à la ligne DANS sa cellule au lieu
                              d'élargir tout le tableau. */}
                          <span className="min-w-0 max-w-[18rem] whitespace-normal">
                            <span className="block font-semibold text-ink">
                              {produit.name}
                            </span>
                            {produit.category && (
                              <span className="block text-xs text-ink-muted">
                                {produit.category}
                                {produit.weightKg ? ` · ${produit.weightKg} kg` : ""}
                              </span>
                            )}
                          </span>
                        </div>
                      </Cellule>

                      <Cellule aDroite>
                        <span className="font-semibold text-ink">
                          {formatMontant(produit.price, devise)}
                        </span>
                      </Cellule>

                      {/*
                        * Le stock porte `data-stock` : c'est ce que lit
                        * `verif:catalogue` pour éprouver le décompte au
                        * paiement (§17). Il lisait « Stock : 4 » dans le
                        * texte de la page — une tournure de la mise en page
                        * en cartes, que le tableau a remplacée par un
                        * en-tête de colonne.
                        */}
                      <Cellule aDroite>
                        <span
                          data-stock={produit.quantity}
                          className={rupture ? "font-semibold text-danger" : "text-ink"}
                        >
                          {produit.quantity}
                        </span>
                      </Cellule>

                      {/*
                        * UN statut par ligne, et le plus utile gagne.
                        *
                        * « Retiré » l'emporte sur « Rupture » : un produit
                        * retiré n'est proposé à personne, que son stock soit
                        * vide ou non. Afficher les deux ferait croire qu'il
                        * faut réapprovisionner un article qu'on a choisi de ne
                        * plus vendre.
                        */}
                      <Cellule>
                        {retire ? (
                          <Pastille classes="bg-hairline text-ink-muted">Retiré</Pastille>
                        ) : rupture ? (
                          <Pastille classes="bg-red-50 text-danger">Rupture de stock</Pastille>
                        ) : (
                          <Pastille classes="bg-brand-soft text-brand">Au catalogue</Pastille>
                        )}
                      </Cellule>

                      <Cellule>
                        <span className="text-ink-muted">
                          {JOUR_FR.format(produit.createdAt)}
                        </span>
                      </Cellule>

                      <Cellule aDroite>
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/vendeur/produits/${produit.id}`}
                            aria-label={`Modifier ${produit.name}`}
                            title="Modifier"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors hover:bg-brand-border"
                          >
                            <Icone nom="crayon" className="h-4 w-4" />
                          </Link>
                          <BoutonStatutProduit
                            produitId={produit.id}
                            nom={produit.name}
                            statut={produit.status}
                          />
                        </div>
                      </Cellule>
                    </LigneTableau>
                  );
                })}
              </tbody>
            </table>
          )}
        </CarteListe>
      </main>
    </div>
  );
}
