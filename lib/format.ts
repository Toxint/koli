// Espace fine insécable (U+202F) comme séparateur de milliers, et espace
// insécable (U+00A0) avant l'unité.
//
// Avec des espaces ordinaires, « 1 250 000 FCFA » se coupait en fin de ligne
// sur les écrans étroits et s'affichait sur deux ou trois lignes — un montant
// tronçonné est illisible, et sur mobile la ligne est presque toujours étroite.
const SEPARATEUR_MILLIERS = " ";
const ESPACE_INSECABLE = " ";

// ex. : formatCFA(18500) → "18 500 FCFA" (insécable).
export function formatCFA(amount: number): string {
  const rounded = Math.round(amount).toString();
  const withSpaces = rounded.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    SEPARATEUR_MILLIERS
  );
  return `${withSpaces}${ESPACE_INSECABLE}FCFA`;
}

/**
 * Accord en nombre.
 *
 * L'application affichait partout « 1 vendeur(s) », « 1 commande(s) ». La
 * parenthèse est une facilité de développeur qui se lit mal dans un produit
 * destiné à des commerçants : on écrit le mot au bon nombre.
 *
 * Le français ne met la marque du pluriel qu'à partir de 2 — « 0 commande »
 * s'écrit au singulier, contrairement à l'anglais.
 *
 * ex. : pluriel(1, "vendeur") → "1 vendeur"
 *       pluriel(3, "commande", "commandes") → "3 commandes"
 */
export function pluriel(
  nombre: number,
  singulier: string,
  plurielForme?: string
): string {
  const mot =
    nombre >= 2 ? (plurielForme ?? `${singulier}s`) : singulier;
  return `${nombre} ${mot}`;
}

// Validation simple : un numéro local contient entre 8 et 10 chiffres,
// avec ou sans espaces.
export function isValidLocalPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 10;
}
