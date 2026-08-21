"use client";

import { useState } from "react";
import { definirVerificationVendeurAction } from "@/lib/admin/vendeurs";
import { badgeVerification } from "@/lib/admin/verificationLabels";

/**
 * Décision de vérification d'un vendeur (§36), avec confirmation préalable :
 * le §58 impose de confirmer toute action sensible, et rejeter un vendeur
 * revient à lui refuser l'accès au marché.
 */
export function VerificationVendeur({
  sellerId,
  nom,
  statut,
}: {
  sellerId: string;
  nom: string;
  statut: string;
}) {
  const [etat, setEtat] = useState(statut);
  const [enCours, setEnCours] = useState(false);
  const [cible, setCible] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const appliquer = async (nouveau: string) => {
    setEnCours(true);
    setErreur(null);
    const res = await definirVerificationVendeurAction(sellerId, nouveau);
    if (res.success) setEtat(res.statut);
    else setErreur(res.error);
    setCible(null);
    setEnCours(false);
  };

  if (cible) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-muted">
          {cible === "VERIFIED" && `Vérifier ${nom} ?`}
          {cible === "REJECTED" && `Rejeter ${nom} ?`}
          {cible === "PENDING" && `Remettre ${nom} en attente ?`}
        </span>
        <button
          type="button"
          onClick={() => appliquer(cible)}
          disabled={enCours}
          className={`min-h-[44px] px-3 rounded-lg text-xs font-semibold text-white disabled:opacity-50 ${
            cible === "REJECTED" ? "bg-danger" : "bg-brand"
          }`}
        >
          {enCours ? "…" : "Confirmer"}
        </button>
        <button
          type="button"
          onClick={() => setCible(null)}
          className="min-h-[44px] px-3 rounded-lg border border-hairline text-xs font-semibold"
        >
          Annuler
        </button>
      </div>
    );
  }

  const badge = badgeVerification(etat);

  return (
    <div className="flex flex-col gap-1.5">
      <span
        className={`self-start px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${badge.classes}`}
      >
        {badge.libelle}
      </span>

      <div className="flex flex-wrap gap-2">
        {etat !== "VERIFIED" && (
          <button
            type="button"
            onClick={() => setCible("VERIFIED")}
            className="min-h-[44px] px-3 rounded-lg border border-brand text-brand hover:bg-brand-soft text-xs font-semibold whitespace-nowrap"
          >
            Vérifier
          </button>
        )}
        {etat !== "REJECTED" && (
          <button
            type="button"
            onClick={() => setCible("REJECTED")}
            className="min-h-[44px] px-3 rounded-lg border border-hairline text-danger hover:bg-red-50 text-xs font-semibold whitespace-nowrap"
          >
            Rejeter
          </button>
        )}
        {etat !== "PENDING" && (
          <button
            type="button"
            onClick={() => setCible("PENDING")}
            className="min-h-[44px] px-3 rounded-lg border border-hairline text-ink-muted hover:bg-brand-soft text-xs font-semibold whitespace-nowrap"
          >
            En attente
          </button>
        )}
      </div>

      {erreur && (
        <span role="alert" className="text-xs text-danger">
          {erreur}
        </span>
      )}
    </div>
  );
}
