"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { demanderVersementAction } from "@/lib/finance/versement-actions";
import { VERSEMENT_MINIMUM } from "@/lib/finance/versement";
import { formatMontant } from "@/lib/format";
import { type Devise } from "@/data/markets";
import { Icone } from "@/components/ui/Icone";
import type { CompteRetraitVue } from "@/components/domain/ComptesRetrait";

/**
 * Demander un versement (§43).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  C'est le seul écran de KOLI où quelqu'un réclame de l'argent. Il doit  │
 * │  dire combien, où, et ce qui se passe ensuite — avant qu'on clique.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Cinq décisions, et chacune se déferait sans être écrite :
 *
 * - **`<form action={…}>` et `useActionState`, jamais un `onSubmit`.** Un
 *   `onSubmit` n'existe qu'après l'hydratation : sur un téléphone d'entrée de
 *   gamme et un réseau lent (§70), le vendeur remplit, clique, et rien ne part.
 *   Ici cela vaut pour de l'argent.
 *
 * - **Les champs sont NON CONTRÔLÉS.** Un refus recharge le formulaire ; un
 *   `value` piloté par un état n'a personne pour le piloter sans JavaScript, et
 *   retaper un numéro Mobile Money sur un clavier de téléphone après s'être
 *   trompé, c'est ce qui fait abandonner.
 *
 * - **Le numéro est DEMANDÉ à chaque fois**, jamais prérempli depuis le compte.
 *   C'est la seule donnée qui décide de la DESTINATION de l'argent, et un
 *   numéro change — souvent, sur ce marché. Le préremplir ferait partir un
 *   versement vers une ligne résiliée sans que personne ne s'en aperçoive.
 *
 * - **L'écran dit que c'est MANUEL.** L'exécution passe par l'administration :
 *   promettre un virement instantané qu'on ne tient pas coûte plus cher que
 *   d'annoncer un délai.
 *
 * - **Rien n'est proposé quand il n'y a rien à retirer.** Un formulaire qu'on
 *   ne peut pas soumettre invite à essayer, puis explique. Autant expliquer
 *   d'abord.
 */

function BoutonDemander() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-brand px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong disabled:opacity-50"
    >
      {pending ? "Envoi de la demande…" : "Demander un versement"}
    </button>
  );
}

