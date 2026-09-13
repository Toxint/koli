"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reglerVersementAction } from "@/lib/finance/versement-actions";
import { formatMontant } from "@/lib/format";
import { type Devise } from "@/data/markets";

/**
 * Exécuter ou refuser un versement (§43) — l'acte qui fait SORTIR l'argent.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Il ne se rejoue pas et ne s'annule pas. La confirmation (§58) n'est    │
 * │  donc pas une politesse : c'est la seule occasion de se relire.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Quatre décisions, et chacune se déferait sans être écrite :
 *
 * - **La confirmation rappelle le MONTANT et le NUMÉRO.** Ce sont les deux
 *   données que l'administrateur va recopier dans l'application Mobile Money :
 *   les relire ici est la dernière étape avant qu'un chiffre faux devienne un
 *   virement faux.
 *
 * - **La référence de transfert est demandée à l'exécution**, pas après. C'est
 *   elle qui permettra de rapprocher notre registre du relevé du prestataire —
 *   exactement ce qui manquait quand les deux paiements du 6 septembre ont été
 *   perdus. Facultative, parce qu'un versement fait de la main à la main n'en a
 *   pas ; mais demandée, pour qu'on y pense.
 *
 * - **Un refus EXIGE un motif.** Le vendeur voit sa demande rejetée ; sans
 *   motif, il ne sait ni pourquoi, ni quoi corriger. Le serveur le refuse
 *   aussi — ce champ obligatoire n'est qu'une politesse envers l'utilisateur.
 *
 * - **Le bouton se verrouille pendant l'envoi.** Un double clic sur « verser »
 *   ne doit pas pouvoir partir deux fois ; la garde d'idempotence est côté
 *   serveur, celle-ci évite d'avoir à s'en servir.
 */
export function ReglerVersement({
  id,
  montant,
  devise,
  telephone,
  vendeur,
}: {
  id: string;
  montant: number;
  devise: Devise;
  telephone: string;
  vendeur: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"PAID" | "REJECTED" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const envoyer = (formData: FormData) => {
    setErreur(null);
    demarrer(async () => {
      const res = await reglerVersementAction(id, formData);
      if (res.success) {
        setMode(null);
        router.refresh();
        return;
      }
      setErreur(res.error ?? "Échec.");
    });
  };

  if (!mode) {
    return (
      <div className="flex flex-col items-stretch gap-2 sm:flex-row">
        {erreur && (
          <span role="alert" className="text-xs text-danger">
            {erreur}
          </span>
        )}
        <button
          type="button"
          onClick={() => setMode("PAID")}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand px-4 text-xs font-bold text-white transition-colors hover:bg-brand-strong"
        >
          Marquer versé
        </button>
        <button
          type="button"
          onClick={() => setMode("REJECTED")}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-hairline px-4 text-xs font-bold text-ink-muted transition-colors hover:border-red-200 hover:text-danger"
        >
          Refuser
        </button>
      </div>
    );
  }

  return (
    <form action={envoyer} className="min-w-0 space-y-3">
      <input type="hidden" name="decision" value={mode} />

      {mode === "PAID" ? (
        <p className="text-xs text-ink">
          Verser{" "}
          <strong className="font-semibold">
            {formatMontant(montant, devise)}
          </strong>{" "}
          à <strong className="font-semibold">{vendeur}</strong> sur{" "}
          <strong className="font-mono font-semibold">{telephone}</strong>.
        </p>
      ) : (
        <p className="text-xs text-ink">
          Refuser la demande de {formatMontant(montant, devise)} de {vendeur}.
          Le solde lui reste acquis.
        </p>
      )}

      {mode === "PAID" ? (
        <input
          name="reference"
          type="text"
          aria-label="Référence du transfert Mobile Money"
          placeholder="Référence du transfert (facultatif)"
          className="w-full rounded-xl border border-hairline bg-white px-3 py-2 text-xs focus:border-brand-border focus:outline-none focus:ring-2 focus:ring-brand"
        />
      ) : (
        <input
          name="motif"
          type="text"
          aria-label="Motif du refus, que le vendeur lira"
          required
          placeholder="Pourquoi ? (le vendeur le lira)"
          className="w-full rounded-xl border border-hairline bg-white px-3 py-2 text-xs focus:border-brand-border focus:outline-none focus:ring-2 focus:ring-brand"
        />
      )}

      {erreur && (
        <p role="alert" className="text-xs text-danger">
          {erreur}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={enCours}
          className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-xs font-bold text-white disabled:opacity-50 ${
            mode === "PAID" ? "bg-brand" : "bg-danger"
          }`}
        >
          {enCours ? "…" : mode === "PAID" ? "Confirmer le versement" : "Confirmer le refus"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(null);
            setErreur(null);
          }}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-hairline px-4 text-xs font-semibold"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
