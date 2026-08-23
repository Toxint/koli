import type { Prisma } from "@prisma/client";

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

/** Rang porté par un numéro, ou 0 si la chaîne n'en est pas un. */
export function rangDuNumero(numero: string): number {
  if (!estNumeroFacture(numero)) return 0;
  return Number(numero.slice(-6));
}

/**
 * Rang suivant pour une année, déduit du PLUS GRAND numéro existant.
 *
 * Il était auparavant déduit du NOMBRE de factures de l'année (`count + 1`).
 * C'est juste tant que rien ne disparaît — mais `Invoice` est en
 * `onDelete: Cascade` depuis `Order` : supprimer une commande supprime sa
 * facture, le compte redescend, et la facture suivante réutilise un numéro
 * déjà attribué. La contrainte d'unicité l'aurait alors rejetée, faisant
 * échouer un paiement pourtant valide.
 *
 * En comptabilité, un trou dans la numérotation se constate et s'explique ;
 * un doublon, lui, invalide le registre. Partir du maximum ne peut produire
 * qu'un trou.
 *
 * Le tri est fait par la base sur la chaîne : le format à six chiffres
 * complétés par des zéros rend l'ordre alphabétique identique à l'ordre
 * numérique (`000009` < `000010`), ce qui ne serait pas vrai sans le
 * remplissage.
 */
export async function rangSuivant(
  client: Prisma.TransactionClient,
  annee: number
): Promise<number> {
  const dernier = await client.invoice.findFirst({
    where: { number: { startsWith: prefixeAnnee(annee) } },
    orderBy: { number: "desc" },
    select: { number: true },
  });

  return dernier === null ? 1 : rangDuNumero(dernier.number) + 1;
}
