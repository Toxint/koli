"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { Icone } from "@/components/ui/Icone";
import {
  enregistrerCompteRetraitAction,
  supprimerCompteRetraitAction,
} from "@/lib/finance/comptes-retrait-actions";
import { COMPTES_RETRAIT_MAX } from "@/lib/finance/comptes-retrait";

/**
 * Les NUMÉROS DE RETRAIT du vendeur — enregistrés une fois, choisis ensuite.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Demande de l'utilisateur, le 14 septembre 2026 : « qu'il ne puisse pas │
 * │  commencer à mettre les numéros à chaque fois qu'il a besoin            │
 * │  d'effectuer un retrait ».                                              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Cinq décisions, et chacune se déferait sans être écrite :
 *
 * - **Le numéro est affiché EN ENTIER, jamais masqué.** L'habitude bancaire est
 *   de n'en montrer que la fin ; ici c'est exactement l'inverse qu'il faut : ce
 *   qu'on demande au vendeur, c'est de RELIRE la destination avant que l'argent
 *   parte. Un numéro masqué ne se relit pas.
 *
 * - **Le nom du titulaire est obligatoire**, et affiché à côté du numéro. Chez
 *   la plupart des opérateurs, un transfert s'annonce sous le nom du titulaire :
 *   c'est le seul garde-fou contre deux chiffres inversés, qui donnent un numéro
 *   valide appartenant à quelqu'un d'autre.
 *
 * - **L'ajout et la modification vivent dans des `<details>` NATIFS.** Un
 *   formulaire replié par du JavaScript ne s'ouvrirait pas tant que
 *   l'hydratation n'a pas eu lieu — sur un téléphone d'entrée de gamme, cela
 *   dure (§70), et le vendeur conclurait que le bouton ne marche pas.
 *
 * - **`useFormStatus` vit dans un composant SÉPARÉ.** Appelé dans celui qui
 *   porte le `<form>`, il rend toujours `pending: false` : il n'écoute qu'un
 *   formulaire parent. Ce n'est pas un découpage esthétique.
 *
 * - **Supprimer se fait derrière le repli « Modifier ».** Un bouton de
 *   suppression posé à côté d'un numéro, sur un écran tactile, se touche par
 *   accident — et l'on ne retrouve pas un numéro effacé, on le retape.
 */

export interface CompteRetraitVue {
  id: string;
  phone: string;
  operator: string;
  holderName: string;
  label: string | null;
  isDefault: boolean;
}

function BoutonEnvoyer({ libelle }: { libelle: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-brand px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong disabled:opacity-50"
    >
      {pending ? "Enregistrement…" : libelle}
    </button>
  );
}

function BoutonSupprimer() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 px-4 text-sm font-semibold text-danger transition-colors hover:bg-red-50 disabled:opacity-50"
    >
      <Icone nom="fermer" className="h-4 w-4" />
      {pending ? "Suppression…" : "Supprimer ce numéro"}
    </button>
  );
}

/** Le formulaire d'ajout, ou de modification quand un compte est fourni. */
function FormulaireCompte({
  compte,
  operateurs,
  libelle,
}: {
  compte?: CompteRetraitVue;
  operateurs: readonly string[];
  libelle: string;
}) {
  const [etat, envoyer] = useActionState(enregistrerCompteRetraitAction, null);
  const id = useId();

  return (
    <form action={envoyer} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {compte && <input type="hidden" name="compteId" value={compte.id} />}

      {etat?.error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger sm:col-span-2"
        >
          {etat.error}
        </p>
      )}
      {etat?.success && etat.message && (
        <p
          role="status"
          className="rounded-xl border border-brand-border bg-brand-soft/60 px-4 py-3 text-sm text-brand sm:col-span-2"
        >
          {etat.message}
        </p>
      )}

      <div>
        <label
          htmlFor={`${id}-telephone`}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted"
        >
          Numéro Mobile Money
        </label>
        <input
          id={`${id}-telephone`}
          name="telephone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="+225 07 01 02 03 04"
          defaultValue={compte?.phone ?? ""}
          className="w-full rounded-xl border border-hairline bg-white px-4 py-3 text-sm focus:border-brand-border focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div>
        <label
          htmlFor={`${id}-operateur`}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted"
        >
          Opérateur
        </label>
        {/*
          * Une LISTE, pas un champ libre.
          *
          * Les opérateurs viennent de `data/markets.ts` — ceux que le prestataire
          * dessert dans le pays du vendeur. Un nom écrit à la main produirait un
          * versement qu'aucune application de transfert ne sait exécuter, et
          * l'administration ne le découvrirait qu'au moment d'envoyer.
          */}
        {operateurs.length > 0 ? (
          <select
            id={`${id}-operateur`}
            name="operateur"
            defaultValue={compte?.operator ?? ""}
            className="w-full rounded-xl border border-hairline bg-white px-4 py-3 text-sm focus:border-brand-border focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">Choisir…</option>
            {operateurs.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`${id}-operateur`}
            name="operateur"
            type="text"
            autoComplete="off"
            placeholder="Wave, Orange Money, MTN…"
            defaultValue={compte?.operator ?? ""}
            className="w-full rounded-xl border border-hairline bg-white px-4 py-3 text-sm focus:border-brand-border focus:outline-none focus:ring-2 focus:ring-brand"
          />
        )}
      </div>

      <div>
        <label
          htmlFor={`${id}-titulaire`}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted"
        >
          Nom du titulaire
        </label>
        <input
          id={`${id}-titulaire`}
          name="titulaire"
          type="text"
          autoComplete="off"
          placeholder="Le nom exact du compte Mobile Money"
          defaultValue={compte?.holderName ?? ""}
          className="w-full rounded-xl border border-hairline bg-white px-4 py-3 text-sm focus:border-brand-border focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <p className="mt-1 text-[11px] text-ink-muted">
          Tel qu&apos;il s&apos;affiche lors d&apos;un transfert : c&apos;est ce
          qui permet de vérifier avant d&apos;envoyer.
        </p>
      </div>

      <div>
        <label
          htmlFor={`${id}-surnom`}
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-muted"
        >
          Surnom <span className="font-normal normal-case">(facultatif)</span>
        </label>
        <input
          id={`${id}-surnom`}
          name="surnom"
          type="text"
          autoComplete="off"
          placeholder="Mon numéro Wave"
          defaultValue={compte?.label ?? ""}
          className="w-full rounded-xl border border-hairline bg-white px-4 py-3 text-sm focus:border-brand-border focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink sm:col-span-2">
        <input
          type="checkbox"
          name="parDefaut"
          defaultChecked={compte?.isDefault ?? false}
          className="h-4 w-4 rounded border-hairline text-brand focus:ring-brand"
        />
        Proposer ce numéro en premier lors d&apos;un retrait
      </label>

      <div className="sm:col-span-2">
        <BoutonEnvoyer libelle={libelle} />
      </div>
    </form>
  );
}

