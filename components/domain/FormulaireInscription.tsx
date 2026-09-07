"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { AuthHeader } from "@/components/ui/AuthHeader";
import { registerAction } from "@/lib/auth/actions";
import { BoutonGoogle } from "@/components/ui/BoutonGoogle";
import { Icone } from "@/components/ui/Icone";
import { MARCHES, type Marche } from "@/data/markets";

type RoleType = "SELLER" | "DRIVER" | "CLIENT";

export interface InvitationLivreur {
  /** Le jeton, tel qu'il voyagera jusqu'à `registerAction`. */
  jeton: string;
  /** L'enseigne du vendeur, pour que le livreur sache où il entre. */
  boutique: string;
}

/** Voir `FormulaireConnexion` : `useFormStatus` n'ecoute qu'un `<form>` parent. */
function BoutonEnvoyer() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-3.5 px-4 rounded-xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm shadow-md shadow-brand/25 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
    >
      {pending ? (
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
  );
}

/** L'apparence d'une carte de role, selectionnee ou non — par le CSS, pas par React. */
const CARTE_ROLE =
  "block p-4 rounded-xl border-2 text-left transition-all cursor-pointer " +
  "border-hairline dark:border-slate-800 bg-white dark:bg-slate-800 text-brand dark:text-slate-300 " +
  "hover:border-hairline " +
  "has-[:checked]:border-brand-border has-[:checked]:bg-brand-soft/50 " +
  "dark:has-[:checked]:bg-emerald-950/30 dark:has-[:checked]:text-emerald-200 has-[:checked]:shadow-sm " +
  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-offset-2";

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
  /*
   * Le role initial. Un lien d'invitation le FIXE sur « livreur ».
   *
   * Le lien ne dit pas « inscris-toi », il dit « rejoins mon equipe de
   * livraison ». Laisser le choix ouvert produirait le cas absurde d'un
   * vendeur qui s'inscrit par le lien d'un autre vendeur, et que
   * l'application essaierait ensuite de rattacher a une equipe alors qu'il
   * n'a pas de profil de livreur.
   */
  const roleInitial: RoleType = invitation ? "DRIVER" : "SELLER";

  /*
   * `useActionState` plutot qu'un `onSubmit` — meme raison qu'a la connexion.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │  Un `onSubmit` n'existe QU'APRES l'hydratation. Avant, on remplit,   │
   * │  on clique, et rien ne part.                                         │
   * └──────────────────────────────────────────────────────────────────────┘
   */
  const [etat, envoyer] = useActionState(registerAction, null);
  const error = etat?.error ?? null;

  /* Ce que la personne venait de taper, pour ne pas le lui faire retaper. */
  const saisi = (champ: string, defaut = "") => etat?.saisie?.[champ] ?? defaut;
  const roleChoisi = (etat?.saisie?.role as RoleType) || roleInitial;

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

          {/* `data-inscription` : c'est par lui que `globals.css` montre le
              bloc de champs correspondant au role coche — sans JavaScript. */}
          <form action={envoyer} data-inscription className="space-y-6">
            {/*
              * Le jeton part avec le formulaire. `registerAction` le revalide
              * contre la base : entre l'ouverture de cette page et l'envoi, le
              * vendeur a pu revoquer son lien, et c'est le controle au moment
              * d'ECRIRE qui fait foi — pas celui qui a permis d'afficher
              * l'ecran.
              */}
            {invitation && (
              <input type="hidden" name="invitation" value={invitation.jeton} />
            )}
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
              {/*
                * De VRAIES radios, et non des `<button role="radio">`.
                *
                * ┌──────────────────────────────────────────────────────────┐
                * │  Un bouton ne change d'etat que par JavaScript. Avant    │
                * │  l'hydratation, ces trois cartes ne repondaient a rien.  │
                * └──────────────────────────────────────────────────────────┘
                *
                * Une radio est cochee par le NAVIGATEUR, et sa valeur part
                * avec le formulaire sans que personne n'ait a l'y mettre. Le
                * role selectionne se voit par `has-[:checked]` en CSS, et les
                * champs qui en dependent par une regle de `globals.css` —
                * donc sans JavaScript la aussi.
                *
                * L'`input` est en `sr-only` et non `hidden` : masque pour de
                * bon, il sortirait de l'ordre de tabulation et deviendrait
                * inatteignable au clavier.
                */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className={CARTE_ROLE}>
                  <input
                    type="radio"
                    name="role"
                    value="SELLER"
                    defaultChecked={roleChoisi === "SELLER"}
                    className="sr-only"
                  />
                  <Icone nom="boutique" className="w-6 h-6 mb-1 text-brand" />
                  <span className="font-bold text-sm block">Vendeur</span>
                  <span className="text-[11px] text-ink-muted dark:text-slate-400 block mt-0.5">
                    Sécurisez vos ventes WhatsApp &amp; RS
                  </span>
                </label>

                <label className={CARTE_ROLE}>
                  <input
                    type="radio"
                    name="role"
                    value="DRIVER"
                    defaultChecked={roleChoisi === "DRIVER"}
                    className="sr-only"
                  />
                  <Icone nom="livreur" className="w-6 h-6 mb-1 text-brand" />
                  <span className="font-bold text-sm block">Livreur</span>
                  <span className="text-[11px] text-ink-muted dark:text-slate-400 block mt-0.5">
                    Effectuez les livraisons et validez par OTP
                  </span>
                </label>

                <label className={CARTE_ROLE}>
                  <input
                    type="radio"
                    name="role"
                    value="CLIENT"
                    defaultChecked={roleChoisi === "CLIENT"}
                    className="sr-only"
                  />
                  <Icone nom="client" className="w-6 h-6 mb-1 text-brand" />
                  <span className="font-bold text-sm block">Client</span>
                  <span className="text-[11px] text-ink-muted dark:text-slate-400 block mt-0.5">
                    Achetez en toute confiance
                  </span>
                </label>
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
                  name="name"
                  defaultValue={saisi("name")}
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
                  name="phone"
                  defaultValue={saisi("phone")}
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
                  name="email"
                  defaultValue={saisi("email")}
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
                  name="password"
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
            {/*
              * Les trois blocs sont TOUS rendus, et `globals.css` montre celui
              * qui correspond au role coche.
              *
              * Un rendu conditionnel en React ne produirait que le bloc du
              * role initial : sans JavaScript, changer de role ne ferait rien
              * apparaitre. Aucun de ces champs n'est `required` — un champ
              * obligatoire masque bloque l'envoi avec une erreur que personne
              * ne peut voir ni corriger.
              */}
            <div data-champs-role="SELLER">
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
                  name="businessName"
                  defaultValue={saisi("businessName")}
                  placeholder="Ex: Abidjan Mode Express"
                  className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand-border transition-all text-sm"
                />
            </div>

            <div data-champs-role="DRIVER">
                <label
                  htmlFor="vehicle"
                  className="block text-xs font-semibold text-brand dark:text-slate-300 uppercase tracking-wider mb-1.5"
                >
                  Type de véhicule / immatriculation
                </label>
                <input
                  id="vehicle"
                  type="text"
                  name="vehicle"
                  defaultValue={saisi("vehicle")}
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
                  defaultValue={saisi("zone")}
                  placeholder="Ex: Yopougon, Adjamé et Plateau"
                  aria-describedby="aide-zone"
                  className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand-border transition-all text-sm"
                />
                <p id="aide-zone" className="mt-1 text-xs text-ink-muted">
                  Les vendeurs de votre équipe le verront pour savoir quelles
                  courses vous confier.
                </p>
            </div>

            <div>
              <label
                htmlFor="country"
                className="block text-xs font-semibold text-brand dark:text-slate-300 uppercase tracking-wider mb-1.5"
              >
                Pays
              </label>
              <select
                id="country"
                autoComplete="country-name"
                name="country"
                defaultValue={saisi("country", MARCHES[0].name)}
                className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand-border transition-all text-sm"
              >
                {MARCHES.map((marche: Marche) => (
                  <option key={marche.code} value={marche.name}>
                    {marche.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-muted">
                Il détermine la monnaie de vos prix et les opérateurs proposés à
                vos acheteurs.
              </p>
            </div>

            <div data-champs-role="CLIENT">
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
                  name="city"
                  defaultValue={saisi("city", "Abidjan")}
                  placeholder="Ex: Abidjan, Bouaké, San-Pédro"
                  className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand-border transition-all text-sm"
                />
            </div>

            <BoutonEnvoyer />
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
