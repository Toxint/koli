"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthHeader } from "@/components/ui/AuthHeader";
import { registerAction } from "@/lib/auth/actions";
import { BoutonGoogle } from "@/components/ui/BoutonGoogle";
import { Icone } from "@/components/ui/Icone";

type RoleType = "SELLER" | "DRIVER" | "CLIENT";

export interface InvitationLivreur {
  /** Le jeton, tel qu'il voyagera jusqu'à `registerAction`. */
  jeton: string;
  /** L'enseigne du vendeur, pour que le livreur sache où il entre. */
  boutique: string;
}

export function FormulaireInscription({
  googleConfigure,
  motifGoogle,
  invitation = null,
  invitationRefusee = false,
}: {
  googleConfigure: boolean;
  motifGoogle?: "configuration" | "adresse";
  /** Renseignée quand la page a été ouverte par un lien d'invitation valable. */
  invitation?: InvitationLivreur | null;
  /** Un jeton était présent, mais il ne vaut plus rien. */
  invitationRefusee?: boolean;
}) {
  const router = useRouter();
  /*
   * Un lien d'invitation FIXE le rôle sur « livreur ».
   *
   * Le lien ne dit pas « inscris-toi », il dit « rejoins mon équipe de
   * livraison ». Laisser le choix ouvert produirait le cas absurde d'un
   * vendeur qui s'inscrit par le lien d'un autre vendeur, et que l'application
   * essaierait ensuite de rattacher à une équipe alors qu'il n'a pas de profil
   * de livreur — `registerAction` refuserait en silence, sans que personne ne
   * comprenne pourquoi.
   */
  const [role, setRole] = useState<RoleType>(invitation ? "DRIVER" : "SELLER");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [zone, setZone] = useState("");
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
    if (role === "DRIVER") {
      formData.append("vehicle", vehicle);
      formData.append("zone", zone);
    }
    if (role === "CLIENT") formData.append("city", city);

    // Le jeton part avec l'inscription. `registerAction` le revalide contre la
    // base : entre l'ouverture de cette page et l'envoi du formulaire, le
    // vendeur a pu révoquer son lien, et c'est le contrôle au moment d'écrire
    // qui fait foi — pas celui qui a permis d'afficher l'écran.
    if (invitation) formData.append("invitation", invitation.jeton);

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

          {/*
            * Le lien d'invitation, annoncé AVANT le formulaire.
            *
            * Le livreur doit savoir chez qui il entre avant de donner son nom
            * et son numéro. C'est la moindre des choses sur une application
            * dont le sujet est de ne pas avoir à faire confiance à l'aveugle.
            */}
          {invitation && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-brand-border bg-brand-soft/60 p-4">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand"
              >
                <Icone nom="livreur" className="h-4 w-4 text-white" />
              </span>
              <div className="min-w-0 text-sm">
                <p className="font-bold text-brand">
                  Vous rejoignez l&apos;équipe de {invitation.boutique}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                  Une fois votre compte créé, {invitation.boutique} pourra vous
                  confier des livraisons. Vous restez libre de vous déclarer
                  indisponible à tout moment depuis votre profil.
                </p>
              </div>
            </div>
          )}

          {/*
            * Un jeton présent mais mort. Le dire, plutôt que d'inscrire le
            * livreur dans le vide : il croirait avoir rejoint une équipe, le
            * vendeur ne le verrait jamais apparaître, et ni l'un ni l'autre
            * n'aurait le moindre indice sur ce qui a échoué.
            */}
          {invitationRefusee && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-xl border border-gold-deep/40 bg-gold-soft p-4 text-sm text-gold-deep"
            >
              <Icone nom="alerte" className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold">Ce lien d&apos;invitation n&apos;est plus valable.</p>
                <p className="mt-0.5 text-xs leading-relaxed">
                  Il a expiré, ou le vendeur l&apos;a remplacé. Demandez-lui un
                  nouveau lien. Vous pouvez créer votre compte dès maintenant —
                  il faudra simplement le rattacher ensuite.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Choix du role — `radiogroup` et `aria-checked` : l'etat
                selectionne n'etait signale que par la couleur, donc invisible
                pour un lecteur d'ecran comme pour un daltonien (§69).

                Masque entierement sous invitation : le lien decide du role, et
                trois boutons dont deux sont interdits posent une question dont
                la reponse est deja prise. */}
            <div hidden={Boolean(invitation)}>
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
                  <Icone nom="boutique" className="w-6 h-6 mb-1 text-brand" />
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
                  <Icone nom="livreur" className="w-6 h-6 mb-1 text-brand" />
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
                  <Icone nom="client" className="w-6 h-6 mb-1 text-brand" />
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

                {/*
                  * La zone, demandée à l'inscription et non plus tard.
                  *
                  * C'est le seul moment où on est sûr d'avoir l'attention du
                  * livreur. Renvoyée au profil, elle serait restée vide chez la
                  * plupart — et le vendeur aurait eu une liste de noms sans la
                  * seule information dont il a besoin pour choisir.
                  *
                  * Facultative malgré tout : un livreur qui ne sait pas encore
                  * où il tournera ne doit pas être bloqué à l'inscription.
                  */}
                <label
                  htmlFor="zone"
                  className="mt-4 block text-xs font-semibold uppercase tracking-wider text-brand dark:text-slate-300 mb-1.5"
                >
                  Où livrez-vous ?{" "}
                  <span className="font-normal normal-case tracking-normal text-ink-muted">
                    (facultatif)
                  </span>
                </label>
                <input
                  id="zone"
                  name="zone"
                  type="text"
                  maxLength={80}
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  placeholder="Ex: Yopougon, Adjamé et Plateau"
                  aria-describedby="aide-zone"
                  className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand-border transition-all text-sm"
                />
                <p id="aide-zone" className="mt-1 text-xs text-ink-muted">
                  Les vendeurs de votre équipe le verront pour savoir quelles
                  courses vous confier.
                </p>
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

          <div className="mt-6">
            <BoutonGoogle configure={googleConfigure}
              motif={motifGoogle} libelle="S'inscrire avec Google" />
          </div>

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
