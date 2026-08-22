/**
 * Numérotation des factures (§38).
 *
 * Contrairement à la référence de commande — non devinable, parce qu'elle fait
 * office de capacité d'accès (voir `lib/orders/reference.ts`) — un numéro de
 * facture doit être **séquentiel et sans trou** : c'est ce qu'attend toute
 * comptabilité, et c'est ce qui permet de constater qu'aucune pièce ne manque.
 *
 * Il ne divulgue rien : la facture ne s'atteint que par la référence de la
 * commande, jamais par son numéro.
 *
 * Format : FAC-2026-000001, remis à zéro chaque année.
 */
export const PREFIXE_FACTURE = "FAC";

export function formaterNumeroFacture(annee: number, rang: number): string {
  return `${PREFIXE_FACTURE}-${annee}-${String(rang).padStart(6, "0")}`;
}

/** Motif reconnu, utilisé pour retrouver les factures d'une année. */
export function prefixeAnnee(annee: number): string {
  return `${PREFIXE_FACTURE}-${annee}-`;
}

export function estNumeroFacture(valeur: string): boolean {
  return new RegExp(`^${PREFIXE_FACTURE}-\\d{4}-\\d{6}$`).test(valeur);
}
