"use client";

import { useState } from "react";
import { assignDriverAction, type DriverOption } from "@/lib/deliveries/assign";

interface AssignerLivreurProps {
  orderReference: string;
  drivers: DriverOption[];
  /** Nom du livreur déjà assigné, s'il y en a un. */
  livreurActuel?: string | null;
}

/**
 * Assignation d'un livreur par le vendeur (§26, §57 « Assigner un livreur »).
 *
 * Sans cette étape, une commande créée n'apparaissait dans le tableau de bord
 * d'aucun livreur : le parcours s'arrêtait au paiement.
 */
export function AssignerLivreur({
  orderReference,
  drivers,
  livreurActuel = null,
}: AssignerLivreurProps) {
  const [choix, setChoix] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [assigneA, setAssigneA] = useState<string | null>(livreurActuel);
  const [erreur, setErreur] = useState<string | null>(null);

  const idSelect = `livreur-${orderReference}`;

  if (assigneA) {
    return (
      <div className="flex items-center gap-2 text-xs font-semibold text-brand">
        <span aria-hidden="true">🛵</span>
        <span>Livreur : {assigneA}</span>
      </div>
    );
  }

  if (drivers.length === 0) {
    return (
      <p className="text-xs text-ink-muted">
        Aucun livreur disponible pour le moment.
      </p>
    );
  }

  const assigner = async () => {
    if (!choix) {
      setErreur("Choisissez un livreur.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const res = await assignDriverAction(orderReference, choix);
      if (res.success) {
        setAssigneA(res.driverName);
      } else {
        setErreur(res.error);
      }
    } catch {
      setErreur("Erreur réseau. Veuillez réessayer.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="w-full space-y-2">
      <label
        htmlFor={idSelect}
        className="block text-xs font-semibold text-ink-muted"
      >
        Assigner un livreur
      </label>

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          id={idSelect}
          value={choix}
          onChange={(e) => setChoix(e.target.value)}
          className="flex-1 min-h-[44px] px-3 rounded-xl border border-hairline bg-white text-sm"
        >
          <option value="">Choisir…</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
              {d.vehicle ? ` — ${d.vehicle}` : ""}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={assigner}
          disabled={enCours}
          className="min-h-[44px] px-4 rounded-xl bg-brand hover:bg-brand-strong text-white font-semibold text-xs transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {enCours ? "Assignation…" : "Assigner"}
        </button>
      </div>

      {erreur && (
        <p role="alert" className="text-xs text-danger font-medium">
          {erreur}
        </p>
      )}
    </div>
  );
}
