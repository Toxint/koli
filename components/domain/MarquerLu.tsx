"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  marquerNotificationLueAction,
  toutMarquerLuAction,
} from "@/lib/notifications/actions";
import { Icone } from "@/components/ui/Icone";

/**
 * Marquer une notification comme lue.
 *
 * `useTransition` plutôt qu'un état local : le serveur reste la source de
 * vérité. Basculer l'apparence côté client sans attendre la réponse ferait
 * disparaître le « Nouveau » même quand l'écriture échoue — l'utilisateur
 * croirait avoir traité ce qui ne l'a pas été.
 *
 * Le bouton reste actif pendant l'attente mais affiche son état : sur un
 * réseau lent, un bouton qui ne réagit pas donne envie de cliquer encore.
 */
export function MarquerLu({ id }: { id: string }) {
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={enCours}
      onClick={() =>
        demarrer(async () => {
          await marquerNotificationLueAction(id);
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1.5 min-h-[44px] text-xs font-semibold text-ink-muted hover:text-brand disabled:opacity-60 transition-colors"
    >
      <Icone nom="valide" className="w-3.5 h-3.5" />
      {enCours ? "…" : "Marquer comme lu"}
    </button>
  );
}

export function ToutMarquerLu() {
  const [enCours, demarrer] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={enCours}
      onClick={() =>
        demarrer(async () => {
          await toutMarquerLuAction();
          router.refresh();
        })
      }
      className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-brand-border bg-white hover:bg-brand-soft/50 text-brand text-xs font-bold transition-all disabled:opacity-60"
    >
      <Icone nom="valide" className="w-4 h-4" />
      {enCours ? "En cours…" : "Tout marquer comme lu"}
    </button>
  );
}
