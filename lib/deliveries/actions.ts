"use server";

import { revalidatePath } from "next/cache";
import { OrderStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { findTransitionPath } from "@/lib/orders/statusMachine";

export type ValidateOtpResponse = {
  success: boolean;
  message?: string;
  error?: string;
  /** Tentatives restantes, renseigne uniquement en cas de code errone. */
  attemptsLeft?: number;
};

/**
 * Validation par le livreur du code OTP remis par le client (§27).
 *
 * Effets : consomme le code, marque la livraison CONFIRMED, la commande
 * DELIVERED, et enregistre la preuve de livraison (§28).
 *
 * Ce que cette action NE fait PAS : liberer les fonds. Le §29 est explicite —
 * c'est le CLIENT qui confirme la reception, et c'est cette confirmation qui
 * declenche la liberation (voir `confirmReceptionAction`). Livrer n'est pas
 * etre paye : c'est toute la promesse de KOLI.
 */
export async function validateDeliveryOtpAction(
  deliveryId: string,
  otpInput: string
): Promise<ValidateOtpResponse> {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "DRIVER" || !user.driverProfile) {
      return {
        success: false,
        error:
          "Action non autorisée. Vous devez être connecté en tant que livreur.",
      };
    }

    const cleanedOtp = otpInput.trim();
    if (!/^\d{4,8}$/.test(cleanedOtp)) {
      return {
        success: false,
        error: "Veuillez saisir un code OTP valide (4 chiffres).",
      };
    }

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: true, otpCodes: true },
    });

    if (!delivery) {
      return { success: false, error: "Livraison introuvable." };
    }

    // --- Verification de propriete (§47, §71) ---
    // Le controle de role seul ne suffit pas : sans ce test, n'importe quel
    // livreur authentifie pouvait valider la livraison d'un autre.
    if (delivery.driverId !== user.driverProfile.id) {
      return {
        success: false,
        error: "Cette livraison ne vous est pas assignée.",
      };
    }

    if (delivery.status === "CONFIRMED") {
      return {
        success: false,
        error: "Cette livraison a déjà été marquée comme effectuée.",
      };
    }

    // --- Code actif : le plus recent non encore consomme ---
    const activeOtp = delivery.otpCodes
      .filter((otp) => otp.consumedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    if (!activeOtp) {
      return {
        success: false,
        error: "Aucun code de livraison actif pour cette commande.",
      };
    }

    // --- Limitation des tentatives (§27) ---
    if (activeOtp.attempts >= activeOtp.maxAttempts) {
      return {
        success: false,
        error:
          "Trop de tentatives incorrectes. Contactez le support KOLI pour débloquer cette livraison.",
        attemptsLeft: 0,
      };
    }

    if (activeOtp.code !== cleanedOtp) {
      const updated = await prisma.otpCode.update({
        where: { id: activeOtp.id },
        data: { attempts: { increment: 1 } },
      });

      const attemptsLeft = Math.max(
        updated.maxAttempts - updated.attempts,
        0
      );

      return {
        success: false,
        error:
          attemptsLeft > 0
            ? `Code incorrect. Il vous reste ${attemptsLeft} tentative(s).`
            : "Code incorrect. Nombre maximal de tentatives atteint.",
        attemptsLeft,
      };
    }

    // --- Chemin de statuts jusqu'a DELIVERED ---
    // Les jalons intermediaires du livreur (colis recupere, en transit, arrive)
    // n'ont pas encore d'interface dediee : ils seront poses un par un en
    // phase 15. En attendant, on franchit le chemin d'un bloc — chaque saut
    // reste une transition legale et chacun est journalise.
    const path = findTransitionPath(delivery.order.status, OrderStatus.DELIVERED);

    if (path === null) {
      return {
        success: false,
        error: `Cette commande n'est pas dans un état permettant la livraison (${delivery.order.status}).`,
      };
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Consommation du code, conditionnee pour rester idempotente face a un
      // double envoi : si un autre appel l'a deja consomme, on s'arrete.
      const consumed = await tx.otpCode.updateMany({
        where: { id: activeOtp.id, consumedAt: null },
        data: { consumedAt: now },
      });

      if (consumed.count === 0) {
        throw new OtpAlreadyConsumedError();
      }

      await tx.delivery.update({
        where: { id: deliveryId },
        data: { status: "CONFIRMED", deliveredAt: now },
      });

      // Preuve de livraison (§28) : OTP, date, livreur, commande.
      // Les champs signature / photo / geolocalisation restent prevus pour plus tard.
      await tx.deliveryProof.create({
        data: {
          deliveryId,
          otpCode: activeOtp.code,
          confirmedAt: now,
        },
      });

      if (path.length > 0) {
        await tx.order.update({
          where: { id: delivery.orderId },
          data: { status: OrderStatus.DELIVERED },
        });

        let from = delivery.order.status;
        for (const to of path) {
          await tx.orderStatusHistory.create({
            data: {
              orderId: delivery.orderId,
              fromStatus: from,
              toStatus: to,
              actorUserId: user.id,
            },
          });
          from = to;
        }
      }
    });

    revalidatePath("/driver/dashboard");
    revalidatePath("/seller/dashboard");
    revalidatePath("/seller/commandes");
    revalidatePath(`/pay/${delivery.order.reference}`);

    return {
      success: true,
      message:
        `Code OTP validé. La commande ${delivery.order.reference} est marquée comme livrée. ` +
        `Les fonds seront versés au vendeur dès que le client aura confirmé la réception.`,
    };
  } catch (error) {
    if (error instanceof OtpAlreadyConsumedError) {
      return {
        success: false,
        error: "Ce code a déjà été utilisé pour cette livraison.",
      };
    }

    console.error("Erreur lors de la validation OTP:", error);
    return {
      success: false,
      error:
        "Erreur serveur lors de la validation du code OTP. Veuillez réessayer.",
    };
  }
}

class OtpAlreadyConsumedError extends Error {
  constructor() {
    super("Code OTP deja consomme par un appel concurrent.");
    this.name = "OtpAlreadyConsumedError";
  }
}
