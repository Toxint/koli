import type { PointJour } from "@/lib/finance/courbes";

/**
 * Met une série quotidienne en forme pour l'affichage.
 *
 * Fait ici, côté serveur, et non dans le composant : la mise en forme des
 * dates dépend de la locale, et une date rendue par le serveur puis reformatée
 * par le navigateur produit deux textes différents pour la même donnée — React
 * signale alors un désaccord d'hydratation, et l'écran clignote.
 */
export interface PointAffiche {
  etiquette: string;
  etiquetteLongue: string;
  valeur: number;
}

const COURTE = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
});

const LONGUE = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function mettreEnForme(points: PointJour[]): PointAffiche[] {
  return points.map((p) => ({
    etiquette: COURTE.format(p.jour),
    etiquetteLongue: LONGUE.format(p.jour),
    valeur: p.montant,
  }));
}
