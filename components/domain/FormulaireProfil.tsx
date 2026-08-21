"use client";

import { useState } from "react";
import {
  updateProfilAction,
  changerMotDePasseAction,
} from "@/lib/auth/profil";

export interface ProfilInitial {
  name: string;
  phone: string;
  email: string;
  role: string;
  businessName?: string | null;
  vehicle?: string | null;
  city?: string | null;
  /** Un compte créé via Google n'en a pas encore : il en définit un premier. */
  aMotDePasse: boolean;
}

const CHAMP =
  "w-full min-h-[48px] px-4 rounded-xl border border-hairline bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand";

/** Page de profil commune aux quatre rôles (§64). */
export function FormulaireProfil({ initial }: { initial: ProfilInitial }) {
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const [msgMdp, setMsgMdp] = useState<string | null>(null);
  const [errMdp, setErrMdp] = useState<string | null>(null);
  const [enCoursMdp, setEnCoursMdp] = useState(false);

  const enregistrer = async (formData: FormData) => {
    setEnCours(true);
    setMessage(null);
    setErreur(null);
    const res = await updateProfilAction(formData);
    if (res.success) setMessage(res.message);
    else setErreur(res.error);
    setEnCours(false);
  };

  const changerMotDePasse = async (formData: FormData) => {
    setEnCoursMdp(true);
    setMsgMdp(null);
    setErrMdp(null);
    const res = await changerMotDePasseAction(formData);
    if (res.success) setMsgMdp(res.message);
    else setErrMdp(res.error);
    setEnCoursMdp(false);
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-hairline p-6">
        <h2 className="text-lg mb-4">Mes informations</h2>

        {message && (
          <p
            role="status"
            className="mb-4 p-3 rounded-xl bg-brand-soft text-brand text-sm font-medium"
          >
            {message}
          </p>
        )}
        {erreur && (
          <p
            role="alert"
            className="mb-4 p-3 rounded-xl bg-red-50 text-danger text-sm font-medium"
          >
            {erreur}
          </p>
        )}

        <form action={enregistrer} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-xs font-semibold mb-1.5">
              Nom complet
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              autoComplete="name"
              defaultValue={initial.name}
              className={CHAMP}
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-xs font-semibold mb-1.5">
              Email{" "}
              <span className="text-ink-muted font-normal">(optionnel)</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={initial.email}
              className={CHAMP}
            />
          </div>

          {initial.businessName !== undefined && (
            <div>
              <label
                htmlFor="businessName"
                className="block text-xs font-semibold mb-1.5"
              >
                Nom de la boutique
              </label>
              <input
                id="businessName"
                name="businessName"
                type="text"
                autoComplete="organization"
                defaultValue={initial.businessName ?? ""}
                className={CHAMP}
              />
            </div>
          )}

          {initial.vehicle !== undefined && (
            <div>
              <label
                htmlFor="vehicle"
                className="block text-xs font-semibold mb-1.5"
              >
                Véhicule
              </label>
              <input
                id="vehicle"
                name="vehicle"
                type="text"
                defaultValue={initial.vehicle ?? ""}
                className={CHAMP}
              />
            </div>
          )}

          {initial.city !== undefined && (
            <div>
              <label htmlFor="city" className="block text-xs font-semibold mb-1.5">
                Ville
              </label>
              <input
                id="city"
                name="city"
                type="text"
                autoComplete="address-level2"
                defaultValue={initial.city ?? ""}
                className={CHAMP}
              />
            </div>
          )}

          {/* Le telephone identifie le compte et rattache les commandes passees
              en mode invite : le modifier exigerait de verifier le nouveau
              numero, donc l'envoi de SMS (phase 31). */}
          <div>
            <label
              htmlFor="phone"
              className="block text-xs font-semibold mb-1.5"
            >
              Téléphone
            </label>
            <input
              id="phone"
              type="tel"
              value={initial.phone}
              readOnly
              aria-describedby="aide-telephone"
              className={`${CHAMP} bg-brand-soft/50 text-ink-muted`}
            />
            <p id="aide-telephone" className="mt-1 text-xs text-ink-muted">
              Le numéro sert d&apos;identifiant de connexion. Contactez le
              support pour le modifier.
            </p>
          </div>

          <button
            type="submit"
            disabled={enCours}
            className="min-h-[48px] px-6 rounded-2xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {enCours ? "Enregistrement…" : "Enregistrer"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-hairline p-6">
        <h2 className="text-lg mb-4">
          {initial.aMotDePasse
            ? "Changer mon mot de passe"
            : "Définir un mot de passe"}
        </h2>

        {!initial.aMotDePasse && (
          <p className="mb-4 text-xs text-ink-muted">
            Votre compte se connecte avec Google. En définissant un mot de
            passe, vous pourrez aussi entrer avec votre numéro de téléphone —
            utile si vous n&apos;avez pas accès à votre compte Google.
          </p>
        )}

        {msgMdp && (
          <p
            role="status"
            className="mb-4 p-3 rounded-xl bg-brand-soft text-brand text-sm font-medium"
          >
            {msgMdp}
          </p>
        )}
        {errMdp && (
          <p
            role="alert"
            className="mb-4 p-3 rounded-xl bg-red-50 text-danger text-sm font-medium"
          >
            {errMdp}
          </p>
        )}

        <form action={changerMotDePasse} className="space-y-4">
          {initial.aMotDePasse && (
            <div>
              <label
                htmlFor="actuel"
                className="block text-xs font-semibold mb-1.5"
              >
                Mot de passe actuel
              </label>
              <input
                id="actuel"
                name="actuel"
                type="password"
                required
                autoComplete="current-password"
                className={CHAMP}
              />
            </div>
          )}

          <div>
            <label
              htmlFor="nouveau"
              className="block text-xs font-semibold mb-1.5"
            >
              Nouveau mot de passe
            </label>
            <input
              id="nouveau"
              name="nouveau"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              aria-describedby="aide-nouveau"
              className={CHAMP}
            />
            <p id="aide-nouveau" className="mt-1 text-xs text-ink-muted">
              8 caractères minimum.
            </p>
          </div>

          <button
            type="submit"
            disabled={enCoursMdp}
            className="min-h-[48px] px-6 rounded-2xl border border-brand text-brand hover:bg-brand-soft font-semibold text-sm transition-colors disabled:opacity-50"
          >
            {enCoursMdp
              ? "Enregistrement…"
              : initial.aMotDePasse
                ? "Modifier le mot de passe"
                : "Définir mon mot de passe"}
          </button>
        </form>
      </section>
    </div>
  );
}
