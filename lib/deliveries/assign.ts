"use server";

import { revalidatePath } from "next/cache";
import { DeliveryStatus, OrderStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { partiesDeLaCommande, notifier } from "@/lib/notifications/envoi";

export type AssignDriverResult =
  | { success: true; driverName: string }
  | { success: false; error: string };

export interface DriverOption {
  id: string;
  name: string;
  vehicle: string | null;
  /** Ou il tourne, tel qu il l a ecrit lui-meme. */
  zone: string | null;
  /** Prend-il des courses en ce moment ? */
  available: boolean;
}

/**
 * Liste des livreurs assignables — SON EQUIPE, et elle seule (§5.3, §26).
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │  Cette fonction renvoyait TOUS les livreurs actifs de la plateforme.    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * C etait contraire au §5.3 — « Au debut, chaque vendeur peut utiliser son
 * propre livreur » — mais surtout c etait une fuite de cloisonnement, du meme
 * ordre que celles que la campagne traque ailleurs : le nom du livreur d un
 * concurrent s affichait dans un menu deroulant, et `assignDriverAction` ne
 * verifiait rien de plus que « ce livreur existe et est actif ». Un vendeur
 * pouvait donc faire porter ses colis par le livreur d en face.
 *
 * On passe desormais par `SellerDriver`, la table des equipes. Un livreur
 * n entre dans une equipe que par un lien d invitation
 * (`lib/drivers/invitations.ts`).
 *
 * Ne renvoie toujours que le strict necessaire au CHOIX : nom, vehicule, zone,
 * disponibilite. Aucune coordonnee, aucun chiffre — le vendeur choisit un
 * livreur, il ne consulte pas son dossier.
 *
 * **Les indisponibles restent dans la liste**, en fin de tri. Les masquer
 * ferait croire au vendeur que son livreur a disparu, et il chercherait la
 * panne du mauvais cote ; l ecran d assignation, lui, les presente comme tels.
 */
export async function listAvailableDriversAction(): Promise<DriverOption[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) return [];

  const liens = await prisma.sellerDriver.findMany({
    where: {
      sellerId: user.sellerProfile.id,
      driver: { user: { status: "ACTIVE" } },
    },
    select: {
      driver: {
        select: {
          id: true,
          vehicle: true,
          zone: true,
          available: true,
          user: { select: { name: true } },
        },
      },
    },
    // Les disponibles d abord, puis par nom. Le tri se fait ici et non a
    // l affichage : deux ecrans qui trient differemment la meme liste finissent
    // par se contredire.
    orderBy: [{ driver: { available: "desc" } }, { driver: { user: { name: "asc" } } }],
  });

  return liens.map((lien) => ({
    id: lien.driver.id,
    name: lien.driver.user.name,
    vehicle: lien.driver.vehicle,
    zone: lien.driver.zone,
    available: lien.driver.available,
  }));
}

/**
 * Assignation d'un livreur a une commande, par le vendeur (§26).
 *
 * Garde-fous :
 *  - role vendeur ;
 *  - la commande doit lui appartenir (sans quoi un vendeur pourrait detourner
 *    la livraison d'un concurrent) ;
 *  - les fonds doivent etre sequestres : rien ne part avant d'etre paye ;
 *  - une livraison deja confirmee ne se reassigne pas.
 */
