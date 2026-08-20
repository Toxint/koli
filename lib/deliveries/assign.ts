"use server";

import { revalidatePath } from "next/cache";
import { DeliveryStatus, OrderStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";

export type AssignDriverResult =
  | { success: true; driverName: string }
  | { success: false; error: string };

export interface DriverOption {
  id: string;
  name: string;
  vehicle: string | null;
}

/**
 * Liste des livreurs assignables (§26).
 *
 * Ne renvoie que le strict necessaire au choix : identifiant, nom, vehicule.
 * Aucune donnee de contact ni financiere — le vendeur choisit un livreur, il
 * ne consulte pas son dossier.
 */
export async function listAvailableDriversAction(): Promise<DriverOption[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) return [];

  const drivers = await prisma.driverProfile.findMany({
    where: { user: { status: "ACTIVE" } },
    select: { id: true, vehicle: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });

  return drivers.map((d) => ({
    id: d.id,
    name: d.user.name,
    vehicle: d.vehicle,
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

  const driver = await prisma.driverProfile.findUnique({
    where: { id: driverId },
    select: { id: true, user: { select: { name: true, status: true } } },
  });

  if (!driver || driver.user.status !== "ACTIVE") {
    return { success: false, error: "Ce livreur n'est pas disponible." };
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
  });

  revalidatePath("/vendeur/commandes");
  revalidatePath("/vendeur/dashboard");
  revalidatePath("/livreur/dashboard");

  return { success: true, driverName: driver.user.name };
}
