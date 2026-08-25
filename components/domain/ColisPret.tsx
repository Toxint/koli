"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { declarerColisPretAction } from "@/lib/deliveries/etapes";
import { Icone } from "@/components/ui/Icone";

/**
 * Le vendeur déclare le colis prêt (§26).
 *
 * Séparé de l'assignation du livreur, et c'est délibéré : un vendeur désigne
 * souvent son livreur bien avant d'avoir fini d'emballer. Fusionner les deux
 * gestes ferait partir le livreur pour rien.
 *
 * Une fois déclaré, le bouton disparaît plutôt que de rester grisé : ce qui
 * est fait n'a pas à encombrer l'écran d'une commande en cours.
 */
export function ColisPret({ reference }: { reference: string }) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div>
      <button
        type="button"
        disabled={enCours}
        onClick={() =>
          demarrer(async () => {
            setErreur(null);
            const res = await declarerColisPretAction(reference);
            if (!res.success) {
              setErreur(res.error);
              return;
            }
            router.refresh();
          })
        }
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-brand-soft text-brand hover:bg-brand-soft/70 text-xs font-bold transition-all disabled:opacity-60"
      >
        <Icone nom="colis" className="w-4 h-4" />
        {enCours ? "…" : "Le colis est prêt"}
      </button>

      {erreur && (
        <p role="alert" className="text-xs text-danger font-medium mt-1">
          {erreur}
        </p>
      )}
    </div>
  );
}
