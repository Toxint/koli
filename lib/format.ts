import { SYMBOLE, type Devise } from "@/data/markets";

// Espace fine insécable (U+202F) comme séparateur de milliers, et espace
// insécable (U+00A0) avant l'unité.
//
// Avec des espaces ordinaires, « 1 250 000 FCFA » se coupait en fin de ligne
// sur les écrans étroits et s'affichait sur deux ou trois lignes — un montant
// tronçonné est illisible, et sur mobile la ligne est presque toujours étroite.
const SEPARATEUR_MILLIERS = " ";
const ESPACE_INSECABLE = " ";

/**
 * Un montant, avec sa devise.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  « FCFA » était écrit en dur ici, et dans une trentaine d'écrans.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * C'était sans conséquence tant que KOLI ne desservait que sept pays, tous en
 * franc CFA : XOF et XAF sont arrimés à l'euro au même taux, donc identiques
 * au centime près. La couverture d'iKeePay en compte dix-sept, dont la RDC —
 * où un franc CFA vaut environ quatre francs congolais.
 *
 * Un montant congolais affiché « 796 FCFA » ne serait pas une imprécision :
 * ce serait un chiffre faux d'un facteur quatre, sur l'écran même où quelqu'un
 * décide de payer.
 *
 * ex. : formatMontant(18500, "XOF") → "18 500 FCFA"
 *       formatMontant(18500, "CDF") → "18 500 FC"
 */
export function formatMontant(amount: number, devise: Devise): string {
  const rounded = Math.round(amount).toString();
  const withSpaces = rounded.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    SEPARATEUR_MILLIERS
  );
  return `${withSpaces}${ESPACE_INSECABLE}${SYMBOLE[devise]}`;
}

/**
 * Le franc CFA, quand la devise est CONNUE pour être celle-là.
 *
 * Conservé pour les écrans dont les montants ne peuvent être qu'en CFA — les
 * réglages de la plateforme, par exemple. Partout où un montant appartient à
 * une commande ou à un vendeur, c'est `formatMontant` qu'il faut, avec la
 * devise de cette commande ou de ce vendeur.
 *
 * ⚠ L'appeler par commodité sur un montant dont on ignore la devise, c'est
 * réintroduire exactement le défaut qu'on vient de retirer.
 */
export function formatCFA(amount: number): string {
  return formatMontant(amount, "XOF");
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
