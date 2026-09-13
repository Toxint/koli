import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { MenuEspace } from "@/components/ui/MenuEspace";
import { formatMontant } from "@/lib/format";
import { deviseDuVendeur } from "@/data/markets";
import { chargerSoldeVendeur } from "@/lib/finance/solde";
import {
  chargerEncaissementsVendeur,
  chargerSequestreParJour,
} from "@/lib/finance/courbes";
import { mettreEnForme } from "@/lib/finance/jours";
import {
  TEINTE_COURBE,
  TEINTE_COURBE_SECONDE,
} from "@/lib/finance/teintes-courbes";
import { CourbePerformance } from "@/components/domain/CourbePerformance";
import { libelleStatut, classesBadgeStatut } from "@/lib/orders/statusLabels";
import {
  ActionListe,
  CarteListe,
  Cellule,
  Colonne,
  EnTeteTableau,
  LigneTableau,
  ListeVide,
  Pastille,
} from "@/components/ui/Liste";
import { BlocRevenu } from "@/components/ui/BlocRevenu";
import { Anneau } from "@/components/ui/Anneau";
import Link from "next/link";
import { Icone } from "@/components/ui/Icone";
import { MentionModeTest } from "@/components/ui/MentionModeTest";

const JOUR_FR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/**
 * Tableau de bord du vendeur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Trois étages, et l'ordre est celui des questions qu'on se pose en       │
 * │  ouvrant : combien j'ai · comment ça va · qu'est-ce qui bouge.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ── Ce que la refonte a retiré, et pourquoi ─────────────────────────────────
 *
 * **La bannière violette pleine largeur.** Elle occupait le tiers supérieur de
 * l'écran pour dire bonjour et répéter un bouton que la barre de navigation
 * porte déjà. Sur un téléphone, il fallait la faire défiler avant d'atteindre
 * le premier chiffre — c'est-à-dire avant la seule chose qu'on vient chercher.
 *
 * **Le double rendu des commandes récentes.** La liste existait deux fois dans
 * le même balisage : en cartes sous `md:`, en grille au-dessus. Deux rendus
 * des mêmes données finissent toujours par diverger, et c'est celui qu'on
 * regarde le moins qui ment en premier. Le tableau vit désormais dans
 * `CarteListe`, qui enferme le débordement horizontal — la page ne défile pas,
 * le tableau si (§8).
 */
