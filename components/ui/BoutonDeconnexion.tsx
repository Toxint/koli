"use client";

import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/lib/auth/actions";
import { Icone } from "@/components/ui/Icone";

/**
 * Déconnexion, avec confirmation préalable (§58).
 *
 * Elle partait auparavant au premier clic. Sur un téléphone — l'appareil de la
 * quasi-totalité des utilisateurs — le bouton voisine avec la navigation et se
 * touche par mégarde ; un vendeur au milieu d'une commande perdait sa saisie
 * sans avoir rien demandé.
 *
 * Le rappel de l'identité dans la question n'est pas décoratif : sur un
 * téléphone partagé, situation courante chez le public visé, il évite de
 * déconnecter le compte de quelqu'un d'autre.
 */
export function BoutonDeconnexion({
  nomCompte,
  variante = "menu",
  compact = false,
}: {
  nomCompte?: string;
  /** `menu` : pleine largeur dans la barre latérale. `compact` : en ligne. */
  variante?: "menu" | "compact";
  /** Barre latérale repliée : icône seule, libellé réservé aux lecteurs d écran. */
  compact?: boolean;
}) {
  const [confirme, setConfirme] = useState(false);
  const boutonConfirmer = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!confirme) return;

    // Le bouton de confirmation prend le focus : sans cela, l'utilisateur au
    // clavier reste sur le déclencheur, derrière la boîte de dialogue.
    boutonConfirmer.current?.focus();

    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirme(false);
    };
    document.addEventListener("keydown", surTouche);

    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = avant;
    };
  }, [confirme]);

  const classesDeclencheur =
    variante === "menu"
      ? `w-full flex items-center gap-3 rounded-2xl min-h-[46px] text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors ${
          compact ? "justify-center px-2" : "px-3"
        }`
      : "inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-hairline text-xs font-semibold text-ink-muted hover:text-danger hover:border-red-200";

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirme(true)}
        title={compact ? "Déconnexion" : undefined}
        className={classesDeclencheur}
      >
        <Icone
          nom="deconnexion"
          className={variante === "menu" ? "w-5 h-5 shrink-0" : "w-4 h-4"}
        />
        <span className={compact ? "sr-only" : undefined}>Déconnexion</span>
      </button>

      {confirme && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
          {/* Toucher à côté annule : c'est le geste attendu, et il ne coûte
              rien puisque l'action n'est pas encore partie.
              Un `div` et non un `button` : en bouton, le voile portait lui
              aussi le nom « Annuler » et un lecteur d'écran l'annonçait deux
              fois, en plus d'ajouter une tabulation vers un élément invisible.
              Le clavier dispose d'Échap et du bouton « Annuler » visible. */}
          <div
            aria-hidden="true"
            onClick={() => setConfirme(false)}
            className="absolute inset-0 bg-menu-deep/60"
          />

          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="titre-deconnexion"
            aria-describedby="texte-deconnexion"
            className="relative w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl animate-fade-in"
          >
            <div className="flex items-center gap-2 mb-2">
              <Icone nom="deconnexion" className="w-5 h-5 text-brand" />
              <h2 id="titre-deconnexion" className="text-base font-semibold">
                Se déconnecter ?
              </h2>
            </div>

            <p id="texte-deconnexion" className="text-sm text-ink-muted">
              {nomCompte ? (
                <>
                  Vous quitterez le compte{" "}
                  <strong className="text-ink">{nomCompte}</strong>. Il faudra
                  vous reconnecter pour y revenir.
                </>
              ) : (
                <>
                  Il faudra vous reconnecter pour revenir à votre espace.
                </>
              )}
            </p>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setConfirme(false)}
                className="min-h-[48px] px-5 rounded-2xl border border-hairline font-semibold text-sm hover:bg-brand-soft/40"
              >
                Annuler
              </button>

              <form action={logoutAction}>
                <button
                  ref={boutonConfirmer}
                  type="submit"
                  className="w-full sm:w-auto min-h-[48px] px-5 rounded-2xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm"
                >
                  Oui, me déconnecter
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
