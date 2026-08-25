import type { DeliveryStatus, OrderStatus } from "@prisma/client";

/**
 * Import de TYPES seulement, et valeurs ecrites en toutes lettres.
 *
 * Ce module est lu par la frise de suivi, rendue dans un composant client.
 * Importer les enumerations de Prisma comme des VALEURS y ferait entrer le
 * client Prisma dans le paquet envoye au navigateur — plusieurs centaines de
 * kilo-octets pour un public souvent en 3G (§70).
 *
 * Les chaines restent verifiees : les enumerations de Prisma sont des unions
 * de litteraux, une faute de frappe ne compile pas.
 */

/**
 * Jalons de la livraison (§26).
 *
 * « ASSIGNÉ → COLIS À RÉCUPÉRER → COLIS RÉCUPÉRÉ → EN LIVRAISON → ARRIVÉ →
 * LIVRAISON À CONFIRMER »
 *
 * Ces états existaient dans l'énumération depuis le premier jour et **aucune
 * action ne les posait**. Le parcours sautait de l'assignation d'un livreur
 * directement à la validation du code de réception : entre les deux, le client
 * n'avait aucun moyen de savoir où était son colis.
 *
 * Pire, c'était visible : une commande assignée reste en `SELLER_ACCEPTED`, un
 * statut que la page de suivi ne connaissait pas. Elle retombait donc sur
 * l'écran de paiement et proposait de payer une seconde fois une commande déjà
 * réglée.
 *
 * **Cette liste est la source unique.** Le livreur y lit quel bouton proposer,
 * le client y lit sa frise de suivi, et la correspondance des statuts en
 * découle. Trois listes séparées auraient divergé dès la première correction.
 */

export interface Jalon {
  /** Identifiant transmis par le formulaire. Liste blanche à la réception. */
  code: string;
  /** Ce que fait la personne — à la première personne, c'est elle qui agit. */
  actionLivreur: string;
  /** Ce que lit le client sur sa frise. */
  libelleClient: string;
  /** Précision utile au client, ou chaîne vide. */
  detailClient: string;
  statutLivraison: DeliveryStatus;
  statutCommande: OrderStatus;
  /** Qui pose ce jalon. Le vendeur prépare, le livreur transporte. */
  acteur: "vendeur" | "livreur" | "systeme";
}

/**
 * L'ordre est significatif : c'est celui de la frise, et il détermine ce qui
 * est déjà franchi.
 */
export const JALONS: Jalon[] = [
  {
    code: "PAYE",
    actionLivreur: "",
    libelleClient: "Paiement sécurisé",
    detailClient: "KOLI garde votre argent jusqu'à votre confirmation.",
    statutLivraison: "UNASSIGNED",
    statutCommande: "FUNDS_SECURED",
    acteur: "systeme",
  },
  {
    code: "ASSIGNE",
    actionLivreur: "",
    libelleClient: "Livreur désigné",
    detailClient: "Le vendeur a confié votre colis à un livreur.",
    statutLivraison: "ASSIGNED",
    statutCommande: "SELLER_ACCEPTED",
    acteur: "vendeur",
  },
  {
    code: "PRET",
    actionLivreur: "",
    libelleClient: "Colis prêt",
    detailClient: "Le vendeur a préparé votre colis ; il attend l'enlèvement.",
    statutLivraison: "TO_PICK_UP",
    statutCommande: "READY_FOR_PICKUP",
    acteur: "vendeur",
  },
  {
    code: "RECUPERE",
    actionLivreur: "J'ai récupéré le colis",
    libelleClient: "Colis récupéré",
    detailClient: "Le livreur a le colis en main.",
    statutLivraison: "PICKED_UP",
    statutCommande: "PICKED_UP",
    acteur: "livreur",
  },
  {
    code: "EN_ROUTE",
    actionLivreur: "Je pars en livraison",
    libelleClient: "En route vers vous",
    detailClient: "Gardez votre téléphone à portée de main.",
    statutLivraison: "IN_TRANSIT",
    statutCommande: "IN_TRANSIT",
    acteur: "livreur",
  },
  {
    code: "ARRIVE",
    actionLivreur: "Je suis arrivé",
    libelleClient: "Le livreur est arrivé",
    detailClient: "Donnez-lui votre code de réception pour recevoir le colis.",
    statutLivraison: "ARRIVED",
    statutCommande: "ARRIVED",
    acteur: "livreur",
  },
  {
    code: "REMIS",
    actionLivreur: "",
    libelleClient: "Colis remis",
    detailClient: "Confirmez la réception pour que le vendeur soit réglé.",
    statutLivraison: "CONFIRMED",
    statutCommande: "DELIVERED",
    acteur: "livreur",
  },
];

/** Jalons que le livreur pose lui-même, dans l'ordre. */
export const JALONS_LIVREUR = JALONS.filter((j) => j.acteur === "livreur" && j.actionLivreur !== "");

export function jalonParCode(code: unknown): Jalon | null {
  if (typeof code !== "string") return null;
  return JALONS.find((j) => j.code === code) ?? null;
}

/**
 * Position d'une commande sur la frise.
 *
 * `-1` pour un état qui n'appartient pas au parcours normal — litige,
 * remboursement, échec. La frise ne doit alors pas s'afficher : montrer un
 * colis « en route » à quelqu'un dont la commande est en litige serait faux.
 */
export function indiceJalon(statutCommande: OrderStatus): number {
  const exact = JALONS.findIndex((j) => j.statutCommande === statutCommande);
  if (exact !== -1) return exact;

  // États postérieurs à la remise : la frise est entièrement parcourue.
  if (
    statutCommande === "CUSTOMER_CONFIRMED" ||
    statutCommande === "FUNDS_RELEASED" ||
    statutCommande === "COMPLETED"
  ) {
    return JALONS.length - 1;
  }

  // PACKAGE_PREPARING est un état de passage : la machine y transite pour
  // atteindre READY_FOR_PICKUP. Le client le lit comme « colis prêt » en
  // cours, donc au jalon précédent.
  if (statutCommande === "PACKAGE_PREPARING") {
    return JALONS.findIndex((j) => j.code === "ASSIGNE");
  }

  return -1;
}

/**
 * Le prochain jalon que CE livreur peut poser, ou `null`.
 *
 * Déduit de l'état de la livraison et non d'un compteur : deux onglets
 * ouverts, ou un double appui sur un réseau lent, ne doivent pas faire sauter
 * une étape ni en rejouer une.
 */
export function prochainJalonLivreur(
  statutLivraison: DeliveryStatus
): Jalon | null {
  switch (statutLivraison) {
    case "UNASSIGNED":
    case "ASSIGNED":
    case "TO_PICK_UP":
      return JALONS_LIVREUR[0]; // récupéré
    case "PICKED_UP":
      return JALONS_LIVREUR[1]; // en route
    case "IN_TRANSIT":
      return JALONS_LIVREUR[2]; // arrivé
    default:
      // ARRIVED : il ne reste que le code de réception, qui n'est pas un
      // jalon mais la remise elle-même.
      return null;
  }
}
