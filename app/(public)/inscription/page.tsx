"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthHeader } from "@/components/ui/AuthHeader";
import { registerAction } from "@/lib/auth/actions";

type RoleType = "SELLER" | "DRIVER" | "CLIENT";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<RoleType>("SELLER");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [city, setCity] = useState("Abidjan");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("phone", phone);
    formData.append("email", email);
    formData.append("password", password);
    formData.append("role", role);

    if (role === "SELLER") formData.append("businessName", businessName);
    if (role === "DRIVER") formData.append("vehicle", vehicle);
    if (role === "CLIENT") formData.append("city", city);

    try {
      const res = await registerAction(null, formData);
      if (res.success && res.redirectTo) {
        router.push(res.redirectTo);
        router.refresh();
      } else {
        setError(res.error || "Une erreur est survenue lors de l'inscription.");
      }
    } catch {
      setError("Erreur réseau ou serveur. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-xl">
        <AuthHeader
          title="Créer votre compte KOLI"
          subtitle="Rejoignez la plateforme qui sécurise les achats et ventes en ligne en Afrique"
        />

        <div className="bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/50 dark:shadow-none border border-hairline/80 dark:border-slate-800 rounded-2xl p-6 sm:p-8">
          {error && (
            <div role="alert" className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-start gap-3">
              <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Choix du role — `radiogroup` et `aria-checked` : l'etat
                selectionne n'etait signale que par la couleur, donc invisible
                pour un lecteur d'ecran comme pour un daltonien (§69). */}
            <div>
              <span
                id="libelle-role"
                className="block text-xs font-semibold text-brand dark:text-slate-300 uppercase tracking-wider mb-3"
              >
                Vous souhaitez vous inscrire en tant que :
              </span>
              <div
                role="radiogroup"
                aria-labelledby="libelle-role"
                className="grid grid-cols-1 sm:grid-cols-3 gap-3"
              >
                <button
                  type="button"
                  onClick={() => setRole("SELLER")}
                  role="radio"
                  aria-checked={role === "SELLER"}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    role === "SELLER"
                      ? "border-brand-border bg-brand-soft/50 dark:bg-emerald-950/30 text-brand dark:text-emerald-200 shadow-sm"
                      : "border-hairline dark:border-slate-800 hover:border-hairline bg-white dark:bg-slate-800 text-brand dark:text-slate-300"
                  }`}
                >
                  <span className="text-2xl block mb-1">🛍️</span>
                  <span className="font-bold text-sm block">Vendeur</span>
                  <span className="text-[11px] text-ink-muted dark:text-slate-400 block mt-0.5">
                    Sécurisez vos ventes WhatsApp & RS
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole("DRIVER")}
                  role="radio"
                  aria-checked={role === "DRIVER"}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    role === "DRIVER"
                      ? "border-brand-border bg-brand-soft/50 dark:bg-emerald-950/30 text-brand dark:text-emerald-200 shadow-sm"
                      : "border-hairline dark:border-slate-800 hover:border-hairline bg-white dark:bg-slate-800 text-brand dark:text-slate-300"
                  }`}
                >
                  <span className="text-2xl block mb-1">🛵</span>
                  <span className="font-bold text-sm block">Livreur</span>
                  <span className="text-[11px] text-ink-muted dark:text-slate-400 block mt-0.5">
                    Effectuez les livraisons et validez par OTP
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole("CLIENT")}
                  role="radio"
                  aria-checked={role === "CLIENT"}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    role === "CLIENT"
                      ? "border-brand-border bg-brand-soft/50 dark:bg-emerald-950/30 text-brand dark:text-emerald-200 shadow-sm"
                      : "border-hairline dark:border-slate-800 hover:border-hairline bg-white dark:bg-slate-800 text-brand dark:text-slate-300"
                  }`}
                >
                  <span className="text-2xl block mb-1">👤</span>
                  <span className="font-bold text-sm block">Client</span>
                  <span className="text-[11px] text-ink-muted dark:text-slate-400 block mt-0.5">
                    Achetez en toute confiance
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="name"
                  className="block text-xs font-semibold text-brand dark:text-slate-300 uppercase tracking-wider mb-1.5"
                >
                  Nom complet / Prénom
                </label>
                <input
                  id="name"
                  autoComplete="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Koffi Emmanuel"
                  className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand-border transition-all text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="block text-xs font-semibold text-brand dark:text-slate-300 uppercase tracking-wider mb-1.5"
                >
                  Numéro de téléphone
                </label>
                <input
                  id="phone"
                  autoComplete="tel"
                  inputMode="tel"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+225 07 00 00 00 00"
                  className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand-border transition-all text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold text-brand dark:text-slate-300 uppercase tracking-wider mb-1.5"
                >
                  Email <span className="text-ink-muted dark:text-slate-400 font-normal lowercase">(optionnel)</span>
                </label>
                <input
                  id="email"
                  autoComplete="email"
                  inputMode="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="exemple@domaine.com"
                  className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand-border transition-all text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-brand dark:text-slate-300 uppercase tracking-wider mb-1.5"
                >
                  Mot de passe
                </label>
                <input
                  id="password"
                  autoComplete="new-password"
                  aria-describedby="aide-mot-de-passe"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Au moins 6 caractères"
                  className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand-border transition-all text-sm"
                />
                {/* L'exigence ne vivait que dans le placeholder, qui disparait
                    des la premiere frappe et n'est lu par aucun lecteur d'ecran. */}
                <p
                  id="aide-mot-de-passe"
                  className="mt-1 text-xs text-ink-muted dark:text-slate-400"
                >
                  6 caractères minimum.
                </p>
              </div>
            </div>

            {/* Role Specific Additional Fields */}
            {role === "SELLER" && (
              <div>
                <label
                  htmlFor="businessName"
                  className="block text-xs font-semibold text-brand dark:text-slate-300 uppercase tracking-wider mb-1.5"
                >
                  Nom de votre boutique / commerce
                </label>
                <input
                  id="businessName"
                  autoComplete="organization"
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Ex: Abidjan Mode Express"
                  className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand-border transition-all text-sm"
                />
              </div>
            )}

            {role === "DRIVER" && (
              <div>
                <label
                  htmlFor="vehicle"
                  className="block text-xs font-semibold text-brand dark:text-slate-300 uppercase tracking-wider mb-1.5"
                >
                  Type de véhicule / immatriculation
                </label>
                <input
                  id="vehicle"
                  type="text"
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                  placeholder="Ex: Moto Yamaha YBR - AB-999-CI"
                  className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand-border transition-all text-sm"
                />
              </div>
            )}

            {role === "CLIENT" && (
              <div>
                <label
                  htmlFor="city"
                  className="block text-xs font-semibold text-brand dark:text-slate-300 uppercase tracking-wider mb-1.5"
                >
                  Ville de résidence
                </label>
                <input
                  id="city"
                  autoComplete="address-level2"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ex: Abidjan, Bouaké, San-Pédro"
                  className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand-border transition-all text-sm"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm shadow-md shadow-brand/25 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Création du compte...</span>
                </>
              ) : (
                "Créer mon compte"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-ink-muted dark:text-slate-400">
              Vous avez déjà un compte ?{" "}
              <Link
                href="/connexion"
                className="inline-flex items-center min-h-[44px] font-semibold text-brand hover:text-brand-strong dark:text-emerald-400 underline underline-offset-4"
              >
                Se connecter
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
