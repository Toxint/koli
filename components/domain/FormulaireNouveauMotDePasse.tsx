"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { reinitialiserMotDePasseAction } from "@/lib/auth/reinitialisation";

const CHAMP =
  "w-full min-h-[48px] px-4 rounded-xl border border-hairline bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand";

/** Choix du nouveau mot de passe, une fois le lien suivi (§62). */
export function FormulaireNouveauMotDePasse({ jeton }: { jeton: string }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const envoyer = async (formData: FormData) => {
    setEnCours(true);
    setErreur(null);

    const res = await reinitialiserMotDePasseAction(formData);
    if (res.success) {
      setMessage(res.message ?? "Mot de passe modifié.");
      // Court délai pour que le message soit lu avant la bascule.
      setTimeout(() => router.push("/connexion"), 1800);
      return;
    }

    setErreur(res.error ?? "Une erreur est survenue.");
    setEnCours(false);
  };

  if (message) {
    return (
      <div className="space-y-4 text-center">
        <p
          role="status"
          className="p-3 rounded-xl bg-brand-soft text-brand text-sm font-medium"
        >
          {message}
        </p>
        <Link
          href="/connexion"
          className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-2xl bg-brand text-white font-semibold text-sm"
        >
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <form action={envoyer} className="space-y-5">
      {erreur && (
        <p
          role="alert"
          className="p-3 rounded-xl bg-red-50 text-danger text-sm font-medium"
        >
          {erreur}
        </p>
      )}

      <input type="hidden" name="jeton" value={jeton} />

      <div>
        <label
          htmlFor="motDePasse"
          className="block text-xs font-semibold mb-1.5"
        >
          Nouveau mot de passe
        </label>
        <input
          id="motDePasse"
          name="motDePasse"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          aria-describedby="aide-nouveau-mdp"
          className={CHAMP}
        />
        <p id="aide-nouveau-mdp" className="mt-1 text-xs text-ink-muted">
          8 caractères minimum.
        </p>
      </div>

      <button
        type="submit"
        disabled={enCours}
        className="w-full min-h-[48px] px-6 rounded-2xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm disabled:opacity-50"
      >
        {enCours ? "Enregistrement…" : "Définir mon nouveau mot de passe"}
      </button>
    </form>
  );
}
