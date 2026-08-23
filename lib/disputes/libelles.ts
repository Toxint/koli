import { DisputeReason, DisputeStatus } from "@prisma/client";

/**
 * Libellés français des litiges (§31-32).
 *
 * Module sans « use server » : ces tables sont lues à l'affichage, y compris
 * depuis des composants serveur, et une fonction exportée par un fichier
 * « use server » ne peut être qu'asynchrone.
 */

/** §31 — les six motifs prévus, dans l'ordre du cahier des charges. */
export const MOTIFS: { valeur: DisputeReason; libelle: string; aide: string }[] =
  [
    {
      valeur: DisputeReason.NOT_RECEIVED,
      libelle: "Je n'ai pas reçu le produit",
      aide: "Le colis n'est jamais arrivé, ou le livreur ne s'est pas présenté.",
    },
    {
      valeur: DisputeReason.WRONG_PRODUCT,
      libelle: "Ce n'est pas le bon produit",
      aide: "J'ai reçu un article différent de celui que j'ai commandé.",
    },
    {
      valeur: DisputeReason.DAMAGED,
      libelle: "Le produit est abîmé",
      aide: "L'article est cassé, taché ou détérioré.",
    },
    {
      valeur: DisputeReason.INCOMPLETE,
      libelle: "La commande est incomplète",
      aide: "Il manque un article ou une pièce.",
    },
    {
      valeur: DisputeReason.NOT_AS_DESCRIBED,
      libelle: "Le produit ne correspond pas à la description",
      aide: "Taille, couleur ou matière différentes de l'annonce.",
    },
    {
      valeur: DisputeReason.OTHER,
      libelle: "Autre problème",
      aide: "Expliquez la situation dans le message ci-dessous.",
    },
  ];

export function libelleMotif(motif: DisputeReason | string): string {
  return MOTIFS.find((m) => m.valeur === motif)?.libelle ?? String(motif);
}

const STATUTS: Record<DisputeStatus, { libelle: string; classes: string }> = {
  OPEN: {
    libelle: "Litige ouvert",
    classes: "bg-amber-100 text-amber-900",
  },
  ADMIN_REVIEW: {
    libelle: "En cours d'examen",
    classes: "bg-amber-100 text-amber-900",
  },
  SELLER_WINS: {
    libelle: "Tranché en faveur du vendeur",
    classes: "bg-hairline text-ink-muted",
  },
  CUSTOMER_WINS: {
    libelle: "Tranché en faveur du client",
    classes: "bg-emerald-100 text-emerald-800",
  },
};

export function libelleStatutLitige(statut: DisputeStatus | string): string {
  return STATUTS[statut as DisputeStatus]?.libelle ?? String(statut);
}

export function classesStatutLitige(statut: DisputeStatus | string): string {
  return (
    STATUTS[statut as DisputeStatus]?.classes ?? "bg-hairline text-ink-muted"
  );
}

/** Un litige tranché ne se rouvre pas : il n'accepte plus de message. */
export function litigeEstClos(statut: DisputeStatus | string): boolean {
  return statut === DisputeStatus.SELLER_WINS || statut === DisputeStatus.CUSTOMER_WINS;
}
