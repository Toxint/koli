import Link from "next/link";
import type { ReactNode } from "react";
import { Icone, type NomIcone } from "@/components/ui/Icone";

/**
 * La coquille des ÉCRANS DE LISTE — commandes, catalogue, clients, factures.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Un titre avec son décompte, une barre d'actions, un tableau dense, et   │
 * │  une pagination numérotée. C'est l'anatomie de la maquette de référence. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Elle existe parce que ces quatre écrans se ressemblaient sans être pareils :
 * chacun avait sa propre idée de l'espacement, de la casse des en-têtes et de
 * la place du décompte. Une liste qui change de forme d'un onglet à l'autre
 * donne l'impression de quatre applications collées.
 *
 * ── Ce qui reste au SERVEUR, et pourquoi ────────────────────────────────────
 *
 * Tout. Le tri passe par l'adresse, la pagination par des liens. Rien ici
 * n'attend le JavaScript : sur un terminal d'entrée de gamme et un réseau
 * lent (§70), une liste qu'on ne peut ni trier ni parcourir avant hydratation
 * est une liste qu'on ne peut pas utiliser.
 */

/**
 * L'en-tête d'un écran de liste : le titre, son décompte, et les actions.
 *
 * Le décompte est DANS le titre — « Commandes (120) » — et non relégué en
 * dessous. C'est la première question qu'on se pose devant une liste, et la
 * réponse doit tenir dans le même coup d'œil que son nom.
 */
