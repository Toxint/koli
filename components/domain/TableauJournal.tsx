import Link from "next/link";
import type { LigneJournal } from "@/lib/finance/journal";
import { LIBELLES_TYPE, EXPLICATIONS } from "@/lib/finance/journal";
import { formatCFA } from "@/lib/format";
import { Icone } from "@/components/ui/Icone";

/**
 * Le journal financier à l'écran (§40).
 *
 * En cartes et non en tableau : à 390px — l'écran de la grande majorité des
 * utilisateurs — six colonnes deviennent illisibles ou débordent. La même
 * information est présentée en lignes empilées sur téléphone et alignées à
 * partir de la tablette.
 */

/** Un débit s'écrit en rouge et un crédit en vert : c'est ce qu'on attend. */
function classesMontant(montant: number) {
  return montant < 0 ? "text-danger" : "text-brand";
}

function Signe({ montant }: { montant: number }) {
  // Le signe est explicite des deux côtés. Un « 2 500 FCFA » sans signe, sur
  // une ligne de commission, se lit comme une recette du vendeur alors que
  // c'est une retenue.
  return (
    <span className={`font-semibold tabular-nums ${classesMontant(montant)}`}>
      {montant < 0 ? "−" : "+"} {formatCFA(Math.abs(montant))}
    </span>
  );
}

const dateCourte = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function TableauJournal({
  lignes,
  montrerVendeur = false,
  lienCommande,
}: {
  lignes: LigneJournal[];
  /** L'administration voit de quel vendeur relève chaque écriture. */
  montrerVendeur?: boolean;
  /** Fabrique le lien vers la commande, ou rien si l'espace n'en a pas. */
  lienCommande?: (reference: string) => string;
}) {
  if (lignes.length === 0) {
    return (
      <div className="text-center py-12">
        <Icone nom="journal" className="w-9 h-9 mx-auto text-brand" />
        <p className="text-sm font-semibold mt-2">Aucune écriture</p>
        <p className="text-xs text-ink-muted mt-1 max-w-sm mx-auto">
          Le journal se remplit à chaque paiement, mise sous séquestre,
          libération ou remboursement.
        </p>
      </div>
    );
  }

  return (
    /* `data-journal` : point d'ancrage stable pour les vérifications. Sans
       lui, un contrôle sur le texte de la page attrape aussi les libellés du
       menu de filtrage, et croit voir des écritures qui n'y sont pas. */
    <ul data-journal="" className="divide-y divide-hairline">
      {lignes.map((l) => (
        <li
          key={l.id}
          className="py-4 first:pt-0 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-sm">
                {LIBELLES_TYPE[l.type]}
              </span>
              {/* Le taux figé sur l'écriture, et non le taux du jour : c'est ce
                  qui rend la ligne vérifiable des années plus tard. */}
              {l.taux !== null && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-brand-soft text-brand">
                  {l.taux} %
                </span>
              )}
            </div>

            <p className="text-xs text-ink-muted mt-0.5">
              {EXPLICATIONS[l.type]}
            </p>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-ink-muted">
              {lienCommande ? (
                /* `min-h-[44px]` : le texte fait 12px, mais une cible tactile
                   descend au minimum à 44px (§74). Sans cela, le lien est
                   pratiquement impossible à atteindre au pouce. */
                <Link
                  href={lienCommande(l.reference)}
                  className="inline-flex items-center min-h-[44px] font-mono font-semibold text-brand hover:underline break-all"
                >
                  {l.reference}
                </Link>
              ) : (
                <span className="font-mono font-semibold text-brand break-all">
                  {l.reference}
                </span>
              )}
              <span aria-hidden="true">·</span>
              <span className="break-words">{l.client}</span>
              {montrerVendeur && l.vendeur && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="break-words">{l.vendeur}</span>
                </>
              )}
            </div>
          </div>

          <div className="sm:text-right shrink-0">
            <Signe montant={l.montant} />
            <span className="block text-[11px] text-ink-muted mt-0.5">
              <time dateTime={l.date.toISOString()}>
                {dateCourte.format(l.date)}
              </time>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Les totaux par nature, au-dessus du journal.
 *
 * `PAYMENT` et `FUNDS_SECURED` décrivent le même argent vu de deux côtés : les
 * empiler dans un total unique le compterait deux fois. D'où une ligne par
 * nature, jamais de somme générale.
 */
export function TotauxJournal({
  totaux,
}: {
  totaux: { type: LigneJournal["type"]; montant: number; nombre: number }[];
}) {
  if (totaux.length === 0) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {totaux.map((t) => (
        <div key={t.type} className="rounded-2xl border border-hairline p-4">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            {LIBELLES_TYPE[t.type]}
          </span>
          <span
            className={`block text-lg font-bold mt-1 tabular-nums ${classesMontant(t.montant)}`}
          >
            {t.montant < 0 ? "−" : "+"} {formatCFA(Math.abs(t.montant))}
          </span>
          <span className="block text-[11px] text-ink-muted mt-0.5">
            {t.nombre} écriture{t.nombre > 1 ? "s" : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