export default async function SellerDashboardPage() {
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

  const sellerProfileId = user.sellerProfile.id;

  const productsCount = await prisma.product.count({
    where: { sellerId: sellerProfileId },
  });

  const orders = await prisma.order.findMany({
    where: { sellerId: sellerProfileId },
    include: {
      items: { include: { product: true } },
      fund: true,
      payment: true,
      delivery: true,
    },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  const totalOrdersCount = await prisma.order.count({
    where: { sellerId: sellerProfileId },
  });

  // Solde (§42) : meme module que la page Solde. Le calcul etait auparavant
  // duplique ici, et chargeait TOUTES les lignes de sequestre du vendeur en
  // memoire pour n en faire qu une somme (§46, §70). Il ignorait surtout la
  // commission, si bien que les deux ecrans annonceraient desormais deux
  // soldes differents.
  const solde = await chargerSoldeVendeur(sellerProfileId);
  const series = await chargerEncaissementsVendeur(sellerProfileId);
  const courbe = mettreEnForme(series.net);
  const courbeSequestre = mettreEnForme(
    await chargerSequestreParJour(sellerProfileId)
  );

  const terminees = await prisma.order.count({
    where: { sellerId: sellerProfileId, status: "COMPLETED" },
  });

  /*
   * Les trois chiffres des blocs, et l'évolution qui les accompagne.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │  Tout se calcule depuis la MÊME série de quatorze jours, déjà lue pour   │
   * │  la courbe. Refaire une requête par bloc donnerait quatre lectures du    │
   * │  registre pour un seul écran (§46) — et quatre occasions de diverger.    │
   * └──────────────────────────────────────────────────────────────────────────┘
   */
  const net = series.net.map((p) => p.montant);
  const revenuDuJour = net[net.length - 1] ?? 0;
  const hier = net[net.length - 2] ?? 0;

  const sept = net.slice(-7).reduce((s, v) => s + v, 0);
  const septPrecedents = net.slice(-14, -7).reduce((s, v) => s + v, 0);

  /**
   * L'évolution en pourcentage, ou `null` quand elle n'a PAS DE SENS.
   *
   * ⚠ Partir de zéro n'est pas « +100 % », c'est une division par zéro. Une
   * première vente après une semaine sans rien afficherait « +∞ » ou, pire,
   * un nombre plausible tiré de nulle part. On rend `null`, et le badge ne
   * s'affiche pas : un cadre sans badge se remarque, un pourcentage faux se
   * croit.
   */
  const evolution = (courant: number, precedent: number): number | null =>
    precedent > 0 ? ((courant - precedent) / precedent) * 100 : null;

  return (
    <div className="min-h-screen bg-cream text-ink">
      <MenuEspace
        user={user}
        nomAffiche={user.sellerProfile.businessName || user.name}
      />

      <main className="mx-auto max-w-[86rem] space-y-4 px-4 py-6 sm:px-6 lg:py-8">
        {/*
          * Le bonjour tient sur une ligne, comme un titre de liste.
          *
          * Il nomme l'enseigne — sur un téléphone partagé, c'est ce qui dit de
          * quelle boutique on tient les comptes — et laisse l'action à droite,
          * là où elle se trouve sur tous les autres écrans.
          */}
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-titre text-2xl font-extrabold tracking-tight text-heading">
              Bonjour, {user.sellerProfile.businessName || user.name}
            </h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              Vos ventes, vos encaissements et vos livraisons.
              <MentionModeTest> Mode test — aucun paiement réel.</MentionModeTest>
            </p>
          </div>
          <ActionListe
            href="/vendeur/commandes/nouvelle"
            icone="nouveau"
            principal
          >
            Créer une commande
          </ActionListe>
        </div>

        {/*
          * ┌────────────────────────────────────────────────────────────────┐
          * │  TROIS blocs de revenu — ce que vous avez gagné, ce que vous   │
          * │  gagnez aujourd'hui, ce qui vous attend.                       │
          * └────────────────────────────────────────────────────────────────┘
          *
          * C'est la demande de l'utilisateur, et l'ordre est le sien : total,
          * jour, en attente. Les trois portent un TON différent — plein,
          * sombre, clair — comme la maquette de référence : c'est ce qui dit
          * lequel on regarde en premier.
          */}
        {/*
          * ┌──────────────────────────────────────────────────────────────────┐
          * │  LES BLOCS À GAUCHE, LA COURBE À DROITE. C'est la maquette de    │
          * │  référence, et c'est la demande explicite de l'utilisateur.      │
          * └──────────────────────────────────────────────────────────────────┘
          *
          * La colonne de gauche fait un tiers, la courbe deux — elle a besoin
          * de largeur pour que quatorze jours ne se tassent pas, les blocs ont
          * besoin de hauteur pour porter un montant en grand.
          *
          * Sous `lg:` tout s'empile : trois blocs côte à côte sur un téléphone
          * donneraient trois colonnes de 100 px pour des montants à six
          * chiffres, et le §8 interdit que la page déborde pour autant.
          */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.9fr]">
          <div className="grid min-w-0 grid-cols-1 gap-4">
            {/*
              * « Revenus totaux » : le NET gagné DEPUIS TOUJOURS — et il ne
              * baisse JAMAIS.
              *
              * ┌────────────────────────────────────────────────────────────┐
              * │  Ce bloc affichait `soldeDisponible`. Depuis que le        │
              * │  versement existe, ce solde DIMINUE à chaque paiement du   │
              * │  vendeur : ses « revenus totaux » reculaient de 50 000     │
              * │  FCFA le jour où on lui versait 50 000 FCFA.               │
              * └────────────────────────────────────────────────────────────┘
              *
              * Un total de revenus qui baisse quand on vous paie se lit comme
              * une perte. C'est `verif:parcours` qui l'a fait remonter : la
              * refonte avait fait disparaître « Solde disponible » du tableau
              * de bord, alors que c'est la phrase qu'un vendeur cherche après
              * une vente (§80).
              *
              * Le montant est donc le libéré moins la commission — ce que les
              * versements ne touchent pas —, et le SOLDE DISPONIBLE, lui, est
              * dit en toutes lettres juste dessous.
              */}
            <BlocRevenu
              ton="marque"
              libelle="Revenus totaux"
              montant={formatMontant(
                Math.max(0, solde.brutLibere - solde.commissionRetenue),
                devise
              )}
              evolution={evolution(sept, septPrecedents)}
              identifiant="bloc-total"
              noteForte={`Solde disponible : ${formatMontant(solde.soldeDisponible, devise)}`}
              note="évolution sur sept jours"
              serie={net}
            />
            <BlocRevenu
              ton="sombre"
              libelle="Revenus du jour"
              montant={formatMontant(revenuDuJour, devise)}
              evolution={evolution(revenuDuJour, hier)}
              identifiant="bloc-jour"
              noteForte="Aujourd&apos;hui"
              note="comparé à hier"
              serie={net}
            />
            {/*
              * ⚠ Le troisième n'a NI badge NI courbe, et c'est délibéré.
              *
              * L'argent sous séquestre est un ENCOURS, pas un flux : il n'a
              * pas de « hier ». Lui coller un « +0 % » pour que les trois
              * cartes se ressemblent affirmerait une stabilité que personne
              * n'a mesurée.
              */}
            <BlocRevenu
              ton="clair"
              libelle="Revenus en attente"
              montant={formatMontant(solde.fondsSecurises, devise)}
              identifiant="bloc-attente"
              noteForte="Sous séquestre"
              note="jusqu'à confirmation de réception"
            />
          </div>

          {/*
           * La courbe — DEUX séries, une seule échelle, deux traits fins.
           *
           * « Mis sous séquestre » et « Versé » racontent les deux bouts de la
           * promesse KOLI : l'argent entre au paiement, il ne repart au vendeur
           * qu'à la confirmation de réception. L'écart entre les deux courbes
           * est ce qui dort en attendant — et s'il se creuse, c'est que les
           * clients ne confirment pas.
           *
           * Même monnaie, même ordre de grandeur : un seul axe. La règle du
           * projet interdit deux ÉCHELLES sur un cadre, pas deux courbes
           * comparables.
           *
           * ⚠ `rounded-2xl` sur CETTE carte n'est pas un choix d'arrondi :
           * `verif:courbes` remonte de `[data-courbe]` au premier ancêtre dont
           * la classe le contient, pour y lire le titre et le total. Changer la
           * classe casserait le contrôle sans toucher à la courbe.
           */}
          <div
            data-carte-courbe=""
            className="flex min-w-0 flex-col rounded-3xl border border-hairline bg-white p-6 shadow-sm sm:p-7"
          >
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div>
                <h2 className="font-titre text-lg font-bold text-heading">
                  Vos encaissements
                </h2>
                <p className="text-xs text-ink-muted">
                  Quatorze derniers jours, net de commission KOLI
                </p>
              </div>
              <span className="text-sm font-bold text-brand">
                {formatMontant(
                  courbe.reduce((s, p) => s + p.valeur, 0),
                  devise,
                )}{" "}
                sur la période
              </span>
            </div>

            <CourbePerformance
              devise={devise}
              points={courbe}
              couleur={TEINTE_COURBE}
              libelle="Versé"
              seconde={{
                points: courbeSequestre,
                libelle: "Mis sous séquestre",
                couleur: TEINTE_COURBE_SECONDE,
              }}
            />
          </div>
        </div>

        {/*
          * L'anneau et le catalogue, sur la ligne d'après — comme la maquette,
          * qui pose le cercle de pourcentage en bas à droite.
          *
          * L'anneau porte la part des commandes MENÉES À TERME : c'est la
          * seule proportion qui compte vraiment pour un vendeur KOLI — une
          * commande terminée est une commande dont l'argent a été libéré.
          */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-3xl border border-hairline bg-white p-6 shadow-sm">
            <Anneau
              part={terminees}
              total={totalOrdersCount}
              libelle="Commandes menées à terme"
            />
            <p className="text-center text-[11px] text-ink-muted">
              {terminees} sur {totalOrdersCount}
            </p>
          </div>

          <div className="flex min-w-0 flex-col justify-center rounded-3xl border border-hairline bg-white p-6 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Catalogue
            </span>
            <div className="mt-1 font-titre text-[1.75rem] font-extrabold leading-tight text-heading">
              {productsCount}
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              Articles enregistrés, actifs ou retirés
            </p>
          </div>

          <div className="flex min-w-0 flex-col justify-center rounded-3xl border border-hairline bg-white p-6 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Commandes
            </span>
            <div className="mt-1 font-titre text-[1.75rem] font-extrabold leading-tight text-heading">
              {totalOrdersCount}
            </div>
            <p className="mt-1 text-[11px] text-ink-muted">
              Depuis l&apos;ouverture de votre boutique
            </p>
          </div>
        </div>

        {/* Les commandes récentes, dans le MÊME tableau que l'onglet
            Commandes : mêmes colonnes, mêmes pastilles, même lecture. Un
            aperçu qui s'affiche autrement que la liste complète oblige à
            réapprendre l'écran à chaque fois. */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <h2 className="font-titre text-lg font-bold text-heading">
            Commandes récentes
          </h2>
          <ActionListe href="/vendeur/commandes" icone="commandes">
            Voir toutes les commandes
          </ActionListe>
        </div>

        <CarteListe>
          {orders.length === 0 ? (
            <ListeVide
              titre="Aucune commande enregistrée"
              explication="Créez votre première commande : KOLI génère un lien de paiement à partager, et garde l'argent jusqu'à la réception."
              action={
                <ActionListe
                  href="/vendeur/commandes/nouvelle"
                  icone="nouveau"
                  principal
                >
                  Créer une commande
                </ActionListe>
              }
            />
          ) : (
            <table className="w-full min-w-[52rem] border-collapse">
              <caption className="sr-only">
                Vos six commandes les plus récentes
              </caption>
              <EnTeteTableau>
                <Colonne>Référence</Colonne>
                <Colonne>Client</Colonne>
                <Colonne>Statut</Colonne>
                <Colonne aDroite>Total</Colonne>
                <Colonne>Créée le</Colonne>
                <Colonne aDroite>Actions</Colonne>
              </EnTeteTableau>

              <tbody>
                {orders.map((order) => {
                  const totalAmount = order.items.reduce(
                    (acc, item) => acc + item.unitPrice * item.quantity,
                    order.deliveryFee,
                  );

                  return (
                    <LigneTableau key={order.id}>
                      <Cellule>
                        <span className="font-mono text-sm font-bold text-brand">
                          {order.reference}
                        </span>
                      </Cellule>

                      <Cellule>
                        <span className="block font-semibold text-ink">
                          {order.buyerName}
                        </span>
                        {/* Cible tactile de 44 px : c'est un lien `tel:`, et
                            c'est ainsi qu'on rappelle un client (§74). */}
                        <a
                          href={`tel:${order.buyerPhone.replace(/\s/g, "")}`}
                          className="-my-2 inline-flex min-h-[44px] items-center text-xs text-ink-muted hover:text-brand"
                        >
                          {order.buyerPhone}
                        </a>
                      </Cellule>

                      <Cellule>
                        <Pastille classes={classesBadgeStatut(order.status)}>
                          {libelleStatut(order.status)}
                        </Pastille>
                      </Cellule>

                      <Cellule aDroite>
                        <span className="font-semibold text-ink">
                          {formatMontant(totalAmount, devise)}
                        </span>
                      </Cellule>

                      <Cellule>
                        <span className="text-ink-muted">
                          {JOUR_FR.format(order.createdAt)}
                        </span>
                      </Cellule>

                      <Cellule aDroite>
                        <Link
                          href={`/pay/${order.reference}`}
                          aria-label={`Ouvrir le lien de paiement de la commande ${order.reference}`}
                          title="Lien de paiement"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors hover:bg-brand-border"
                        >
                          <Icone nom="lien" className="h-4 w-4" />
                        </Link>
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
