"use client";

import { useState } from "react";
import { basculerStatutProduitAction } from "@/lib/products/actions";

/**
 * Retire ou remet un produit au catalogue, avec confirmation (§58).
 * On archive plutot que supprimer : le produit est reference par des commandes
 * passees, et l'effacer reecrirait l'historique.
 */
export function BoutonStatutProduit({
  produitId,
  nom,
  statut,
}: {
  produitId: string;
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
    const res = await basculerStatutProduitAction(produitId);
    if (res.success) {
      setEtat(estActif ? "ARCHIVED" : "ACTIVE");
    } else {
      setErreur(res.error);
    }
    setConfirme(false);
    setEnCours(false);
  };

  if (confirme) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-muted">
          {estActif ? `Retirer ${nom} ?` : `Remettre ${nom} ?`}
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
        {/* Libelle court : l'etape de confirmation rappelle de toute facon le
            nom du produit, et « Retirer du catalogue » faisait passer les
            actions a la ligne sur un ecran de telephone. */}
        {estActif ? "Retirer" : "Remettre"}
      </button>
      {erreur && (
        <span role="alert" className="text-xs text-danger">
          {erreur}
        </span>
      )}
    </div>
  );
}
