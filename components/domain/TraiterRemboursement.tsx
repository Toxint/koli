"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { traiterRemboursementAction } from "@/lib/refunds/actions";
import { formatCFA } from "@/lib/format";
import { Icone } from "@/components/ui/Icone";

/**
 * Traitement d'un remboursement (phase 22), avec confirmation (§58 — qui cite
 * explicitement « Rembourser » parmi les actions sensibles).
 *
 * La confirmation rappelle le montant et son destinataire : c'est de l'argent
 * qui sort, et l'action ne se rejoue pas.
 */
export function TraiterRemboursement({
  reference,
  montant,
  clientNom,
  articles,
}: {
  reference: string;
  montant: number;
  clientNom: string;
  /** Décrit ce qui reviendrait en rayon, pour éclairer le choix. */
  articles: string;
}) {
  const router = useRouter();
  const [confirme, setConfirme] = useState(false);
  const [restituer, setRestituer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const envoyer = async (formData: FormData) => {
    setEnCours(true);
    setErreur(null);

    const res = await traiterRemboursementAction(reference, formData);
    if (res.success) {
      setConfirme(false);
      router.refresh();
      return;
    }

    setErreur(res.error);
    setEnCours(false);
  };

  if (!confirme) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setConfirme(true)}
          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-bold"
        >
          <Icone nom="argent" className="w-4 h-4" />
          Rembourser
        </button>
        {erreur && (
          <span role="alert" className="text-xs text-danger">
            {erreur}
          </span>
        )}
      </div>
    );
  }

  return (
    <form action={envoyer} className="w-full sm:max-w-sm space-y-3">
      <p className="text-xs text-ink-muted">
        Rembourser <strong className="text-ink">{formatCFA(montant)}</strong> à{" "}
        <strong className="text-ink">{clientNom}</strong> ? Cette action ne se
        rejoue pas.
      </p>

      {/* Le stock n'est PAS remis d'office : un colis jamais recu peut etre
          encore chez le vendeur, un article abime ne revient pas vendable.
          Remettre a tort cree du stock fantome, donc de la survente. */}
      <label className="flex items-start gap-2 text-xs cursor-pointer">
        <input
          type="checkbox"
          name="restituerStock"
          checked={restituer}
          onChange={(e) => setRestituer(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Remettre {articles} au catalogue
          <span className="block text-ink-muted">
            À ne cocher que si la marchandise est récupérée et revendable.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={enCours}
          className="min-h-[44px] px-4 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-bold disabled:opacity-50"
        >
          {enCours ? "Traitement…" : "Confirmer le remboursement"}
        </button>
        <button
          type="button"
          onClick={() => setConfirme(false)}
          className="min-h-[44px] px-4 rounded-xl border border-hairline text-xs font-semibold"
        >
          Annuler
        </button>
      </div>

      {erreur && (
        <p role="alert" className="text-xs text-danger font-medium">
          {erreur}
        </p>
      )}
    </form>
  );
}
