"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";

export interface GroupeFiltre {
  /** Nom du paramètre d'URL porté par ce filtre. */
  cle: string;
  /** Libellé accessible du sélecteur (lu par les lecteurs d'écran). */
  libelle: string;
  /** Texte de l'option « pas de filtre ». */
  libelleTous: string;
  options: { valeur: string; libelle: string }[];
}

/**
 * Recherche et filtres (§46).
 *
 * L'etat vit dans l'URL plutot que dans le composant : la recherche devient
 * partageable, revient intacte apres un rafraichissement, et le filtrage
 * s'effectue en base — pas sur une liste deja chargee en entier.
 *
 * Les filtres sont decrits explicitement (cle d'URL + libelle) plutot que
 * figes sur « statut » : la page des utilisateurs filtre par ROLE, et
 * l'etiquette « Tous les statuts » y designait la mauvaise notion.
 */
export function BarreRecherche({
  placeholder = "Rechercher…",
  filtres = [],
}: {
  placeholder?: string;
  filtres?: GroupeFiltre[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [terme, setTerme] = useState(params.get("q") ?? "");

  const appliquer = (cle: string, valeur: string) => {
    const suivants = new URLSearchParams(params.toString());
    if (valeur) suivants.set(cle, valeur);
    else suivants.delete(cle);
    // Toute nouvelle recherche repart de la premiere page.
    suivants.delete("page");
    router.push(`${pathname}?${suivants.toString()}`);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        appliquer("q", terme.trim());
      }}
      className="flex flex-col sm:flex-row flex-wrap gap-2"
      role="search"
    >
      <label htmlFor="recherche" className="sr-only">
        {placeholder}
      </label>
      <input
        id="recherche"
        type="search"
        value={terme}
        onChange={(e) => setTerme(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 sm:min-w-[12rem] min-h-[48px] px-4 rounded-xl border border-hairline bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand"
      />

      {filtres.map((groupe) => (
        <div key={groupe.cle} className="contents">
          <label htmlFor={`filtre-${groupe.cle}`} className="sr-only">
            {groupe.libelle}
          </label>
          {/* `min-w-0` : un <select> reclame sinon la largeur de sa plus longue
              option et fait deborder la page sur un petit ecran. */}
          <select
            id={`filtre-${groupe.cle}`}
            defaultValue={params.get(groupe.cle) ?? ""}
            onChange={(e) => appliquer(groupe.cle, e.target.value)}
            className="min-w-0 min-h-[48px] px-3 rounded-xl border border-hairline bg-white text-sm"
          >
            <option value="">{groupe.libelleTous}</option>
            {groupe.options.map((o) => (
              <option key={o.valeur} value={o.valeur}>
                {o.libelle}
              </option>
            ))}
          </select>
        </div>
      ))}

      <button
        type="submit"
        className="min-h-[48px] px-5 rounded-xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm transition-colors"
      >
        Rechercher
      </button>
    </form>
  );
}
