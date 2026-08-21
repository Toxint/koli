"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { terminerInscriptionGoogleAction } from "@/lib/auth/googleInscription";

const CHAMP =
  "w-full min-h-[48px] px-4 rounded-xl border border-hairline bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand";

const ROLES = [
  {
    valeur: "SELLER",
    titre: "Vendeur",
    detail: "Je vends et j'envoie des liens de paiement",
    emoji: "🛍️",
  },
  {
    valeur: "CLIENT",
    titre: "Client",
    detail: "J'achète et je suis mes commandes",
    emoji: "👤",
  },
  {
    valeur: "DRIVER",
    titre: "Livreur",
    detail: "Je livre les colis",
    emoji: "🛵",
  },
];

/**
 * Dernière étape de l'inscription Google.
 *
 * Google fournit le nom, l'e-mail et la photo — mais ni le téléphone ni le
 * rôle, dont KOLI ne peut pas se passer : le numéro porte la livraison, le
 * code de réception (§27) et le rattachement des commandes passées en invité.
 */
export function ComplementGoogle({
  nom,
  email,
}: {
  nom: string;
  email: string | null;
}) {
  const router = useRouter();
  const [role, setRole] = useState("CLIENT");
  const [erreur, setErreur] = useState<string | null>(null);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);

  const envoyer = async (formData: FormData) => {
    setEnCours(true);
    setErreur(null);
    setChamps({});

    const res = await terminerInscriptionGoogleAction(formData);
    if (res.success && res.redirectTo) {
      router.push(res.redirectTo);
      router.refresh();
      return;
    }

    setErreur(res.error ?? "Une erreur est survenue.");
    setChamps(res.fieldErrors ?? {});
    setEnCours(false);
  };

  return (
    <form action={envoyer} className="space-y-6">
      {erreur && (
        <p
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm"
        >
          {erreur}
        </p>
      )}

      <div className="rounded-2xl bg-brand-soft/60 border border-brand-border px-4 py-3">
        <p className="text-sm font-semibold">{nom}</p>
        {email && <p className="text-xs text-ink-muted break-all">{email}</p>}
        <p className="text-xs text-ink-muted mt-1">
          Identité confirmée par Google.
        </p>
      </div>

      <fieldset>
        <legend className="block text-xs font-semibold mb-2">
          Vous utilisez KOLI en tant que
        </legend>
        {/* Boutons radio et non liste déroulante : le choix conditionne tout
            l'espace, il doit être lisible d'un coup d'œil sur un téléphone. */}
        <div className="space-y-2">
          {ROLES.map((r) => (
            <label
              key={r.valeur}
              className={`flex items-center gap-3 rounded-2xl border px-4 min-h-[56px] cursor-pointer ${
                role === r.valeur
                  ? "border-brand bg-brand-soft/60"
                  : "border-hairline hover:bg-brand-soft/30"
              }`}
            >
              <input
                type="radio"
                name="role"
                value={r.valeur}
                checked={role === r.valeur}
                onChange={(e) => setRole(e.target.value)}
                className="sr-only"
              />
              <span aria-hidden="true" className="text-xl">
                {r.emoji}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{r.titre}</span>
                <span className="block text-xs text-ink-muted">
                  {r.detail}
                </span>
              </span>
            </label>
          ))}
        </div>
        {champs.role && (
          <p role="alert" className="mt-1 text-xs text-danger font-medium">
            {champs.role}
          </p>
        )}
      </fieldset>

      <div>
        <label htmlFor="phone" className="block text-xs font-semibold mb-1.5">
          Numéro de téléphone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          placeholder="+225 07 01 02 03 04"
          aria-describedby="aide-telephone"
          className={CHAMP}
        />
        <p id="aide-telephone" className="mt-1 text-xs text-ink-muted">
          Il sert à vous joindre pour la livraison et à retrouver vos commandes
          passées sans compte.
        </p>
        {champs.phone && (
          <p role="alert" className="mt-1 text-xs text-danger font-medium">
            {champs.phone}
          </p>
        )}
      </div>

      {role === "SELLER" && (
        <div>
          <label
            htmlFor="businessName"
            className="block text-xs font-semibold mb-1.5"
          >
            Nom de votre boutique{" "}
            <span className="text-ink-muted font-normal">(optionnel)</span>
          </label>
          <input
            id="businessName"
            name="businessName"
            type="text"
            autoComplete="organization"
            placeholder={nom}
            className={CHAMP}
          />
        </div>
      )}

      {role === "DRIVER" && (
        <div>
          <label
            htmlFor="vehicle"
            className="block text-xs font-semibold mb-1.5"
          >
            Véhicule{" "}
            <span className="text-ink-muted font-normal">(optionnel)</span>
          </label>
          <input
            id="vehicle"
            name="vehicle"
            type="text"
            placeholder="Moto"
            className={CHAMP}
          />
        </div>
      )}

      {role === "CLIENT" && (
        <div>
          <label htmlFor="city" className="block text-xs font-semibold mb-1.5">
            Ville <span className="text-ink-muted font-normal">(optionnel)</span>
          </label>
          <input
            id="city"
            name="city"
            type="text"
            autoComplete="address-level2"
            placeholder="Abidjan"
            className={CHAMP}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={enCours}
        className="w-full min-h-[48px] px-6 rounded-2xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm disabled:opacity-50"
      >
        {enCours ? "Création du compte…" : "Créer mon compte KOLI"}
      </button>
    </form>
  );
}