export function EnTeteListe({
  titre,
  nombre,
  actions,
}: {
  titre: string;
  /** Omis quand le total n'est pas connu — mieux vaut rien qu'un zéro faux. */
  nombre?: number;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-titre text-2xl font-extrabold tracking-tight text-heading">
        {titre}
        {nombre !== undefined && (
          <span className="ml-1 font-normal text-ink-muted">({nombre})</span>
        )}
      </h1>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Un bouton d'action de liste — « Trier », « Filtrer », « Importer ».
 *
 * `principal` en réserve UN seul par écran : celui qui crée. Deux boutons
 * pleins côte à côte ne hiérarchisent plus rien, et c'est précisément le rôle
 * d'un bouton plein que de dire « c'est par ici qu'on commence ».
 */
export function ActionListe({
  href,
  icone,
  children,
  principal = false,
}: {
  href: string;
  icone?: NomIcone;
  children: ReactNode;
  principal?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold transition-colors ${
        principal
          ? "bg-brand text-white shadow-sm hover:bg-brand-strong"
          : "border border-hairline bg-white text-ink-muted hover:border-brand-border hover:text-brand"
      }`}
    >
      {icone && <Icone nom={icone} className="h-4 w-4 shrink-0" />}
      {children}
    </Link>
  );
}

/**
 * La carte blanche qui porte le tableau, et sa pagination.
 *
 * ⚠ **Le tableau défile DANS cette carte, jamais la page.** Huit colonnes ne
 * tiennent pas dans 320 px, et le §8 interdit le défilement horizontal du
 * document. `overflow-x-auto` enferme le débordement ici — c'est la même règle
 * que pour les bandeaux défilants et le ruban de navigation.
 *
 * On garde UN seul rendu, et non un tableau pour les grands écrans doublé de
 * cartes pour les petits : deux rendus des mêmes données finissent toujours
 * par diverger, et c'est celui qu'on regarde le moins qui ment en premier.
 */
export function CarteListe({
  children,
  pagination,
}: {
  children: ReactNode;
  pagination?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-white shadow-sm">
      <div className="overflow-x-auto">{children}</div>
      {pagination}
    </div>
  );
}

/** L'en-tête d'un tableau : petites capitales grises sur fond très clair. */
export function EnTeteTableau({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-hairline bg-brand-soft/30">
      <tr>{children}</tr>
    </thead>
  );
}

/**
 * Une colonne, triable ou non.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Le tri passe par l'ADRESSE, pas par un état React.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Trois conséquences, et les trois comptent : il fonctionne sans JavaScript,
 * il survit à un rechargement, et il se partage — un vendeur peut envoyer
 * « regarde, triées par montant » à quelqu'un d'autre. Un tri gardé en mémoire
 * ne fait aucun des trois.
 *
 * ⚠ Le sens s'inverse au second clic, et la flèche le DIT. Une flèche qui ne
 * change pas laisse croire que le clic n'a rien fait.
 */
export function Colonne({
  children,
  cle,
  tri,
  sens,
  chemin,
  parametres = {},
  aDroite = false,
}: {
  children: ReactNode;
  /** Renseignée ⇒ la colonne est triable. */
  cle?: string;
  /** La colonne actuellement triée. */
  tri?: string;
  sens?: "asc" | "desc";
  chemin?: string;
  parametres?: Record<string, string | undefined>;
  aDroite?: boolean;
}) {
  /* `py-2` et non `py-3` : le lien de tri porte lui-même ses 44 px de cible
     tactile, et l'ancien remplissage les aurait empilés — un en-tête de 68 px
     au-dessus de lignes de 56. */
  const classe = `whitespace-nowrap px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted ${
    aDroite ? "text-right" : "text-left"
  }`;

  if (!cle || !chemin) {
    return (
      <th scope="col" className={classe}>
        {children}
      </th>
    );
  }

  const actif = tri === cle;
  const prochain = actif && sens === "asc" ? "desc" : "asc";

  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(parametres)) if (v) p.set(k, v);
  p.set("tri", cle);
  p.set("sens", prochain);

  return (
    <th
      scope="col"
      className={classe}
      aria-sort={actif ? (sens === "desc" ? "descending" : "ascending") : "none"}
    >
      {/*
        * ⚠ `relative` et `min-h-[44px]` ne sont NI l'un ni l'autre cosmétiques.
        *
        * ┌──────────────────────────────────────────────────────────────────┐
        * │  `relative` — parce que le `sr-only` ci-dessous est en           │
        * │  `position: absolute`. Sans ancêtre positionné, son bloc         │
        * │  conteneur est la PAGE : il se plaçait à l'abscisse de sa        │
        * │  colonne, très au-delà de l'écran, et échappait à                │
        * │  l'`overflow-x-auto` de la carte.                                │
        * └──────────────────────────────────────────────────────────────────┘
        *
        * Mesuré : `body.scrollWidth` valait 320, et
        * `documentElement.scrollWidth` **867**. Le tableau était donc
        * parfaitement contenu, et la page défilait quand même — à cause d'un
        * texte d'un pixel destiné aux lecteurs d'écran. Le §8 interdit ce
        * défilement, et rien ne désignait le coupable.
        *
        * `min-h-[44px]` — c'est un lien, donc une cible tactile (§74). Il
        * faisait 17 px de haut : `verif:responsive` l'a refusé sur les trois
        * tailles de téléphone.
        */}
      <Link
        href={`${chemin}?${p.toString()}`}
        className={`relative inline-flex min-h-[44px] items-center gap-1 transition-colors hover:text-brand ${
          actif ? "text-brand" : ""
        }`}
      >
        {children}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 shrink-0 ${actif ? "" : "opacity-40"}`}
        >
          {actif && sens === "desc" ? (
            <path d="M12 5v14M5 12l7 7 7-7" />
          ) : actif ? (
            <path d="M12 19V5M5 12l7-7 7 7" />
          ) : (
            <path d="M7 9l3-3 3 3M7 15l3 3 3-3" />
          )}
        </svg>
        <span className="sr-only">
          {actif
            ? sens === "desc"
              ? " — trié du plus grand au plus petit, cliquer pour inverser"
              : " — trié du plus petit au plus grand, cliquer pour inverser"
            : " — cliquer pour trier"}
        </span>
      </Link>
    </th>
  );
}

/** Une ligne de tableau, avec son survol. */
export function LigneTableau({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b border-hairline/70 transition-colors last:border-0 hover:bg-brand-soft/25">
      {children}
    </tr>
  );
}

/** Une cellule ordinaire. `aDroite` pour les montants : les chiffres s'alignent. */
export function Cellule({
  children,
  aDroite = false,
  className = "",
}: {
  children: ReactNode;
  aDroite?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`whitespace-nowrap px-4 py-3 text-sm ${
        aDroite ? "text-right tabular-nums" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}

/**
 * La pastille d'un statut.
 *
 * Les couleurs viennent de `classesBadgeStatut` : une seule source, pour que
 * le même statut ait la même teinte dans une liste, sur une facture et dans un
 * courriel. Deux verts différents pour « terminée » suffisent à faire douter.
 */
export function Pastille({
  children,
  classes,
}: {
  children: ReactNode;
  classes: string;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes}`}
    >
      {children}
    </span>
  );
}

/**
 * Ce qu'on affiche quand la liste est VIDE.
 *
 * Jamais un tableau sans lignes : une grille de colonnes sous laquelle il n'y
 * a rien ne dit pas « vous n'avez pas encore de commande », elle dit « quelque
 * chose s'est mal passé ». On explique, et on propose le premier geste.
 */
export function ListeVide({
  titre,
  explication,
  action,
}: {
  titre: string;
  explication: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-titre text-base font-bold text-heading">{titre}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{explication}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
