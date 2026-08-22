import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";
import { Icone } from "@/components/ui/Icone";

/**
 * Barre de compte des pages sans menu latéral.
 *
 * Trois écrans en étaient dépourvus — l'assistant de commande, le reçu et le
 * suivi de paiement — et n'offraient donc **aucun moyen de se déconnecter** :
 * l'utilisateur devait revenir au tableau de bord pour y parvenir, ce que rien
 * n'indiquait. Sur un téléphone partagé, situation courante chez le public
 * visé, c'est un vrai problème.
 *
 * Ces pages ne peuvent pas recevoir le menu complet : l'assistant occupe tout
 * l'écran, et le reçu comme le suivi sont ouverts par des visiteurs qui n'ont
 * pas forcément de compte.
 */
export function BarreCompte({
  retourHref,
  retourLibelle,
  connecte,
}: {
  retourHref?: string;
  retourLibelle?: string;
  /** Sans session, il n'y a rien à quitter : le bouton ne s'affiche pas. */
  connecte: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      {retourHref ? (
        <Link
          href={retourHref}
          className="inline-flex items-center min-h-[44px] gap-1.5 text-xs font-bold text-ink-muted hover:text-brand"
        >
          ← {retourLibelle ?? "Retour"}
        </Link>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-test-mode-surface text-test-mode text-[11px] font-semibold border border-brand-border/60 whitespace-nowrap">
          <Icone nom="eclair" className="w-3.5 h-3.5" /> Mode test
        </span>

        {connecte && (
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-hairline text-xs font-semibold text-ink-muted hover:text-danger hover:border-red-200"
            >
              <Icone nom="deconnexion" className="w-4 h-4" />
              <span>Déconnexion</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
