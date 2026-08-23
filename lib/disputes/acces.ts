import type { User, SellerProfile, CustomerProfile } from "@prisma/client";

/**
 * Qui a le droit de voir et d'alimenter un litige.
 *
 * Trois parties, et trois seulement : le client qui l'ouvre, le vendeur qu'il
 * met en cause, et l'administration qui tranche. Le litige contient les
 * coordonnées de l'acheteur et le détail du différend — contrairement au lien
 * de paiement, il ne s'ouvre donc PAS sur simple possession de la référence.
 *
 * Fonction pure, hors « use server » : elle est appelée aussi bien par les
 * actions que par le rendu des pages.
 */
export type RoleDansLitige = "client" | "vendeur" | "admin" | null;

export interface UtilisateurAvecProfils extends User {
  sellerProfile: SellerProfile | null;
  customerProfile: CustomerProfile | null;
}

export function roleDansLitige(
  utilisateur: UtilisateurAvecProfils | null,
  commande: { sellerId: string; customerId: string | null; buyerPhone: string }
): RoleDansLitige {
  if (!utilisateur) return null;

  if (utilisateur.role === "ADMIN") return "admin";

  if (
    utilisateur.sellerProfile &&
    utilisateur.sellerProfile.id === commande.sellerId
  ) {
    return "vendeur";
  }

  // Le client rattaché, ou l'acheteur en mode invité qui revendique la
  // commande par son numéro — c'est ce numéro qui l'identifie (§27).
  const estLeClient =
    utilisateur.customerProfile != null &&
    ((commande.customerId !== null &&
      utilisateur.customerProfile.id === commande.customerId) ||
      (commande.customerId === null &&
        utilisateur.phone === commande.buyerPhone));

  return estLeClient ? "client" : null;
}
