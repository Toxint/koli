import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Commission KOLI (§41) — la seule recette de la plateforme.
 *
 * Trois décisions structurent ce fichier. Elles sont écrites ici parce qu'elles
 * ne se devinent pas à la lecture du code.
 *
 * **1. Le taux n'est jamais codé en dur.** §41 l'exige : l'administrateur le
 * règle depuis la console. Il vit dans la table `Commission`, une ligne par
 * valeur successive, la plus récente active faisant foi. Changer de taux crée
 * une ligne, n'en modifie aucune : l'historique reste lisible.
 *
 * **2. La commission est prélevée à la LIBÉRATION des fonds, pas au paiement.**
 * C'est le point le moins évident, et le plus important. KOLI promet au client
 * que son argent est retenu jusqu'à ce qu'il confirme avoir reçu son colis. Une
 * commande peut donc finir remboursée. Prélever au paiement obligerait alors à
 * rendre la commission — un mouvement inverse, dans un sens puis dans l'autre,
 * pour un service qui n'a finalement pas été rendu. Prélever à la libération
 * fait disparaître le problème : KOLI ne se rémunère que sur l'argent qui
 * arrive réellement au vendeur.
 *
 * **3. L'assiette exclut les frais de livraison.** `Fund.amount` est ce qui
 * revient au vendeur ; `Payment.amount` y ajoute la livraison. Prélever sur le
 * second reviendrait à prendre une part de l'argent du transport, qui n'est pas
 * le chiffre d'affaires du vendeur. Le §40 illustre son exemple sur un montant
 * unique, sans frais de livraison distincts : les deux lectures s'y confondent.
 */

/** Aucune commission configurée : la plateforme ne prélève rien. */
export const AUCUN_TAUX = 0;

export interface Prelevement {
  /** Montant prélevé, positif. 0 si aucun taux actif. */
  montant: number;
  /** Taux effectivement appliqué, figé pour l'écriture comptable. */
  taux: number;
}

/**
 * Arrondi à l'entier INFÉRIEUR.
 *
 * Le franc CFA n'a pas de subdivision en circulation : une écriture de
 * 1 234,56 FCFA n'a pas de sens. Arrondir vers le bas plutôt qu'au plus proche
 * est un choix délibéré — en cas de doute, l'écart d'un franc reste chez le
 * vendeur, et KOLI ne prélève jamais plus que le taux annoncé.
 */
export function calculerCommission(assiette: number, taux: number): number {
  if (!Number.isFinite(taux) || taux <= 0) return 0;
  if (!Number.isFinite(assiette) || assiette <= 0) return 0;
  return Math.floor((assiette * taux) / 100);
}

/**
 * Taux actif, ou {@link AUCUN_TAUX}.
 *
 * `orderBy createdAt desc` : si plusieurs lignes restaient actives — reprise de
 * données, incident — la plus récente l'emporte, plutôt qu'une ligne arbitraire.
 */
export async function tauxCommissionActif(
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<number> {
  const active = await client.commission.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    select: { ratePercent: true },
  });

  const taux = active?.ratePercent ?? AUCUN_TAUX;
  // Une valeur aberrante en base ne doit pas produire une commission absurde.
  return Number.isFinite(taux) && taux > 0 && taux <= 100 ? taux : AUCUN_TAUX;
}

/**
 * Inscrit la commission au journal, dans la transaction de libération.
 *
 * À appeler depuis TOUTE libération de fonds — il en existe deux : la
 * confirmation de réception par le client (§29) et un litige tranché en faveur
 * du vendeur (§32). En oublier une ne casserait rien de visible : la plateforme
 * cesserait simplement de se rémunérer sur ces commandes-là, sans un mot.
 *
 * Rien n'est écrit quand le montant est nul : une ligne à 0 FCFA encombre le
 * journal sans rien apprendre.
 */
export async function preleverCommission(
  tx: Prisma.TransactionClient,
  { orderId, assiette }: { orderId: string; assiette: number }
): Promise<Prelevement> {
  const taux = await tauxCommissionActif(tx);
  const montant = calculerCommission(assiette, taux);

  if (montant <= 0) return { montant: 0, taux };

  await tx.transaction.create({
    data: {
      orderId,
      type: "COMMISSION",
      // Signe négatif : c'est un débit du point de vue du vendeur. La
      // convention de `Transaction.amount` est « + crédit / − débit ».
      amount: -montant,
      rate: taux,
    },
  });

  return { montant, taux };
}
