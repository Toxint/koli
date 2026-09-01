"use client";

import { useState } from "react";
import Link from "next/link";
import { demanderReinitialisationAction } from "@/lib/auth/reinitialisation";
import { Icone } from "@/components/ui/Icone";

const CHAMP =
  "w-full min-h-[48px] px-4 rounded-xl border border-hairline bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand";

/** Demande de réinitialisation (§62). */
export function FormulaireMotDePasseOublie() {
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lienDeTest, setLienDeTest] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const envoyer = async (formData: FormData) => {
    setEnCours(true);
    setErreur(null);
    setMessage(null);
    setLienDeTest(null);

    const res = await demanderReinitialisationAction(formData);
    if (res.success) {
      setMessage(res.message);
      setLienDeTest(res.lienDeTest ?? null);
    } else {
      setErreur(res.message);
    }
    setEnCours(false);
  };

  return (
    <form action={envoyer} className="space-y-5">
      {message && (
        <p
          role="status"
          className="p-3 rounded-xl bg-brand-soft text-brand text-sm font-medium"
        >
          {message}
        </p>
      )}
      {erreur && (
        <p
          role="alert"
          className="p-3 rounded-xl bg-red-50 text-danger text-sm font-medium"
        >
          {erreur}
        </p>
      )}

      {/* MODE TEST : le lien qu'un SMS transmettra. Affiché à l'écran tant que
          le canal d'envoi n'existe pas (phases 25 et 31), et clairement
          signalé comme tel — il n'a rien à faire ici en production. */}
      {/* Le bloc entier n'a de sens qu'en mode test — il disparaît avec lui.
          Voir la règle dans `app/globals.css`. */}
      {lienDeTest && (
        <div
          data-mention-test=""
          className="p-3 rounded-xl bg-test-mode-surface border border-brand-border/60 space-y-2"
        >
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-test-mode">
            <Icone nom="eclair" className="w-3.5 h-3.5" /> Mode test
          </p>
          <p className="text-xs text-ink-muted">
            L&apos;envoi par SMS n&apos;est pas encore branché : voici le lien
            que le message contiendra.
          </p>
          <Link
            href={lienDeTest.replace(/^https?:\/\/[^/]+/, "")}
            className="block text-xs font-mono text-brand break-all underline"
          >
            {lienDeTest}
          </Link>
        </div>
      )}

      <div>
        <label
          htmlFor="identifiant"
          className="block text-xs font-semibold mb-1.5"
        >
          Téléphone ou email du compte
        </label>
        <input
          id="identifiant"
          name="identifiant"
          type="text"
          required
          autoComplete="username"
          placeholder="+225 07 01 02 03 04"
          aria-describedby="aide-identifiant-oubli"
          className={CHAMP}
        />
        <p id="aide-identifiant-oubli" className="mt-1 text-xs text-ink-muted">
          Le même identifiant que pour vous connecter.
        </p>
      </div>

      <button
        type="submit"
        disabled={enCours}
        className="w-full min-h-[48px] px-6 rounded-2xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm disabled:opacity-50"
      >
        {enCours ? "Envoi…" : "Recevoir le lien de réinitialisation"}
      </button>

      <p className="text-center text-sm text-ink-muted">
        <Link
          href="/connexion"
          className="inline-flex items-center min-h-[44px] font-semibold text-brand hover:text-brand-strong underline underline-offset-4"
        >
          Revenir à la connexion
        </Link>
      </p>
    </form>
  );
}
