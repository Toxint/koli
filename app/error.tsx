"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * §65 : ne jamais afficher un « Error 500 » brut.
 * Sans ce fichier, toute exception serveur tombait sur la page d'erreur par
 * défaut de Next — en anglais, et sans aucun moyen de reprendre.
 */
export default function ErreurApplication({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Journalisé côté serveur ; l'utilisateur ne voit jamais la trace technique.
    console.error("Erreur applicative KOLI :", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center space-y-4">
        <span className="text-5xl block" aria-hidden="true">
          ⚠️
        </span>
        <h1 className="text-2xl font-bold">Une erreur est survenue</h1>
        <p className="text-sm text-ink-muted dark:text-slate-400">
          Nous n&apos;avons pas pu afficher cette page. Aucune opération n&apos;a
          été enregistrée. Vous pouvez réessayer.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-2xl bg-brand hover:bg-brand-strong text-white font-bold text-sm transition-colors"
          >
            Réessayer
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-2xl border border-hairline dark:border-slate-700 font-bold text-sm"
          >
            Retour à l&apos;accueil
          </Link>
        </div>

        {error.digest && (
          <p className="text-xs text-ink-muted pt-2">
            Référence technique : <code>{error.digest}</code>
          </p>
        )}
      </div>
    </main>
  );
}
