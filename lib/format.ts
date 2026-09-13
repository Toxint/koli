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

/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  `formatCFA` A ÉTÉ SUPPRIMÉE. Ne pas la remettre.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Elle valait `formatMontant(amount, "XOF")` — le franc CFA écrit en dur — et
 * portait déjà cet avertissement, mot pour mot :
 *
 *   « L'appeler par commodité sur un montant dont on ignore la devise, c'est
 *     réintroduire exactement le défaut qu'on vient de retirer. »
 *
 * Elle a été appelée **vingt et une fois**, dont dans un message envoyé par
 * WhatsApp au client, sur la page d'un litige vue par les deux parties, et
 * dans l'écran où un administrateur valide un remboursement. Un commerçant de
 * Kinshasa y lisait des francs CFA — environ quatre fois la somme réelle.
 *
 * **Le commentaire n'a rien empêché ; l'absence de la fonction, si.** C'est la
 * même leçon que `deviseDuVendeur` prenant le profil plutôt que le pays : quand
 * une règle doit tenir dans vingt endroits, on ne la confie pas à la mémoire de
 * celui qui écrit le vingt-et-unième — on la confie au compilateur.
 *
 * Un montant appartient toujours à quelque chose qui porte sa monnaie : une
 * commande (`order.currency`), une écriture (`transaction.currency`), un
 * vendeur (`deviseDuVendeur`). Et quand plusieurs monnaies se côtoient, c'est
 * `formatTotaux` qui les JUXTAPOSE — leur somme n'existe pas.
 */

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

/**
 * Un total qui peut porter PLUSIEURS monnaies.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  250 000 francs CFA et 1 200 000 francs congolais ne font pas            │
 * │  1 450 000 de quoi que ce soit.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le problème n'existait pas tant que KOLI ne desservait que la zone franc :
 * XOF et XAF sont arrimés à l'euro au même taux, donc additionnables sans y
 * penser. Avec dix-sept marchés et douze monnaies, un écran qui agrège
 * plusieurs vendeurs — l'administration — ou plusieurs vendeurs pour un même
 * acheteur — les factures d'un client — additionne des choses différentes.
 *
 * On les JUXTAPOSE au lieu de les additionner. C'est moins joli qu'un chiffre
 * unique, et c'est la seule chose vraie : « 250 000 FCFA · 1 200 000 FC ».
 *
 * Convertir vers une monnaie de référence serait l'autre option. Elle est
 * écartée ici : le taux bouge, un total affiché aujourd'hui ne vaudrait plus
 * demain, et un registre financier dont les totaux changent tout seuls
 * n'est pas un registre.
 *
 * Rend `null` quand il n'y a rien — l'appelant décide alors quoi dire, plutôt
 * que de recevoir un « 0 » dans une monnaie qu'on aurait choisie pour lui.
 */
export function formatTotaux(
  totaux: Partial<Record<Devise, number>>
): string | null {
  const entrees = (Object.entries(totaux) as [Devise, number][])
    .filter(([, montant]) => montant !== 0)
    // Ordre stable : deux affichages successifs ne doivent pas permuter les
    // monnaies, sans quoi l'œil croit voir un changement de chiffre.
    .sort(([a], [b]) => a.localeCompare(b));

  if (entrees.length === 0) return null;

  return entrees.map(([devise, montant]) => formatMontant(montant, devise)).join(" · ");
}
