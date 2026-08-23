"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trancherLitigeAction } from "@/lib/disputes/actions";
import { formatCFA } from "@/lib/format";
import { Icone } from "@/components/ui/Icone";

/**
 * Décision de l'administration (§32).
 *
 * Deux issues, et l'écran dit **ce que chacune fait à l'argent** avant qu'on
 * clique : c'est le seul endroit de KOLI où une personne décide seule du sort
 * d'un montant séquestré. La confirmation préalable (§58) s'impose d'autant
 * plus qu'une décision ne se rejoue pas.
 */
export function ArbitrageLitige({
  reference,
  montantVendeur,
  montantClient,
}: {
  reference: string;
  /** Ce que toucherait le vendeur : les articles, hors livraison. */
  montantVendeur: number;
  /** Ce que serait remboursé au client : articles + livraison. */
  montantClient: number;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const envoyer = async (formData: FormData) => {
    setEnCours(true);
    setErreur(null);

    const res = await trancherLitigeAction(reference, formData);
    if (res.success) {
      setDecision(null);
      router.refresh();
      return;
    }

    setErreur(res.error);
    setEnCours(false);
  };

  const CHOIX = [
    {
      valeur: "SELLER_WINS",
      titre: "En faveur du vendeur",
      effet: `Les fonds sont versés au vendeur : ${formatCFA(montantVendeur)}.`,
    },
    {
      valeur: "CUSTOMER_WINS",
      titre: "En faveur du client",
      effet: `Un remboursement de ${formatCFA(montantClient)} est enclenché.`,
    },
  ];

  return (
    <section className="carte-koli bg-white rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Icone nom="bouclier" className="w-5 h-5 text-brand" />
        <h2 className="text-base font-semibold">Trancher le litige</h2>
      </div>

      {erreur && (
        <p
          role="alert"
          className="p-3 rounded-xl bg-red-50 text-danger text-sm font-medium"
        >
          {erreur}
        </p>
      )}

      <form action={envoyer} className="space-y-4">
        <fieldset>
          <legend className="block text-xs font-semibold mb-2">Décision</legend>
          <div className="space-y-2">
            {CHOIX.map((c) => (
              <label
                key={c.valeur}
                className={`flex items-start gap-3 rounded-2xl border px-4 py-3 min-h-[56px] cursor-pointer ${
                  decision === c.valeur
                    ? "border-brand bg-brand-soft/60"
                    : "border-hairline hover:bg-brand-soft/30"
                }`}
              >
                <input
                  type="radio"
                  name="decision"
                  value={c.valeur}
                  checked={decision === c.valeur}
                  onChange={(e) => setDecision(e.target.value)}
                  className="sr-only"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{c.titre}</span>
                  {/* L'effet sur l'argent est annoncé AVANT le clic. */}
                  <span className="block text-xs text-ink-muted">
                    {c.effet}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="motivation"
            className="block text-xs font-semibold mb-1.5"
          >
            Motivation
          </label>
          <textarea
            id="motivation"
            name="motivation"
            rows={3}
            required
            minLength={10}
            maxLength={2000}
            aria-describedby="aide-motivation"
            className="w-full px-4 py-3 rounded-xl border border-hairline bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand min-h-[88px] resize-y"
          />
          <p id="aide-motivation" className="mt-1 text-xs text-ink-muted">
            Le client et le vendeur la liront tous les deux dans le fil.
          </p>
        </div>

        <button
          type="submit"
          disabled={enCours || decision === null}
          className="w-full min-h-[48px] px-5 rounded-2xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm disabled:opacity-50"
        >
          {enCours ? "Enregistrement…" : "Rendre la décision"}
        </button>
        <p className="text-xs text-ink-muted text-center">
          Une décision est définitive et déplace l&apos;argent.
        </p>
      </form>
    </section>
  );
}
