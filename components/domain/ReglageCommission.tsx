"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  definirTauxCommissionAction,
  suspendreCommissionAction,
} from "@/lib/finance/actions";
import { formatCFA } from "@/lib/format";
import { Icone } from "@/components/ui/Icone";

/**
 * Réglage du taux de commission (§41).
 *
 * Le champ affiche en direct ce que le nouveau taux donnerait sur un exemple
 * concret. Un pourcentage seul se juge mal : « 7 % » ne dit rien, « 7 % soit
 * 1 400 FCFA sur une vente de 20 000 » se juge immédiatement.
 */
export function ReglageCommission({
  tauxActuel,
  exempleVente,
}: {
  tauxActuel: number | null;
  /** Vente de référence pour l'aperçu — le panier moyen constaté. */
  exempleVente: number;
}) {
  const router = useRouter();
  const [saisie, setSaisie] = useState(
    tauxActuel === null ? "" : String(tauxActuel)
  );
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const valeur = Number(saisie.replace(",", "."));
  const apercuValide = Number.isFinite(valeur) && valeur > 0 && valeur <= 50;
  // Même arrondi que `calculerCommission` : l'aperçu doit annoncer le chiffre
  // qui sera réellement prélevé, pas une approximation.
  const apercu = apercuValide ? Math.floor((exempleVente * valeur) / 100) : 0;

  const enregistrer = async (formData: FormData) => {
    setEnCours(true);
    setErreur(null);
    setMessage(null);

    const res = await definirTauxCommissionAction(formData);
    setEnCours(false);

    if (res.success) {
      setMessage(res.message);
      router.refresh();
      return;
    }
    setErreur(res.error);
  };

  const suspendre = async () => {
    setEnCours(true);
    setErreur(null);
    setMessage(null);

    const res = await suspendreCommissionAction();
    setEnCours(false);

    if (res.success) {
      setMessage(res.message);
      setSaisie("");
      router.refresh();
      return;
    }
    setErreur(res.error);
  };

  return (
    <div className="space-y-4">
      <form action={enregistrer} className="space-y-3">
        <div>
          <label
            htmlFor="taux"
            className="block text-sm font-semibold mb-1.5"
          >
            Taux de commission KOLI
          </label>
          <div className="flex items-center gap-2">
            <input
              id="taux"
              name="taux"
              type="text"
              inputMode="decimal"
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder="5"
              /* 16px minimum : en dessous, iOS zoome sur le champ à la mise au
                 point et casse la mise en page. */
              className="w-32 min-h-[48px] px-3 rounded-xl border border-hairline bg-white text-base focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <span className="text-lg font-semibold text-ink-muted">%</span>
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            Deux décimales au maximum. La virgule est acceptée.
          </p>
        </div>

        {apercuValide && (
          <div
            aria-live="polite"
            className="rounded-2xl bg-brand-soft/50 border border-brand-border px-4 py-3"
          >
            <p className="text-xs text-ink">
              Sur une vente de{" "}
              <span className="font-semibold">{formatCFA(exempleVente)}</span>,
              KOLI retiendrait{" "}
              <span className="font-semibold">{formatCFA(apercu)}</span> et le
              vendeur toucherait{" "}
              <span className="font-semibold">
                {formatCFA(exempleVente - apercu)}
              </span>
              .
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={enCours}
            className="inline-flex items-center justify-center gap-1.5 min-h-[48px] px-5 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-bold disabled:opacity-60"
          >
            <Icone nom="pourcentage" className="w-4 h-4" />
            {enCours ? "Enregistrement…" : "Enregistrer le taux"}
          </button>

          {tauxActuel !== null && (
            <button
              type="button"
              onClick={suspendre}
              disabled={enCours}
              className="inline-flex items-center justify-center min-h-[48px] px-4 rounded-xl border border-hairline hover:bg-brand-soft/40 text-xs font-bold disabled:opacity-60"
            >
              Suspendre le prélèvement
            </button>
          )}
        </div>
      </form>

      {message && (
        <p
          role="status"
          className="rounded-xl bg-brand-soft border border-brand-border px-4 py-3 text-xs font-semibold text-brand"
        >
          {message}
        </p>
      )}
      {erreur && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs font-semibold text-danger"
        >
          {erreur}
        </p>
      )}
    </div>
  );
}
