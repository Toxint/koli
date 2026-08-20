import Link from "next/link";

/**
 * §65 : « Toutes les erreurs doivent être compréhensibles. »
 * Sans ce fichier, Next affichait sa page 404 par défaut, en anglais.
 */
export default function PageIntrouvable() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center space-y-4">
        <span className="text-5xl block" aria-hidden="true">
          🧭
        </span>
        <h1 className="text-2xl font-black">Cette page n&apos;existe pas</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Le lien que vous avez suivi est peut-être incorrect, ou la page a été
          déplacée.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}
