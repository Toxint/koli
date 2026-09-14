import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PayoutStatus, type Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { MenuEspace } from "@/components/ui/MenuEspace";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import {
  CarteListe,
  Cellule,
  Colonne,
  EnTeteListe,
  EnTeteTableau,
  LigneTableau,
  ListeVide,
  Pastille,
} from "@/components/ui/Liste";
import { ReglerVersement } from "@/components/domain/ReglerVersement";
import { formatMontant, formatTotaux, pluriel } from "@/lib/format";
import { commeDevise, type Devise } from "@/data/markets";
import { Icone } from "@/components/ui/Icone";
import { MentionModeTest } from "@/components/ui/MentionModeTest";
import { estFictive } from "@/lib/notifications/textes";

export const metadata: Metadata = { title: "Versements" };

const PAR_PAGE = 20;
const DATE_FR = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const LIBELLE: Record<PayoutStatus, string> = {
  PENDING: "En attente",
  PAID: "Versé",
  REJECTED: "Refusé",
};

const CLASSES: Record<PayoutStatus, string> = {
  PENDING: "bg-gold-soft text-gold-deep",
  PAID: "bg-brand-soft text-brand",
  REJECTED: "bg-red-50 text-danger",
};

/**
 * La file des versements aux vendeurs (§43).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  C'est le SEUL écran de KOLI depuis lequel de l'argent quitte la        │
 * │  plateforme. Tout le reste déplace des soldes à l'intérieur.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le versement est exécuté **à la main** : iKeePay documente un point d'entrée
 * `h2h-payout`, mais il n'a jamais été appelé. Un transfert fait à la main ne
 * peut rien perdre à une API non éprouvée, et avec quelques vendeurs c'est
 * trivial. L'appel automatique se branchera derrière la même abstraction que
 * l'encaissement, une fois `h2h-payout` exercé pour de vrai.
 *
 * **Les demandes en attente d'abord, de la plus ancienne à la plus récente.**
 * L'ancienneté mesure l'attente d'un vendeur qui n'a pas son argent — c'est le
 * même ordre que la file des remboursements, et pour la même raison.
 */
