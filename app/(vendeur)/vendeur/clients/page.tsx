import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { MenuEspace } from "@/components/ui/MenuEspace";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import {
  ActionListe,
  CarteListe,
  Cellule,
  Colonne,
  EnTeteListe,
  EnTeteTableau,
  LigneTableau,
  ListeVide,
} from "@/components/ui/Liste";
import { formatMontant, pluriel } from "@/lib/format";
import { deviseDuVendeur } from "@/data/markets";
import { chargerClientsVendeur } from "@/lib/sellers/clients";
import { Icone } from "@/components/ui/Icone";

const PAR_PAGE = 20;

const JOUR_FR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/**
 * Clients du vendeur (phase 7, §10).
 *
 * Un client est un ACHETEUR identifié par son téléphone, et non un compte :
 * beaucoup commandent sans jamais s'inscrire, et ce sont eux aussi des clients.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  AUCUNE colonne n'est triable ici, et ce n'est pas un oubli.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `chargerClientsVendeur` n'est pas une lecture de table : c'est un `groupBy`
 * par téléphone, ordonné sur la commande la plus récente. Il n'existe aucune
 * colonne « nombre de commandes » ni « total réglé » à trier — elles sont
 * calculées. Les offrir supposerait de charger TOUS les acheteurs du vendeur
 * pour les classer en mémoire, ce que le §46 interdit.
 *
 * Un en-tête qui promet un tri qu'il ne sait pas rendre est pire qu'un en-tête
 * muet : on clique, rien ne bouge, et l'on conclut que l'écran est cassé.
 */
