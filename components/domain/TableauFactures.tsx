import Link from "next/link";
import type { LigneFactureListe } from "@/lib/invoices/liste";
import { formatCFA } from "@/lib/format";
import { libelleStatut, classesBadgeStatut } from "@/lib/orders/statusLabels";
import { Icone } from "@/components/ui/Icone";

/**
 * Liste de factures (§38, phase 20).
 *
 * En cartes empilées et non en tableau : à 390px, sept colonnes débordent ou
 * deviennent illisibles, et c'est l'écran de la quasi-totalité des
 * utilisateurs.
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
    return (
      <div className="text-center py-12">
        <Icone nom="recu" className="w-9 h-9 mx-auto text-brand" />
        <p className="text-sm font-semibold mt-2">{vide.titre}</p>
        <p className="text-xs text-ink-muted mt-1 max-w-sm mx-auto">
          {vide.explication}
        </p>
      </div>
    );
  }

  return (
    <ul data-factures="" className="divide-y divide-hairline">
      {lignes.map((f) => (
        <li
          key={f.numero}
          className="py-4 first:pt-0 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-sm">{f.numero}</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${classesPaiement(f.statutPaiement)}`}
              >
                {LIBELLE_PAIEMENT[f.statutPaiement] ?? f.statutPaiement}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${classesBadgeStatut(f.statutCommande)}`}
              >
                {libelleStatut(f.statutCommande)}
              </span>
            </div>

            <p className="text-xs text-ink-muted mt-1 break-words">
              {libelleContrepartie} : {f.contrepartie} ·{" "}
              <span className="font-mono">{f.referenceCommande}</span>
            </p>
            <p className="text-[11px] text-ink-muted mt-0.5">
              Émise le{" "}
              <time dateTime={f.emiseLe.toISOString()}>
                {DATE_FR.format(f.emiseLe)}
              </time>
            </p>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
            <span className="font-semibold tabular-nums whitespace-nowrap">
              {formatCFA(f.total)}
            </span>

            <Link
              href={`/facture/${f.referenceCommande}`}
              aria-label={`Ouvrir la facture ${f.numero}`}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-lg bg-brand-soft text-brand hover:bg-brand-soft text-xs font-bold transition-all"
            >
              <Icone nom="recu" className="w-4 h-4" />
              Ouvrir
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