export default async function AdminVersementsPage({
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

  const where: Prisma.PayoutWhereInput = {
    ...(statut ? { status: statut as PayoutStatus } : {}),
    ...(q
      ? {
          OR: [
            { phone: { contains: q } },
            { seller: { businessName: { contains: q } } },
            { seller: { user: { name: { contains: q } } } },
          ],
        }
      : {}),
  };

  const [versements, total, enAttente, enAttenteLignes, administrateurs] = await Promise.all([
    prisma.payout.findMany({
      where,
      include: {
        seller: {
          select: { businessName: true, user: { select: { name: true, phone: true } } },
        },
      },
      /* Les demandes en attente d'abord : `PENDING` précède `PAID` et
         `REJECTED` dans l'énumération, et l'ordre croissant les remonte. Puis
         la plus ancienne — l'attente d'un vendeur se mesure en jours. */
      orderBy: [{ status: "asc" }, { requestedAt: "asc" }],
      skip: (page - 1) * PAR_PAGE,
      take: PAR_PAGE,
    }),
    prisma.payout.count({ where }),
    prisma.payout.count({ where: { status: PayoutStatus.PENDING } }),
    /*
     * ⚠ Le volume en attente ne peut PAS être une seule somme.
     *
     * Cet écran agrège tous les vendeurs, donc XOF et XAF. Les deux valent
     * exactement la même chose — arrimés à l'euro au même taux — mais ce sont
     * deux monnaies : on ne règle pas un vendeur camerounais avec des francs
     * CFA d'Afrique de l'Ouest. La somme se présenterait comme un montant
     * versable, et ne l'est pas.
     *
     * La devise est ici sur `Payout` lui-même : un simple `groupBy` suffit,
     * sans la jointure qu'exigent `Payment` ou `Fund`.
     */
    prisma.payout.groupBy({
      by: ["currency"],
      where: { status: PayoutStatus.PENDING },
      _sum: { amount: true },
    }),
    /* Qui, dans l'équipe, peut être PRÉVENU d'une demande — voir l'avertissement
       plus bas. Quelques lignes : l'équipe n'a pas cinquante administrateurs. */
    prisma.user.findMany({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { email: true, emailBouncedAt: true },
    }),
  ]);

  /*
   * ⚠ PERSONNE NE PEUT RECEVOIR L'AVIS — et cela ne se voyait nulle part.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │  L'administrateur en ligne est `admin@koli.ci`. Or `koli.ci` est sur    │
   * │  la liste des adresses de DÉMONSTRATION, que le canal écarte exprès     │
   * │  (§8) : le courriel « un vendeur demande un versement » ne partirait    │
   * │  jamais, et rien ne le dirait.                                          │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * C'est exactement la forme des deux paiements perdus du 6 septembre 2026 :
   * une panne muette sur le chemin par lequel arrive l'information. L'écran le
   * DIT, plutôt que de laisser la file se remplir en silence.
   */
  const joignables = administrateurs.filter(
    (a) => a.email && !estFictive(a.email) && !a.emailBouncedAt
  ).length;

  const parDevise: Partial<Record<Devise, number>> = {};
  for (const l of enAttenteLignes) {
    const d = commeDevise(l.currency);
    parDevise[d] = (parDevise[d] ?? 0) + (l._sum.amount ?? 0);
  }
  const volumeAttente = formatTotaux(parDevise);

  return (
    <div className="min-h-screen bg-cream text-ink">
      <MenuEspace user={user} />

      <main className="mx-auto max-w-[86rem] space-y-4 px-4 py-6 sm:px-6">
        <EnTeteListe titre="Versements" nombre={total} />
        <p className="-mt-2 text-sm text-ink-muted">
          {pluriel(enAttente, "demande en attente", "demandes en attente")}
          {volumeAttente && ` · ${volumeAttente}`}
        </p>

        {joignables === 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="flex items-start gap-2 text-sm text-danger">
              <Icone nom="alerte" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong>Aucun administrateur ne peut être prévenu par courriel.</strong>{" "}
                Les demandes de versement s&apos;affichent ici, mais personne ne
                recevra d&apos;avis : l&apos;adresse du compte administrateur est
                une adresse de démonstration, ou elle a rebondi. Un vendeur peut
                donc attendre son argent sans que l&apos;équipe le sache.
                Renseignez une vraie adresse sur le compte administrateur.
              </span>
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-brand-border bg-brand-soft/50 p-4">
          <p className="flex items-start gap-2 text-xs text-ink-muted">
            <Icone nom="eclair" className="mt-0.5 h-4 w-4 shrink-0 text-test-mode" />
            <span>
              <MentionModeTest>
                Mode test : aucun mouvement d&apos;argent réel.{" "}
              </MentionModeTest>
              Le transfert se fait <strong>à la main</strong> depuis
              l&apos;application Mobile Money, puis se marque ici. Notez la
              référence du transfert : c&apos;est elle qui permettra de
              rapprocher ce registre du relevé du prestataire.
            </span>
          </p>
        </div>

        <BarreRecherche
          placeholder="Enseigne, nom ou numéro du vendeur…"
          filtres={[
            {
              cle: "statut",
              libelle: "Filtrer par état",
              libelleTous: "Tous les versements",
              options: [
                { valeur: "PENDING", libelle: "En attente" },
                { valeur: "PAID", libelle: "Versés" },
                { valeur: "REJECTED", libelle: "Refusés" },
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
              parametres={{ q, statut }}
              chemin="/admin/versements"
              nom="versements"
            />
          }
        >
          {versements.length === 0 ? (
            <ListeVide
              titre={
                q || statut
                  ? "Aucun versement ne correspond"
                  : "Aucune demande de versement"
              }
              explication={
                q || statut
                  ? "Essayez une autre enseigne, un autre numéro, ou retirez le filtre."
                  : "Une demande apparaît ici dès qu'un vendeur réclame son solde."
              }
            />
          ) : (
            <table className="w-full min-w-[64rem] border-collapse">
              <caption className="sr-only">
                Les demandes de versement, celles en attente d&apos;abord
              </caption>
              <EnTeteTableau>
                <Colonne>Vendeur</Colonne>
                <Colonne aDroite>Montant</Colonne>
                <Colonne>Destination</Colonne>
                <Colonne>Demandé le</Colonne>
                <Colonne>État</Colonne>
                <Colonne aDroite>Action</Colonne>
              </EnTeteTableau>

              <tbody>
                {versements.map((v) => {
                  const devise = commeDevise(v.currency);
                  const nom = v.seller.businessName || v.seller.user.name;

                  return (
                    <LigneTableau key={v.id}>
                      <Cellule>
                        <span className="block max-w-[14rem] whitespace-normal font-semibold text-ink">
                          {nom}
                        </span>
                        <span className="block font-mono text-xs text-ink-muted">
                          {v.seller.user.phone}
                        </span>
                      </Cellule>

                      <Cellule aDroite>
                        <span className="font-semibold text-ink">
                          {formatMontant(v.amount, devise)}
                        </span>
                      </Cellule>

                      {/* La DESTINATION de l'argent, en évidence : c'est ce que
                          l'administrateur va recopier dans son application
                          Mobile Money. */}
                      <Cellule>
                        <span className="block font-mono text-sm font-bold text-brand">
                          {v.phone}
                        </span>
                        {/* Le nom du TITULAIRE, à comparer à ce qu'affiche
                            l'application de transfert avant d'envoyer : deux
                            chiffres inversés donnent un numéro valide
                            appartenant à quelqu'un d'autre, et seul le nom le
                            trahit. Nul pour les versements demandés avant
                            l'existence des numéros enregistrés. */}
                        {v.holderName && (
                          <span className="block text-xs font-semibold text-ink">
                            {v.holderName}
                          </span>
                        )}
                        <span className="block text-xs text-ink-muted">
                          {v.operator ?? "opérateur non précisé"}
                        </span>
                      </Cellule>

                      <Cellule>
                        <span className="text-ink-muted">
                          {DATE_FR.format(v.requestedAt)}
                        </span>
                      </Cellule>

                      <Cellule>
                        <Pastille classes={CLASSES[v.status]}>
                          {LIBELLE[v.status]}
                        </Pastille>
                        {v.processedAt && (
                          <span className="mt-1 block text-[11px] text-ink-muted">
                            {DATE_FR.format(v.processedAt)}
                            {v.processedBy ? ` · ${v.processedBy}` : ""}
                          </span>
                        )}
                        {v.providerRef && (
                          <span className="mt-0.5 block font-mono text-[11px] text-ink-muted">
                            {v.providerRef}
                          </span>
                        )}
                        {v.status === PayoutStatus.REJECTED && v.reason && (
                          <span className="mt-0.5 block max-w-[16rem] whitespace-normal text-[11px] text-ink-muted">
                            {v.reason}
                          </span>
                        )}
                      </Cellule>

                      <Cellule aDroite>
                        {v.status === PayoutStatus.PENDING ? (
                          <div className="flex justify-end">
                            <ReglerVersement
                              id={v.id}
                              montant={v.amount}
                              devise={devise}
                              telephone={v.phone}
                              vendeur={nom}
                            />
                          </div>
                        ) : (
                          /* Rien à faire : un versement réglé ne se rejoue pas
                             et ne s'annule pas — l'argent est parti. */
                          <span className="text-xs text-ink-muted">—</span>
                        )}
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
