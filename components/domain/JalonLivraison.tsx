"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { poserJalonLivraisonAction } from "@/lib/deliveries/etapes";
import { Icone } from "@/components/ui/Icone";

/**
 * Le livreur avance d'une étape (§26).
 *
 * **Un seul bouton à la fois** : celui de l'étape suivante. Afficher les trois
 * en permanence obligerait à choisir, alors qu'il n'y a jamais qu'une réponse
 * juste — et un livreur en scooter, une main sur le guidon, ne doit pas avoir
 * à réfléchir à laquelle presser.
 *
 * Le code envoyé ne décide de rien : le serveur pose l'étape que la livraison
 * attend. Un double appui sur un réseau lent ne peut donc ni sauter une étape
 * ni en rejouer une.
 */
export function JalonLivraison({
  deliveryId,
  code,
  libelle,
}: {
  deliveryId: string;
  code: string;
  libelle: string;
}) {
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
            const res = await poserJalonLivraisonAction(deliveryId, code);
            if (!res.success) {
              setErreur(res.error);
              return;
            }
            router.refresh();
          })
        }
        /* 52px : plus haut que le minimum de 44, parce que ce bouton se presse
           dehors, souvent en mouvement et parfois avec des gants. */
        className="inline-flex items-center justify-center gap-2 min-h-[52px] px-5 rounded-2xl bg-brand hover:bg-brand-strong text-white text-sm font-bold shadow-md transition-all disabled:opacity-60"
      >
        <Icone nom="livraisons" className="w-4 h-4" />
        {enCours ? "Enregistrement…" : libelle}
      </button>

      {erreur && (
        <p role="alert" className="text-xs text-danger font-medium mt-1">
          {erreur}
        </p>
      )}
    </div>
  );
}
