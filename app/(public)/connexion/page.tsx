"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthHeader } from "@/components/ui/AuthHeader";
import { loginAction } from "@/lib/auth/actions";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("identifier", identifier);
    formData.append("password", password);

    try {
      const res = await loginAction(null, formData);
      if (res.success && res.redirectTo) {
        router.push(res.redirectTo);
        router.refresh();
      } else {
        setError(res.error || "Une erreur est survenue lors de la connexion.");
      }
    } catch {
      setError("Erreur réseau ou serveur. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (demoIdentifier: string) => {
    setIdentifier(demoIdentifier);
    setPassword("Password123!");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <AuthHeader
          title="Connexion à votre espace KOLI"
          subtitle="Accédez à votre compte Vendeur, Client, Livreur ou Administrateur"
        />

        <div className="bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 sm:p-8">
          {error && (
            <div role="alert" className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-start gap-3">
              <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="identifier" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Téléphone ou Email
              </label>
              <input
                id="identifier"
                name="identifier"
                type="text"
                autoComplete="username"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                // Placeholder court : l'ancien (38 caracteres) etait tronque
                // dans le champ sur un ecran de 320px, et un placeholder ne
                // passe pas a la ligne.
                placeholder="Téléphone ou email"
                aria-describedby="aide-identifiant"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-sm"
              />
              <p
                id="aide-identifiant"
                className="mt-1 text-xs text-slate-600 dark:text-slate-400"
              >
                Ex. : +225 07 01 02 03 04 ou vendeur@koli.ci
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Mot de passe
                </label>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  // `pr-24` : le bouton « Afficher » recouvrait le texte saisi,
                  // l'ancien `pr-12` ne reservait que 48px pour un bouton de 68px.
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-sm pr-24"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword
                      ? "Masquer le mot de passe"
                      : "Afficher le mot de passe"
                  }
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] px-3 flex items-center text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-medium"
                >
                  {showPassword ? "Masquer" : "Afficher"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold text-sm shadow-md shadow-emerald-600/20 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Connexion en cours...</span>
                </>
              ) : (
                "Se connecter"
              )}
            </button>
          </form>

          {/* Quick Demo Login Shortcut Section */}
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 text-center">
              ⚡ Raccourcis comptes de test MVP (Mode Démo)
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => fillDemoAccount("vendeur@koli.ci")}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 font-medium text-left transition-colors"
              >
                🛍️ <span className="font-semibold text-slate-900 dark:text-white">Vendeur</span>
                <span className="block text-[10px] text-slate-500">vendeur@koli.ci</span>
              </button>
              <button
                type="button"
                onClick={() => fillDemoAccount("client@koli.ci")}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 font-medium text-left transition-colors"
              >
                👤 <span className="font-semibold text-slate-900 dark:text-white">Client</span>
                <span className="block text-[10px] text-slate-500">client@koli.ci</span>
              </button>
              <button
                type="button"
                onClick={() => fillDemoAccount("livreur@koli.ci")}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 font-medium text-left transition-colors"
              >
                🛵 <span className="font-semibold text-slate-900 dark:text-white">Livreur</span>
                <span className="block text-[10px] text-slate-500">livreur@koli.ci</span>
              </button>
              <button
                type="button"
                onClick={() => fillDemoAccount("admin@koli.ci")}
                className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 font-medium text-left transition-colors"
              >
                🛡️ <span className="font-semibold text-slate-900 dark:text-white">Admin</span>
                <span className="block text-[10px] text-slate-500">admin@koli.ci</span>
              </button>
            </div>
            <p className="text-[11px] text-center text-slate-500 mt-2">
              Mot de passe universel : <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-emerald-600 font-mono">Password123!</code>
            </p>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Vous n&apos;avez pas encore de compte ?{" "}
              <Link
                href="/inscription"
                className="inline-flex items-center min-h-[44px] font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 underline underline-offset-4"
              >
                S&apos;inscrire gratuitement
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