/** Une ligne de la liste : ce qu'on voit, et ce qu'on peut en faire. */
function LigneCompte({
  compte,
  operateurs,
}: {
  compte: CompteRetraitVue;
  operateurs: readonly string[];
}) {
  const [etatSuppression, supprimer] = useActionState(
    supprimerCompteRetraitAction,
    null
  );

  return (
    <li
      data-compte-retrait={compte.id}
      data-defaut={compte.isDefault ? "oui" : "non"}
      className="rounded-2xl border border-hairline bg-white p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold text-ink [overflow-wrap:anywhere]">
            {compte.phone}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted [overflow-wrap:anywhere]">
            {compte.holderName} · {compte.operator}
            {compte.label ? ` · « ${compte.label} »` : ""}
          </p>
        </div>
        {compte.isDefault && (
          <span className="shrink-0 rounded-full bg-brand-soft px-3 py-1 text-[11px] font-semibold text-brand">
            Proposé en premier
          </span>
        )}
      </div>

      {etatSuppression?.error && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger"
        >
          {etatSuppression.error}
        </p>
      )}

      <details className="group mt-3">
        <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-brand">
          <Icone nom="crayon" className="h-4 w-4" />
          Modifier
        </summary>

        <FormulaireCompte
          compte={compte}
          operateurs={operateurs}
          libelle="Enregistrer les modifications"
        />

        <form action={supprimer} className="mt-4 border-t border-hairline pt-4">
          <input type="hidden" name="compteId" value={compte.id} />
          <BoutonSupprimer />
          {/* Un versement DÉJÀ demandé garde sa destination : `Payout` recopie
              le numéro à la demande. Le dire évite la crainte inverse — qu'on
              croie annuler un versement en retirant un numéro. */}
          <p className="mt-2 text-[11px] text-ink-muted">
            Les versements déjà demandés ne changent pas : leur destination est
            figée au moment de la demande.
          </p>
        </form>
      </details>
    </li>
  );
}

export function ComptesRetrait({
  comptes,
  operateurs,
}: {
  comptes: CompteRetraitVue[];
  operateurs: readonly string[];
}) {
  const complet = comptes.length >= COMPTES_RETRAIT_MAX;

  return (
    <section
      id="numeros-de-retrait"
      data-comptes-retrait=""
      className="rounded-3xl border border-hairline bg-white p-6"
    >
      <h2 className="font-titre text-lg font-bold text-heading">
        Mes numéros de retrait
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Enregistrez-les une fois. À chaque retrait, vous n&apos;aurez plus
        qu&apos;à choisir celui qui doit recevoir l&apos;argent.
      </p>

      {comptes.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-brand-border bg-brand-soft/50 px-4 py-3 text-sm text-brand">
          Aucun numéro enregistré. Ajoutez-en un ci-dessous : il vous sera
          proposé à chaque demande de retrait.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {comptes.map((c) => (
            <LigneCompte key={c.id} compte={c} operateurs={operateurs} />
          ))}
        </ul>
      )}

      {complet ? (
        <p className="mt-4 text-sm text-ink-muted">
          Vous avez atteint {COMPTES_RETRAIT_MAX} numéros. Supprimez-en un pour
          en ajouter un autre.
        </p>
      ) : (
        <details className="mt-4">
          <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-brand">
            <Icone nom="plus" className="h-4 w-4" />
            Ajouter un numéro
          </summary>
          <FormulaireCompte operateurs={operateurs} libelle="Enregistrer ce numéro" />
        </details>
      )}
    </section>
  );
}
