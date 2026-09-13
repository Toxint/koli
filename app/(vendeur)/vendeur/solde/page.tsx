import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/actions";
import { MenuEspace } from "@/components/ui/MenuEspace";
import { formatMontant } from "@/lib/format";
import { deviseDuVendeur } from "@/data/markets";
import { chargerSoldeVendeur } from "@/lib/finance/solde";
import { chargerJournal } from "@/lib/finance/journal";
import { TableauJournal } from "@/components/domain/TableauJournal";
import { DemanderVersement } from "@/components/domain/DemanderVersement";
import {
  CarteListe,
  Cellule,
  Colonne,
  EnTeteTableau,
  LigneTableau,
  Pastille,
} from "@/components/ui/Liste";
import { commeDevise } from "@/data/markets";
import { prisma } from "@/lib/db/prisma";
import { Icone } from "@/components/ui/Icone";
import { MentionModeTest } from "@/components/ui/MentionModeTest";

export const metadata: Metadata = { title: "Solde" };

const DERNIERS_MOUVEMENTS = 10;
const JOUR_FR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

const LIBELLE_VERSEMENT: Record<string, string> = {
  PENDING: "En attente",
  PAID: "Versé",
  REJECTED: "Refusé",
};

/* Les mêmes familles de couleur que partout : ce qui est acquis en violet de
   la marque, ce qui attend en ambre, ce qui alerte en rouge. */
const CLASSES_VERSEMENT: Record<string, string> = {
  PENDING: "bg-gold-soft text-gold-deep",
  PAID: "bg-brand-soft text-brand",
  REJECTED: "bg-red-50 text-danger",
};

export default async function SoldeVendeurPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  /*
   * La devise du vendeur, une fois pour tout l'écran.
   *
   * Un vendeur a un pays, donc une monnaie ; et depuis que la commande suit
   * le vendeur et non l'acheteur, TOUTES ses écritures sont dans cette
   * monnaie. Rien ne se mélange ici — contrairement aux écrans de
   * l'administration, qui agrègent plusieurs vendeurs.
   */
  const devise = deviseDuVendeur(user.sellerProfile);

  const sellerId = user.sellerProfile.id;

  // Le solde vient d'un module partagé avec le tableau de bord (§42) : deux
  // calculs séparés d'un même chiffre finissent toujours par diverger.
  const [solde, journal, versements] = await Promise.all([
    chargerSoldeVendeur(sellerId),
    chargerJournal({ sellerId, page: 1, parPage: DERNIERS_MOUVEMENTS }),
    /* Les versements de CE vendeur, les plus récents d'abord. Bornés : cette
       liste est un aperçu, pas un historique complet (§46). */
    prisma.payout.findMany({
      where: { sellerId },
      orderBy: { requestedAt: "desc" },
      take: DERNIERS_MOUVEMENTS,
    }),
  ]);

  return (
    <div className="min-h-screen bg-cream text-ink">
      <MenuEspace
        user={user}
        nomAffiche={user.sellerProfile.businessName || user.name}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Mon solde
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            <MentionModeTest>
              Tous les montants sont simulés — KOLI fonctionne en mode test.
            </MentionModeTest>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-hairline p-5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
              Fonds sécurisés (test)
            </span>
            <div className="text-2xl font-bold text-brand">
              {formatMontant(solde.fondsSecurises, devise)}
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
              {formatMontant(solde.soldeDisponible, devise)}
            </div>
            {/* Le solde est net de commission. Le dire ici évite qu'un vendeur
                compare ce chiffre au montant de ses ventes et croie à une
                erreur — il manquerait sinon quelques milliers de francs sans
                aucune explication à l'écran. */}
            <p className="mt-1 text-xs text-ink-muted">
              {solde.commissionRetenue > 0 ? (
                <>
                  {formatMontant(solde.brutLibere, devise)} libérés, moins{" "}
                  {formatMontant(solde.commissionRetenue, devise)} de commission
                  KOLI.
                </>
              ) : (
                "Libéré après confirmation de réception."
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-hairline p-5">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-1">
              Total gagné (test)
            </span>
            <div className="text-2xl font-bold">
              {formatMontant(solde.totalGagne, devise)}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Sécurisé et disponible cumulés.
            </p>
          </div>
        </div>

        {/*
          * §43 — le versement EXISTE désormais.
          *
          * Ce bloc portait un bouton désactivé et la phrase « les retraits
          * réels seront disponibles après activation du système de paiement ».
          * Sur un service dont le sujet est la confiance, c'était le pire
          * endroit où s'arrêter : un vendeur voyait son solde monter et ne
          * pouvait pas en sortir l'argent.
          */}
        <DemanderVersement
          versable={solde.versable}
          enAttente={solde.versementEnAttente}
          devise={devise}
        />

        {versements.length > 0 && (
          <section>
            <h2 className="mb-3 font-titre text-lg font-bold text-heading">
              Mes versements
            </h2>
            {/* Les versements ont leur propre liste, séparée des mouvements de
                commande : ils ne passent pas par `Transaction` — `orderId` y
                est obligatoire, et un versement solde un cumul. */}
            <CarteListe>
              <table className="w-full min-w-[44rem] border-collapse">
                <caption className="sr-only">
                  Vos demandes de versement, de la plus récente à la plus ancienne
                </caption>
                <EnTeteTableau>
                  <Colonne>Demandé le</Colonne>
                  <Colonne aDroite>Montant</Colonne>
                  <Colonne>Numéro</Colonne>
                  <Colonne>État</Colonne>
                  <Colonne>Référence</Colonne>
                </EnTeteTableau>
                <tbody>
                  {versements.map((v) => (
                    <LigneTableau key={v.id}>
                      <Cellule>
                        <span className="text-ink-muted">
                          {JOUR_FR.format(v.requestedAt)}
                        </span>
                      </Cellule>
                      <Cellule aDroite>
                        <span className="font-semibold text-ink">
                          {formatMontant(v.amount, commeDevise(v.currency))}
                        </span>
                      </Cellule>
                      <Cellule>
                        <span className="font-mono text-xs text-ink-muted">
                          {v.phone}
                        </span>
                      </Cellule>
                      <Cellule>
                        <Pastille classes={CLASSES_VERSEMENT[v.status]}>
                          {LIBELLE_VERSEMENT[v.status]}
                        </Pastille>
                        {/* Un refus SANS motif est incompréhensible pour celui
                            qui le reçoit : il ne sait ni pourquoi, ni quoi
                            corriger. */}
                        {v.status === "REJECTED" && v.reason && (
                          <span className="mt-1 block max-w-[18rem] whitespace-normal text-[11px] text-ink-muted">
                            {v.reason}
                          </span>
                        )}
                      </Cellule>
                      <Cellule>
                        <span className="font-mono text-xs text-ink-muted">
                          {v.providerRef ?? "—"}
                        </span>
                      </Cellule>
                    </LigneTableau>
                  ))}
                </tbody>
              </table>
            </CarteListe>
          </section>
        )}

        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-lg">Derniers mouvements</h2>
            <Link
              href="/vendeur/transactions"
              className="inline-flex items-center gap-1 min-h-[44px] text-xs font-semibold text-brand hover:underline"
            >
              Voir tout le journal
              <Icone nom="fleche-droite" className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="rounded-2xl border border-hairline p-4 sm:p-6">
            <TableauJournal
              lignes={journal.lignes}
              lienCommande={(reference) => `/pay/${reference}`}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
