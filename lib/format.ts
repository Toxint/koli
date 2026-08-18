// Formate un montant en francs CFA avec un espace comme séparateur de
// milliers, ex. : formatCFA(18500) → "18 500 FCFA".
export function formatCFA(amount: number): string {
  const rounded = Math.round(amount).toString();
  const withSpaces = rounded.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${withSpaces} FCFA`;
}

// Validation simple : un numéro local contient entre 8 et 10 chiffres,
// avec ou sans espaces.
export function isValidLocalPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 10;
}
