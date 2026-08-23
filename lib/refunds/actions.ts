"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OrderStatus, RefundStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/actions";
import {
  assertTransition,
  InvalidOrderTransitionError,
} from "@/lib/orders/statusMachine";

export type ResultatRemboursement =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Remboursements simulés (phase 22).
 *
 * Une créance `Refund` naît d'un litige tranché en faveur du client. Elle
 * était inscrite mais **rien ne la traitait** : l'argent restait indéfiniment
 * séquestré, ni versé au vendeur ni rendu au client.
 *
 * Le §30 est ici la règle cardinale — « le système doit empêcher : deux
 * validations, deux libérations, **deux remboursements**, deux confirmations
 * de paiement ». D'où l'écriture conditionnelle sur `status: PENDING` : un
 * second appel ne trouve plus rien à mettre à jour et s'arrête.
 *
 * MODE TEST : aucun mouvement d'argent réel. On inscrit le remboursement au
 * journal (§40) et on marque la commande `REFUNDED`.
 */
const traitementSchema = z.object({
  /**
   * Le stock revient-il en rayon ?
   *
   * Volontairement un CHOIX, et non un automatisme. Le motif du litige décide :
   * un colis jamais reçu peut être encore chez le vendeur, tandis qu'un article
   * abîmé ou renvoyé au mauvais destinataire ne revient pas vendable.
   * Remettre à tort crée du stock fantôme — donc de la survente, donc une autre
   * commande impossible à honorer. Ne pas remettre laisse simplement un
   * compteur à corriger au catalogue. Le défaut est donc « non ».
   */
  restituerStock: z.coerce.boolean().optional(),
  note: z
    .string()
    .trim()
    .max(2000, "Note trop longue.")
    .optional()
    .or(z.literal("")),
});

export async function traiterRemboursementAction(
  reference: string,
  formData: FormData
): Promise<ResultatRemboursement> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "ADMIN") {
    return {
      success: false,
      error: "Seule l'administration peut traiter un remboursement.",
    };
  }

  const validation = traitementSchema.safeParse({
    restituerStock: formData.get("restituerStock") === "on",
    note: formData.get("note") ?? "",
  });

  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  const commande = await prisma.order.findUnique({
    where: { reference: String(reference).trim() },
    include: { refund: true, fund: true, items: true },
  });

  if (!commande?.refund) {
    return { success: false, error: "Aucun remboursement sur cette commande." };
  }

  if (commande.refund.status === RefundStatus.COMPLETED) {
    // §30 : idempotence. Ce n'est pas une erreur, l'état voulu est déjà atteint.
    return {
      success: true,
      message: "Ce remboursement a déjà été traité.",
    };
  }

  try {
    assertTransition(commande.status, OrderStatus.REFUNDED);
  } catch (erreur) {
    if (erreur instanceof InvalidOrderTransitionError) {
      return {
        success: false,
        error:
          "Cette commande n'est pas en attente de remboursement.",
      };
    }
    throw erreur;
  }

  const maintenant = new Date();
  const montant = commande.refund.amount;

  try {
    await prisma.$transaction(async (tx) => {
      // Écriture conditionnelle : deux administrateurs qui cliquent en même
      // temps, ou un double envoi, ne remboursent qu'une fois (§30).
      const pris = await tx.refund.updateMany({
        where: { id: commande.refund!.id, status: RefundStatus.PENDING },
        data: {
          status: RefundStatus.COMPLETED,
          processedAt: maintenant,
          ...(validation.data.note
            ? { reason: validation.data.note }
            : {}),
        },
      });

      if (pris.count === 0) throw new Error("DEJA_TRAITE");

      await tx.order.update({
        where: { id: commande.id },
        data: { status: OrderStatus.REFUNDED },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: commande.id,
          fromStatus: commande.status,
          toStatus: OrderStatus.REFUNDED,
          actorUserId: admin.id,
        },
      });

      // §40 : tout mouvement figure au journal. Montant négatif — c'est de
      // l'argent qui sort, à l'inverse de l'encaissement.
      await tx.transaction.create({
        data: {
          orderId: commande.id,
          type: "REFUND",
          amount: -montant,
        },
      });

      // Le séquestre s'éteint : l'argent ne revient pas au vendeur, mais il ne
      // reste pas non plus compté comme engagement de la plateforme.
      await tx.fund.updateMany({
        where: { orderId: commande.id, released: false },
        data: { released: true, releasedAt: maintenant },
      });

      if (validation.data.restituerStock) {
        for (const ligne of commande.items) {
          await tx.product.update({
            where: { id: ligne.productId },
            data: { quantity: { increment: ligne.quantity } },
          });
        }
      }
    });
  } catch (erreur) {
    if (erreur instanceof Error && erreur.message === "DEJA_TRAITE") {
      return { success: true, message: "Ce remboursement a déjà été traité." };
    }
    throw erreur;
  }

  revalidatePath("/admin/remboursements");
  revalidatePath("/admin/dashboard");
  revalidatePath(`/pay/${commande.reference}`);
  revalidatePath(`/litige/${commande.reference}`);

  return {
    success: true,
    message: validation.data.restituerStock
      ? "Remboursement traité, stock remis au catalogue."
      : "Remboursement traité.",
  };
}
