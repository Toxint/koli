"use client";

import { useState } from "react";
import { basculerStatutCompteAction } from "@/lib/admin/users";

/**
 * Suspension / réactivation d'un compte (§35), avec confirmation préalable :
 * le §58 impose de confirmer toute action sensible.
 */
export function BoutonSuspension({
  userId,
  nom,
  statut,
}: {
  userId: string;
  nom: string;
  statut: string;
}) {
  const [etat, setEtat] = useState(statut);
  const [enCours, setEnCours] = useState(false);
  const [confirme, setConfirme] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const estActif = etat === "ACTIVE";

  const basculer = async () => {
    setEnCours(true);
    setErreur(null);
    const res = await basculerStatutCompteAction(userId);
    if (res.success) {
      setEtat(estActif ? "SUSPENDED" : "ACTIVE");
      setConfirme(false);
    } else {
      setErreur(res.error);
      setConfirme(false);
    }
    setEnCours(false);
  };

  if (confirme) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-muted">
          {estActif ? `Suspendre ${nom} ?` : `Réactiver ${nom} ?`}
        </span>
        <button
          type="button"
          onClick={basculer}
          disabled={enCours}
          className={`min-h-[44px] px-3 rounded-lg text-xs font-semibold text-white disabled:opacity-50 ${
            estActif ? "bg-danger" : "bg-brand"
          }`}
        >
          {enCours ? "…" : "Confirmer"}
        </button>
        <button
          type="button"
          onClick={() => setConfirme(false)}
          className="min-h-[44px] px-3 rounded-lg border border-hairline text-xs font-semibold"
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setConfirme(true)}
        className={`min-h-[44px] px-3 rounded-lg border text-xs font-semibold whitespace-nowrap ${
          estActif
            ? "border-hairline text-danger hover:bg-red-50"
            : "border-brand text-brand hover:bg-brand-soft"
        }`}
      >
        {estActif ? "Suspendre" : "Réactiver"}
      </button>
      {erreur && (
        <span role="alert" className="text-xs text-danger">
          {erreur}
        </span>
      )}
    </div>
  );
}
