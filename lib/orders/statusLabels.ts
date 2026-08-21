import { OrderStatus } from "@prisma/client";

/**
 * Libelles francais des statuts de commande.
 *
 * L'interface affichait jusqu'ici la valeur brute de l'enum (« FUNDS_SECURED »)
 * dans une interface entierement francaise. Le §65 impose des messages
 * comprehensibles, et le statut est precisement l'information que le client
 * vient chercher.
 *
 * `ton` pilote la couleur du badge : neutre / en cours / succes / alerte.
 */
export type TonStatut = "neutre" | "encours" | "succes" | "alerte";

interface LibelleStatut {
  libelle: string;
  ton: TonStatut;
}

const LIBELLES: Record<OrderStatus, LibelleStatut> = {
  DRAFT: { libelle: "Brouillon", ton: "neutre" },
  PAYMENT_PENDING: { libelle: "En attente de paiement", ton: "encours" },
  PAYMENT_CONFIRMED: { libelle: "Paiement confirmé", ton: "encours" },
  FUNDS_SECURED: { libelle: "Paiement sécurisé", ton: "succes" },
  SELLER_ACCEPTED: { libelle: "Acceptée par le vendeur", ton: "encours" },
  PACKAGE_PREPARING: { libelle: "Colis en préparation", ton: "encours" },
  READY_FOR_PICKUP: { libelle: "Prête pour enlèvement", ton: "encours" },
  PICKED_UP: { libelle: "Colis récupéré", ton: "encours" },
  IN_TRANSIT: { libelle: "En cours de livraison", ton: "encours" },
  ARRIVED: { libelle: "Livreur arrivé", ton: "encours" },
  DELIVERED: { libelle: "Livrée — à confirmer", ton: "encours" },
  CUSTOMER_CONFIRMED: { libelle: "Réception confirmée", ton: "succes" },
  FUNDS_RELEASED: { libelle: "Fonds versés au vendeur", ton: "succes" },
  COMPLETED: { libelle: "Terminée", ton: "succes" },

  CANCELLED: { libelle: "Annulée", ton: "alerte" },
  PAYMENT_FAILED: { libelle: "Paiement échoué", ton: "alerte" },
  DELIVERY_FAILED: { libelle: "Livraison échouée", ton: "alerte" },
  DISPUTE_OPEN: { libelle: "Litige ouvert", ton: "alerte" },
  REFUND_PENDING: { libelle: "Remboursement en cours", ton: "alerte" },
  REFUNDED: { libelle: "Remboursée", ton: "neutre" },
  RETURN_REQUESTED: { libelle: "Retour demandé", ton: "alerte" },
  RETURNED: { libelle: "Retournée", ton: "neutre" },
};

export function libelleStatut(statut: OrderStatus | string): string {
  return LIBELLES[statut as OrderStatus]?.libelle ?? String(statut);
}

export function tonStatut(statut: OrderStatus | string): TonStatut {
  return LIBELLES[statut as OrderStatus]?.ton ?? "neutre";
}

/**
 * Classes Tailwind du badge, contrastes conformes (§69).
 *
 * Les teintes restent SÉMANTIQUES et non décoratives : vert pour ce qui est
 * acquis, ambre pour ce qui est en cours, rouge pour ce qui alerte. Les
 * aligner sur le bordeaux de la marque supprimerait l'information que porte
 * la couleur. Seul le ton neutre est réchauffé, un gris bleuté jurant sur la
 * crème.
 */
export function classesBadgeStatut(statut: OrderStatus | string): string {
  switch (tonStatut(statut)) {
    case "succes":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300";
    case "alerte":
      return "bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300";
    case "encours":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300";
    default:
      return "bg-hairline text-ink-muted dark:bg-slate-800 dark:text-slate-300";
  }
}
