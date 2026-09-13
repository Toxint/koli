import Link from "next/link";
import type { LigneFactureListe } from "@/lib/invoices/liste";
import { formatMontant } from "@/lib/format";
import { commeDevise } from "@/data/markets";
import { libelleStatut, classesBadgeStatut } from "@/lib/orders/statusLabels";
import { Icone } from "@/components/ui/Icone";
import {
  Cellule,
  Colonne,
  EnTeteTableau,
  LigneTableau,
  ListeVide,
  Pastille,
} from "@/components/ui/Liste";

/**
 * Liste de factures (§38, phase 20).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  En TABLEAU depuis la refonte. Son nom disait déjà « tableau » ; le      │
 * │  balisage était une pile de cartes.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'ancien commentaire disait : « à 390 px, sept colonnes débordent ou
 * deviennent illisibles ». C'était vrai d'un tableau qui pousse la PAGE ; le
 * débordement est désormais enfermé dans `CarteListe` (`overflow-x-auto`), et
 * c'est le tableau qui défile, jamais le document (§8). Le choix ne se pose
 * donc plus dans les mêmes termes.
 *
 * Il sert **deux** écrans — les factures du vendeur et celles du client — et
 * c'est pour cela qu'il existe : deux listes de factures écrites séparément
 * finiraient par afficher deux vérités différentes de la même pièce.
 *
 * ⚠ Chaque ligne porte `data-facture` avec son numéro. `verif:factures` lit
 * cet attribut plutôt que de chercher `FAC-\d{4}-\d{6}` dans le texte d'un
 * `<li>` : le contrôle survit ainsi à la prochaine refonte, alors qu'un
 * sélecteur de balisage la subit.
 */

const LIBELLE_PAIEMENT: Record<string, string> = {
  PENDING: "En attente",
  SUCCEEDED: "Réglé",
  FAILED: "Échoué",
  REFUNDED: "Remboursé",
};

/** Le remboursement se signale : la pièce reste valable, le montant non. */
function classesPaiement(statut: string) {
  if (statut === "SUCCEEDED") return "bg-brand-soft text-brand";
  if (statut === "REFUNDED" || statut === "FAILED")
    return "bg-red-50 text-danger";
  return "bg-hairline text-ink-muted";
}

const DATE_FR = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function TableauFactures({
  lignes,
  libelleContrepartie,
  vide,
}: {
  lignes: LigneFactureListe[];
  /** « Client » côté vendeur, « Vendeur » côté client. */
  libelleContrepartie: string;
  vide: { titre: string; explication: string };
}) {
  if (lignes.length === 0) {
    return <ListeVide titre={vide.titre} explication={vide.explication} />;
  }

  return (
    <table
      data-factures=""
      className="w-full min-w-[58rem] border-collapse"
    >
      <caption className="sr-only">
        Vos factures, de la plus récente à la plus ancienne
      </caption>
      <EnTeteTableau>
        <Colonne>Numéro</Colonne>
        <Colonne>{libelleContrepartie}</Colonne>
        <Colonne>Paiement</Colonne>
        <Colonne>Commande</Colonne>
        <Colonne>Émise le</Colonne>
        <Colonne aDroite>Total</Colonne>
        <Colonne aDroite>Actions</Colonne>
      </EnTeteTableau>

      <tbody>
        {lignes.map((f) => (
          <LigneTableau key={f.numero}>
            <Cellule>
              <span
                data-facture={f.numero}
                className="font-mono text-sm font-bold text-brand"
              >
                {f.numero}
              </span>
            </Cellule>

            {/* `data-contrepartie` : côté client, `verif:factures` vérifie que
                cette colonne nomme le VENDEUR et non l'acheteur lui-même — une
                liste où chaque ligne porte son propre nom n'apprend rien. Il
                cherchait « Vendeur : » dans le texte, une tournure des cartes ;
                dans un tableau, « Vendeur » est un en-tête. */}
            <Cellule>
              <span
                data-contrepartie={f.contrepartie}
                className="block max-w-[16rem] whitespace-normal font-semibold text-ink"
              >
                {f.contrepartie}
              </span>
              <span className="block font-mono text-xs text-ink-muted">
                {f.referenceCommande}
              </span>
            </Cellule>

            <Cellule>
              <Pastille classes={classesPaiement(f.statutPaiement)}>
                {LIBELLE_PAIEMENT[f.statutPaiement] ?? f.statutPaiement}
              </Pastille>
            </Cellule>

            <Cellule>
              <Pastille classes={classesBadgeStatut(f.statutCommande)}>
                {libelleStatut(f.statutCommande)}
              </Pastille>
            </Cellule>

            <Cellule>
              <time
                dateTime={f.emiseLe.toISOString()}
                className="text-ink-muted"
              >
                {DATE_FR.format(f.emiseLe)}
              </time>
            </Cellule>

            {/* La devise vient de la PIÈCE, pas du lecteur : une facture est
                un document figé, et le registre ne se relit pas. */}
            <Cellule aDroite>
              <span className="font-semibold text-ink">
                {formatMontant(f.total, commeDevise(f.devise))}
              </span>
            </Cellule>

            <Cellule aDroite>
              <Link
                href={`/facture/${f.referenceCommande}`}
                aria-label={`Ouvrir la facture ${f.numero}`}
                title="Ouvrir"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors hover:bg-brand-border"
              >
                <Icone nom="recu" className="h-4 w-4" />
              </Link>
            </Cellule>
          </LigneTableau>
        ))}
      </tbody>
    </table>
  );
}
