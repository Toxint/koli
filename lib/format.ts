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

// Validation simple : un numéro local contient entre 8 et 10 chiffres,
// avec ou sans espaces.
export function isValidLocalPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 10;
}