export async function assignDriverAction(
  orderReference: string,
  driverId: string
): Promise<AssignDriverResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    return {
      success: false,
      error: "Vous devez être connecté en tant que vendeur.",
    };
  }

  if (typeof driverId !== "string" || driverId.trim().length === 0) {
    return { success: false, error: "Aucun livreur sélectionné." };
  }

  const order = await prisma.order.findUnique({
    where: { reference: orderReference },
    include: { delivery: true, fund: true },
  });

  if (!order) {
    return { success: false, error: "Commande introuvable." };
  }

  if (order.sellerId !== user.sellerProfile.id) {
    return { success: false, error: "Cette commande ne vous appartient pas." };
  }

  if (!order.fund?.secured) {
    return {
      success: false,
      error:
        "Le paiement n'est pas encore sécurisé. Attendez la confirmation avant d'assigner un livreur.",
    };
  }

  if (order.delivery?.status === DeliveryStatus.CONFIRMED) {
    return {
      success: false,
      error: "Cette commande a déjà été livrée.",
    };
  }

  /*
   * Le livreur doit etre DANS L EQUIPE de ce vendeur.
   *
   * Ce controle ne double pas celui de la liste : il le remplace. Filtrer le
   * menu deroulant ne protege rien — l identifiant du livreur voyage dans le
   * formulaire, et rien n empeche de le remplacer par celui d un autre. Une
   * garde posee a l affichage n est pas une garde, c est une decoration.
   *
   * On interroge donc la table de jonction, et pas `driverProfile` : la
   * question n est pas « ce livreur existe-t-il ? » mais « ce livreur
   * travaille-t-il pour MOI ? ».
   */
  const lien = await prisma.sellerDriver.findUnique({
    where: {
      sellerId_driverId: { sellerId: user.sellerProfile.id, driverId },
    },
    select: {
      driver: {
        select: {
          id: true,
          available: true,
          user: { select: { name: true, status: true } },
        },
      },
    },
  });

  if (!lien) {
    return {
      success: false,
      error:
        "Ce livreur ne fait pas partie de votre équipe. Invitez-le depuis la page « Mes livreurs ».",
    };
  }

  const driver = lien.driver;

  if (driver.user.status !== "ACTIVE") {
    return { success: false, error: "Le compte de ce livreur n'est pas actif." };
  }

  /*
   * Indisponible : on REFUSE, et le message dit les deux facons d en sortir.
   *
   * Le vendeur a pu convenir de la course par telephone, et on pourrait donc
   * n afficher qu un avertissement. Mais la disponibilite est declaree par le
   * livreur lui-meme, et lui seul : passer outre reviendrait a lui confier un
   * colis apres qu il a dit ne pas en prendre. Un colis assigne a quelqu un qui
   * ne le sait pas reste sur place, et c est le client qui l apprend.
   *
   * Le refus n enferme personne : il suffit que le livreur se remette
   * disponible depuis son profil — un geste, et il le fait lui-meme.
   */
  if (!driver.available) {
    return {
      success: false,
      error: `${driver.user.name} s'est déclaré indisponible. Demandez-lui de se remettre disponible, ou choisissez un autre livreur.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({
      where: { orderId: order.id },
      data: { driverId: driver.id, status: DeliveryStatus.ASSIGNED, assignedAt: new Date() },
    });

    // La commande passe cote vendeur : elle est acceptee et le colis part en
    // preparation. Transitions conformes a la machine a etats.
    if (order.status === OrderStatus.FUNDS_SECURED) {
      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.SELLER_ACCEPTED },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: OrderStatus.FUNDS_SECURED,
          toStatus: OrderStatus.SELLER_ACCEPTED,
          actorUserId: user.id,
        },
      });
    }

    // §44 : le client apprend que sa commande part, et le livreur qu'il a une
    // course. Le vendeur, lui, vient de faire le geste : le prevenir de sa
    // propre action encombrerait sa boite pour rien.
    const parties = await partiesDeLaCommande(tx, order.id);
    const compteLivreur = await tx.driverProfile.findUnique({
      where: { id: driver.id },
      select: { userId: true },
    });

    await notifier(tx, {
      type: "ORDER_ACCEPTED",
      entite: "Order",
      entiteId: order.reference,
      destinataires: [parties.client, compteLivreur?.userId],
      exclure: user.id,
    });
  });

  revalidatePath("/vendeur/commandes");
  revalidatePath("/vendeur/dashboard");
  revalidatePath("/livreur/dashboard");

  return { success: true, driverName: driver.user.name };
}
