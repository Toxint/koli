import type { NotificationType, UserRole } from "@prisma/client";

/**
 * Libellés et liens des notifications (§45).
 *
 * « Chaque utilisateur possède : notifications non lues, notifications lues,
 * date, type, **lien vers l'objet concerné**. »
 *
 * Ce dernier point est la raison d'être de ce fichier. Une notification qui
 * annonce un événement sans y mener oblige à retrouver soi-même la commande
 * dont on parle — elle informe sans servir.
 *
 * **Le libellé dépend du destinataire, pas seulement du type.** Le même
 * événement ne se raconte pas de la même façon des deux côtés : « votre
 * paiement est sécurisé » pour le client, « un client vient de payer » pour le
 * vendeur. Un texte unique aurait forcément menti à l'un des deux.
 */

interface Formulation {
  titre: string;
  detail: string;
}

type ParRole = Partial<Record<UserRole, Formulation>> & { defaut: Formulation };

const FORMULATIONS: Record<NotificationType, ParRole> = {
  PAYMENT_CONFIRMED: {
    defaut: {
      titre: "Paiement confirmé",
      detail: "Le paiement de la commande a abouti.",
    },
    CLIENT: {
      titre: "Votre paiement est confirmé",
      detail: "KOLI garde votre argent jusqu'à ce que vous confirmiez la réception.",
    },
  },
  FUNDS_SECURED: {
    defaut: {
      titre: "Fonds sécurisés",
      detail: "L'argent est retenu par KOLI jusqu'à la confirmation du client.",
    },
    SELLER: {
      titre: "Un client vient de payer",
      detail: "L'argent est sécurisé. Préparez le colis et assignez un livreur.",
    },
  },
  ORDER_ACCEPTED: {
    defaut: {
      titre: "Commande acceptée",
      detail: "Un livreur a été assigné à la commande.",
    },
    CLIENT: {
      titre: "Votre commande part en livraison",
      detail: "Un livreur a été assigné. Gardez votre code de réception.",
    },
    DRIVER: {
      titre: "Nouvelle livraison à assurer",
      detail: "Une commande vous a été assignée.",
    },
  },
  PACKAGE_READY: {
    defaut: { titre: "Colis prêt", detail: "Le colis est prêt à être enlevé." },
    DRIVER: {
      titre: "Un colis vous attend",
      detail: "Le vendeur a préparé le colis : vous pouvez venir l'enlever.",
    },
    CLIENT: {
      titre: "Votre colis est prêt",
      detail: "Le vendeur l'a préparé ; le livreur va l'enlever.",
    },
  },
  PICKED_UP: {
    defaut: { titre: "Colis enlevé", detail: "Le livreur a récupéré le colis." },
    CLIENT: {
      titre: "Votre colis est parti",
      detail: "Le livreur l'a en main. Vous serez prévenu de son arrivée.",
    },
  },
  IN_TRANSIT: {
    defaut: { titre: "Colis en route", detail: "La livraison est en cours." },
    CLIENT: {
      titre: "Votre colis est en route",
      detail: "Gardez votre téléphone à portée de main.",
    },
  },
  ARRIVED: {
    defaut: {
      titre: "Le livreur est arrivé",
      detail: "Le colis est sur place.",
    },
    CLIENT: {
      titre: "Votre livreur est arrivé",
      detail:
        "Donnez-lui votre code de réception pour recevoir votre colis.",
    },
  },
  DELIVERED: {
    defaut: {
      titre: "Colis livré",
      detail: "La remise a été validée par le code de réception.",
    },
    CLIENT: {
      titre: "Votre colis a été remis",
      detail: "Confirmez la réception pour que le vendeur soit réglé.",
    },
    SELLER: {
      titre: "Votre colis a été remis",
      detail: "En attente de la confirmation du client avant versement.",
    },
  },
  CUSTOMER_CONFIRMED: {
    defaut: {
      titre: "Réception confirmée",
      detail: "Le client a confirmé avoir reçu sa commande.",
    },
  },
  FUNDS_RELEASED: {
    defaut: {
      titre: "Fonds libérés",
      detail: "L'argent a été versé au vendeur.",
    },
    SELLER: {
      titre: "Vous avez été réglé",
      detail: "Le client a confirmé la réception : les fonds sont sur votre solde.",
    },
  },
  DISPUTE_OPEN: {
    defaut: {
      titre: "Litige ouvert",
      detail: "Les fonds restent bloqués jusqu'à la décision de KOLI.",
    },
    SELLER: {
      titre: "Un client conteste une commande",
      detail: "Répondez depuis le litige. Les fonds sont gelés en attendant.",
    },
    ADMIN: {
      titre: "Un litige demande un arbitrage",
      detail: "Les fonds sont gelés tant que la décision n'est pas prise.",
    },
  },
  REFUND: {
    defaut: {
      titre: "Remboursement traité",
      detail: "La commande a été remboursée.",
    },
    CLIENT: {
      titre: "Vous avez été remboursé",
      detail: "Le remboursement de votre commande a été traité.",
    },
  },
};

export function formulerNotification(
  type: NotificationType,
  role: UserRole
): Formulation {
  const parRole = FORMULATIONS[type];
  // Le repli n'est pas un détail : un type ajouté sans formulation pour un rôle
  // produirait sinon une notification vide, donc muette.
  return parRole?.[role] ?? parRole?.defaut ?? {
    titre: "Mise à jour",
    detail: "Une commande a évolué.",
  };
}

/**
 * Lien vers l'objet concerné, selon le rôle.
 *
 * Un client et un vendeur ne consultent pas la même commande au même endroit :
 * renvoyer les deux vers la même adresse enverrait forcément l'un des deux sur
 * une page à laquelle il n'a pas accès.
 */
export function lienNotification(
  entite: string | null,
  entiteId: string | null,
  role: UserRole
): string | null {
  if (entite !== "Order" || !entiteId) return null;

  switch (role) {
    case "SELLER":
      // La recherche par référence : le vendeur atterrit sur SA commande, dans
      // sa propre liste, avec les actions qui lui sont réservées.
      return `/vendeur/commandes?q=${encodeURIComponent(entiteId)}`;
    case "ADMIN":
      return `/admin/litiges?q=${encodeURIComponent(entiteId)}`;
    case "DRIVER":
      return "/livreur/dashboard";
    default:
      // Le suivi de commande, accessible par la référence (§9) — y compris à
      // un acheteur qui n'a pas de compte.
      return `/pay/${encodeURIComponent(entiteId)}`;
  }
}
