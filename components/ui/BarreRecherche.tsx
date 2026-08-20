"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";

/**
 * Recherche et filtre par statut (§46).
 *
 * L'etat vit dans l'URL plutot que dans le composant : la recherche devient
 * partageable, revient intacte apres un rafraichissement, et le filtrage
 * s'effectue en base — pas sur une liste deja chargee en entier.
 */
export function BarreRecherche({
  placeholder = "Rechercher…",
  filtres,
}: {
  placeholder?: string;
  /** Options du filtre secondaire, si la page en a un. */
  filtres?: { valeur: string; libelle: string }[];
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
      className="flex flex-col sm:flex-row gap-2"
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
        className="flex-1 min-h-[48px] px-4 rounded-xl border border-hairline bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand"
      />

      {filtres && (
        <>
          <label htmlFor="filtre-statut" className="sr-only">
            Filtrer par statut
          </label>
          <select
            id="filtre-statut"
            defaultValue={params.get("statut") ?? ""}
            onChange={(e) => appliquer("statut", e.target.value)}
            className="min-h-[48px] px-3 rounded-xl border border-hairline bg-white text-sm"
          >
            <option value="">Tous les statuts</option>
            {filtres.map((f) => (
              <option key={f.valeur} value={f.valeur}>
                {f.libelle}
              </option>
            ))}
          </select>
        </>
      )}

      <button
        type="submit"
        className="min-h-[48px] px-5 rounded-xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm transition-colors"
      >
        Rechercher
      </button>
    </form>
  );
}
