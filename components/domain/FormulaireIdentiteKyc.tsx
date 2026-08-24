"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enregistrerIdentiteKycAction } from "@/lib/kyc/actions";

/**
 * Nom légal du vendeur (§37).
 *
 * Séparé du reste du profil : c'est le nom qui doit correspondre à la pièce,
 * et non l'enseigne commerciale. Les confondre ferait comparer un document
 * d'identité à un nom de boutique, ce qui ne prouve rien.
 */
export function FormulaireIdentiteKyc({
  valeurActuelle,
}: {
  valeurActuelle: string | null;
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      action={(donnees) =>
        demarrer(async () => {
          setErreur(null);
          setMessage(null);
          const res = await enregistrerIdentiteKycAction(donnees);
          if (res.success) {
            setMessage(res.message);
            router.refresh();
          } else {
            setErreur(res.error);
          }
        })
      }
      className="space-y-2"
    >
      <label htmlFor="legalName" className="block text-xs font-semibold">
        Nom et prénoms tels qu&apos;ils figurent sur votre pièce
      </label>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          id="legalName"
          name="legalName"
          defaultValue={valeurActuelle ?? ""}
          required
          autoComplete="name"
          placeholder="Ex. : Koné Awa"
          /* 16px minimum : en dessous, iOS zoome à la mise au point du champ. */
          className="flex-1 min-w-0 min-h-[48px] px-4 rounded-xl border border-hairline bg-white text-base"
        />
        <button
          type="submit"
          disabled={enCours}
          className="min-h-[48px] px-5 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-bold shadow-md transition-all disabled:opacity-60"
        >
          {enCours ? "…" : "Enregistrer"}
        </button>
      </div>

      {message && (
        <p className="text-xs text-emerald-700 font-medium">{message}</p>
      )}
      {erreur && (
        <p role="alert" className="text-xs text-danger font-medium">
          {erreur}
        </p>
      )}
    </form>
  );
}
