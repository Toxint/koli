"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ouvrirLitigeAction } from "@/lib/disputes/actions";
import { MOTIFS } from "@/lib/disputes/libelles";
import { Icone } from "@/components/ui/Icone";

const CHAMP =
  "w-full px-4 py-3 rounded-xl border border-hairline bg-white text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand";

/**
 * Signalement d'un problème par le client (§31).
 *
 * Motifs en boutons radio plutôt qu'en liste déroulante : le choix conditionne
 * l'instruction du litige, il doit être lisible d'un coup d'œil sur un
 * téléphone — et une liste déroulante cache cinq options sur six.
 */
export function FormulaireLitige({ reference }: { reference: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState<string>(MOTIFS[0].valeur);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const envoyer = async (formData: FormData) => {
    setEnCours(true);
    setErreur(null);

    const res = await ouvrirLitigeAction(reference, formData);
    if (res.success) {
      router.push(`/litige/${reference}`);
      router.refresh();
      return;
    }

    setErreur(res.error);
    setEnCours(false);
  };

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="w-full inline-flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-2xl border border-hairline text-sm font-semibold text-ink-muted hover:text-danger hover:border-red-200"
      >
        <Icone nom="alerte" className="w-4 h-4" />
        Signaler un problème
      </button>
    );
  }

  return (
    <form action={envoyer} className="space-y-4 text-left">
      <div>
        <h3 className="text-base font-semibold">Signaler un problème</h3>
        <p className="text-xs text-ink-muted mt-0.5">
          Les fonds resteront bloqués jusqu&apos;à la décision de KOLI. Le
          vendeur ne sera pas payé entre-temps.
        </p>
      </div>

      {erreur && (
        <p
          role="alert"
          className="p-3 rounded-xl bg-red-50 text-danger text-sm font-medium"
        >
          {erreur}
        </p>
      )}

      <fieldset>
        <legend className="block text-xs font-semibold mb-2">
          Que s&apos;est-il passé ?
        </legend>
        <div className="space-y-2">
          {MOTIFS.map((m) => (
            <label
              key={m.valeur}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 min-h-[56px] cursor-pointer ${
                motif === m.valeur
                  ? "border-brand bg-brand-soft/60"
                  : "border-hairline hover:bg-brand-soft/30"
              }`}
            >
              <input
                type="radio"
                name="motif"
                value={m.valeur}
                checked={motif === m.valeur}
                onChange={(e) => setMotif(e.target.value)}
                className="sr-only"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{m.libelle}</span>
                <span className="block text-xs text-ink-muted">{m.aide}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="description"
          className="block text-xs font-semibold mb-1.5"
        >
          Expliquez en quelques mots
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          required
          minLength={10}
          maxLength={2000}
          placeholder="Ce que vous avez reçu, ce que vous attendiez, la date…"
          aria-describedby="aide-description-litige"
          className={`${CHAMP} min-h-[110px] resize-y`}
        />
        <p id="aide-description-litige" className="mt-1 text-xs text-ink-muted">
          Le vendeur lira ce message et pourra vous répondre.
        </p>
      </div>

      {/* §31 prévoit photos et vidéos. Tant que le stockage n'est pas
          configuré, on le dit plutôt que de laisser un champ inerte. */}
      <p className="text-xs text-ink-muted">
        L&apos;envoi de photos arrivera avec l&apos;espace de stockage.
      </p>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="min-h-[48px] px-5 rounded-2xl border border-hairline font-semibold text-sm hover:bg-brand-soft/40"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={enCours}
          className="min-h-[48px] px-5 rounded-2xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm disabled:opacity-50"
        >
          {enCours ? "Envoi…" : "Envoyer le signalement"}
        </button>
      </div>
    </form>
  );
}