export default async function VendeurClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  /*
   * La devise du vendeur, une fois pour tout l'écran.
   *
   * Un vendeur a une monnaie — celle qu'il a choisie, à défaut celle de son
   * pays — et TOUTES ses écritures sont dans cette monnaie. Rien ne se mélange
   * ici, contrairement aux écrans de l'administration qui agrègent des
   * vendeurs.
   */
  const devise = deviseDuVendeur(user.sellerProfile);

  const { q, page: pageBrute } = await searchParams;
  const page = Math.max(1, Number(pageBrute) || 1);

  const { clients, total } = await chargerClientsVendeur({
    sellerId: user.sellerProfile.id,
    recherche: q,
    page,
    parPage: PAR_PAGE,
  });

  return (
    <div className="min-h-screen bg-cream text-ink">
      <MenuEspace
        user={user}
        nomAffiche={user.sellerProfile.businessName || user.name}
      />

      <main className="mx-auto max-w-[86rem] space-y-4 px-4 py-6 sm:px-6">
        <EnTeteListe
          titre="Clients"
          nombre={total}
          actions={
            <ActionListe
              href="/vendeur/commandes/nouvelle"
              icone="nouveau"
              principal
            >
              Créer une commande
            </ActionListe>
          }
        />

        <BarreRecherche placeholder="Nom, téléphone ou email…" />

        <CarteListe
          pagination={
            <Pagination
              page={page}
              total={total}
              parPage={PAR_PAGE}
              parametres={{ q }}
              chemin="/vendeur/clients"
              nom="clients"
            />
          }
        >
          {clients.length === 0 ? (
            <ListeVide
              titre={
                q
                  ? "Aucun client ne correspond à cette recherche"
                  : "Aucun client pour l'instant"
              }
              explication={
                q
                  ? "Essayez un autre nom, un autre numéro, ou retirez la recherche."
                  : "Vos acheteurs apparaîtront ici dès votre première commande, qu'ils aient un compte KOLI ou non."
              }
              action={
                !q ? (
                  <ActionListe
                    href="/vendeur/commandes/nouvelle"
                    icone="nouveau"
                    principal
                  >
                    Créer une commande
                  </ActionListe>
                ) : undefined
              }
            />
          ) : (
            <table className="w-full min-w-[58rem] border-collapse">
              <caption className="sr-only">
                Vos acheteurs, du plus récemment actif au plus ancien
              </caption>
              <EnTeteTableau>
                <Colonne>Client</Colonne>
                <Colonne>Téléphone</Colonne>
                <Colonne>Ville</Colonne>
                <Colonne aDroite>Commandes</Colonne>
                <Colonne aDroite>Total réglé</Colonne>
                <Colonne>Dernière</Colonne>
                <Colonne aDroite>Actions</Colonne>
              </EnTeteTableau>

              <tbody>
                {clients.map((client) => (
                  <LigneTableau key={client.telephone}>
                    <Cellule>
                      <span className="block max-w-[16rem] whitespace-normal font-semibold text-ink">
                        {client.nom}
                      </span>
                      {client.email && (
                        <span className="block max-w-[16rem] truncate text-xs text-ink-muted">
                          {client.email}
                        </span>
                      )}
                    </Cellule>

                    {/* Le téléphone est CLIQUABLE — c'est ainsi qu'un vendeur
                        rappelle son client depuis un mobile — donc une cible
                        tactile de 44 px (§74). `-my-2` reprend la hauteur sur
                        le remplissage de la ligne, qui n'est à personne. */}
                    <Cellule>
                      <a
                        href={`tel:${client.telephone.replace(/\s/g, "")}`}
                        className="-my-2 inline-flex min-h-[44px] items-center gap-1.5 font-mono text-xs text-ink-muted hover:text-brand"
                      >
                        <Icone nom="telephone" className="h-3.5 w-3.5 shrink-0" />
                        {client.telephone}
                      </a>
                    </Cellule>

                    <Cellule>
                      <span className="text-ink-muted">{client.ville || "—"}</span>
                    </Cellule>

                    {/*
                      * `data-commandes` porte le NOMBRE, et c'est ce que lit
                      * `verif:clients`.
                      *
                      * Il cherchait « 2 commandes » dans le texte de la page —
                      * une tournure de la mise en page en cartes. Dans un
                      * tableau, « Commandes » est un en-tête et la cellule ne
                      * porte que le chiffre.
                      */}
                    <Cellule aDroite>
                      <span
                        data-commandes={client.commandes}
                        className="font-semibold text-ink"
                      >
                        {client.commandes}
                      </span>
                      <span className="block text-[11px] text-ink-muted">
                        {pluriel(client.terminees, "terminée")}
                      </span>
                    </Cellule>

                    <Cellule aDroite>
                      <span className="font-semibold text-ink">
                        {formatMontant(client.totalRegle, devise)}
                      </span>
                      {/* On dit ce que le chiffre recouvre : le total des
                          commandes créées gonflerait le montant de tout ce qui
                          n'a jamais été payé. */}
                      <span className="block text-[11px] text-ink-muted">
                        paiements aboutis
                      </span>
                    </Cellule>

                    <Cellule>
                      <span className="text-ink-muted">
                        {JOUR_FR.format(client.derniereCommande)}
                      </span>
                    </Cellule>

                    <Cellule aDroite>
                      <div className="flex items-center justify-end gap-1">
                        {/*
                          * WhatsApp — la façon dont ce commerce se fait.
                          *
                          * ┌──────────────────────────────────────────────┐
                          * │  `wa.me` ouvre la conversation avec CE       │
                          * │  numéro : l'application sur un téléphone,    │
                          * │  WhatsApp Web sur un ordinateur.             │
                          * └──────────────────────────────────────────────┘
                          *
                          * ⚠ Le numéro doit être en format INTERNATIONAL et
                          * ne garder que des chiffres — ni « + », ni espaces,
                          * ni tirets. `wa.me/+225…` ouvre une conversation
                          * vide avec un message « numéro invalide », ce qui
                          * ressemble à une panne de KOLI.
                          *
                          * ⚠ Aucun texte pré-rempli, délibérément. Un message
                          * écrit d'avance part au nom du vendeur sans qu'il
                          * l'ait relu — et la première phrase envoyée à un
                          * client lui appartient.
                          */}
                        <a
                          href={`https://wa.me/${client.telephone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Écrire à ${client.nom} sur WhatsApp`}
                          title="WhatsApp"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-[#25D366]/12 text-[#128C7E] transition-colors hover:bg-[#25D366]/25"
                        >
                          <Icone nom="whatsapp" className="h-4 w-4" />
                        </a>

                        <Link
                          href={`/vendeur/commandes?q=${encodeURIComponent(
                            client.telephone
                          )}`}
                          aria-label={`Voir les commandes de ${client.nom}`}
                          title="Ses commandes"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors hover:bg-brand-border"
                        >
                          <Icone nom="commandes" className="h-4 w-4" />
                        </Link>
                      </div>
                    </Cellule>
                  </LigneTableau>
                ))}
              </tbody>
            </table>
          )}
        </CarteListe>
      </main>
    </div>
  );
}