export function DemanderVersement({
  versable,
  enAttente,
  devise,
  comptes,
}: {
  /** Ce qui peut être demandé MAINTENANT, demandes en cours déduites. */
  versable: number;
  /** Ce qui est déjà demandé et gelé. Zéro si rien n'est en cours. */
  enAttente: number;
  devise: Devise;
  /** Les numéros enregistrés par le vendeur. Il en CHOISIT un. */
  comptes: CompteRetraitVue[];
}) {
  const [etat, envoyer] = useActionState(demanderVersementAction, null);

  /* Une demande en cours : on n'en propose pas une seconde. Deux demandes
     successives videraient le même solde deux fois — la garde est aussi côté
     serveur, celle-ci évite d'inviter à une manœuvre qu'on refusera. */
  if (enAttente > 0) {
    return (
      <section className="rounded-3xl border border-brand-border bg-brand-soft/50 p-6">
        <h2 className="font-titre text-lg font-bold text-heading">
          Versement en cours
        </h2>
        <p className="mt-2 text-sm text-ink">
          Une demande de{" "}
          <strong className="font-semibold">
            {formatMontant(enAttente, devise)}
          </strong>{" "}
          est en attente de traitement. Vous pourrez en faire une nouvelle dès
          qu&apos;elle sera réglée.
        </p>
      </section>
    );
  }

  if (versable < VERSEMENT_MINIMUM) {
    return (
      <section className="rounded-3xl border border-hairline bg-white p-6">
        <h2 className="font-titre text-lg font-bold text-heading">
          Retirer mes fonds
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Le versement minimum est de{" "}
          {formatMontant(VERSEMENT_MINIMUM, devise)}. Vous disposez de{" "}
          {formatMontant(versable, devise)} — laissez votre solde grandir un
          peu.
        </p>
      </section>
    );
  }

  /*
   * Aucun numéro enregistré : on ne propose pas un formulaire qu'on refusera.
   *
   * Le serveur refuse déjà une demande sans compte — cette branche évite
   * d'inviter à une manœuvre impossible, comme pour la demande déjà en cours.
   */
  if (comptes.length === 0) {
    return (
      <section className="rounded-3xl border border-hairline bg-white p-6">
        <h2 className="font-titre text-lg font-bold text-heading">
          Retirer mes fonds
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Vous disposez de {formatMontant(versable, devise)}. Enregistrez
          d&apos;abord le numéro Mobile Money qui doit recevoir l&apos;argent —
          vous n&apos;aurez plus qu&apos;à le choisir ensuite, à chaque retrait.
        </p>
        <a
          href="#numeros-de-retrait"
          className="mt-4 inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-brand px-6 text-sm font-semibold text-white"
        >
          <Icone nom="telephone" className="h-4 w-4" />
          Enregistrer un numéro de retrait
        </a>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-hairline bg-white p-6">
      <h2 className="font-titre text-lg font-bold text-heading">
        Retirer mes fonds
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Vous pouvez retirer jusqu&apos;à{" "}
        <strong className="font-semibold text-ink">
          {formatMontant(versable, devise)}
        </strong>
        .
      </p>

      {etat?.error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger"
        >
          {etat.error}
        </p>
      )}
      {etat?.success && etat.message && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-brand-border bg-brand-soft/60 px-4 py-3 text-sm text-brand"
        >
          {etat.message}
        </p>
      )}

      <form action={envoyer} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="montant"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted"
          >
            Montant à verser
          </label>
          <input
            id="montant"
            name="montant"
            type="number"
            inputMode="numeric"
            min={VERSEMENT_MINIMUM}
            max={versable}
            step={1}
            /* Prérempli au maximum : c'est ce qu'on vient faire dans la
               quasi-totalité des cas, et cela évite de retaper un nombre à
               cinq chiffres. */
            defaultValue={versable}
            required
            className="w-full rounded-xl border border-hairline bg-white px-4 py-3 text-sm focus:border-brand-border focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <p className="mt-1 text-[11px] text-ink-muted">
            Minimum {formatMontant(VERSEMENT_MINIMUM, devise)}.
          </p>
        </div>

        {/*
          * Le numéro se CHOISIT, il ne se retape plus.
          *
          * ⚠ Et ce n'est pas un pré-remplissage silencieux — c'était
          * précisément ce que la version d'origine interdisait. Le vendeur voit
          * le numéro COMPLET et le nom du titulaire en face de chaque bouton
          * radio : il relit la destination au lieu de la ressaisir. Un compte
          * proposé en premier reste un compte qu'il faut avoir sous les yeux
          * pour valider.
          *
          * Des radios NATIVES, pas une liste déroulante : les options d'un
          * `<select>` fermé sont tronquées (c'est ce qui avait fait disparaître
          * la monnaie du libellé des pays), et ici c'est le numéro qu'on
          * tronquerait.
          */}
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Numéro qui recevra l&apos;argent
          </legend>
          <div className="space-y-2">
            {comptes.map((c, i) => (
              <label
                key={c.id}
                data-choix-compte={c.id}
                className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-hairline bg-white p-3 text-sm has-[:checked]:border-brand-border has-[:checked]:bg-brand-soft/40"
              >
                <input
                  type="radio"
                  name="compteId"
                  value={c.id}
                  /* Le compte « proposé en premier » est coché, à défaut le
                     premier de la liste : un formulaire dont rien n'est coché
                     fait échouer l'envoi sans dire pourquoi. */
                  defaultChecked={c.isDefault || (i === 0 && !comptes.some((x) => x.isDefault))}
                  className="mt-1 h-4 w-4 shrink-0 text-brand focus:ring-brand"
                />
                <span className="min-w-0">
                  <span className="block font-mono font-semibold text-ink [overflow-wrap:anywhere]">
                    {c.phone}
                  </span>
                  <span className="block text-ink-muted [overflow-wrap:anywhere]">
                    {c.holderName} · {c.operator}
                    {c.label ? ` · « ${c.label} »` : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-muted">
            Relisez-le : c&apos;est là que l&apos;argent sera envoyé.{" "}
            <a href="#numeros-de-retrait" className="font-semibold text-brand underline">
              Gérer mes numéros
            </a>
          </p>
        </fieldset>

        <div className="flex items-end">
          <BoutonDemander />
        </div>
      </form>

      <p className="mt-4 flex items-start gap-2 text-xs text-ink-muted">
        <Icone nom="info" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <span>
          Les versements sont vérifiés puis exécutés par l&apos;équipe KOLI. Vous
          verrez la demande passer à « versée » ici même, avec sa référence de
          transfert.
        </span>
      </p>
    </section>
  );
}
