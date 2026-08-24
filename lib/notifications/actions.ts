"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/actions";

export type ResultatNotification =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Marquer comme lu (§45).
 *
 * **La portée `userId` n'est pas un filtre de confort, c'est le contrôle
 * d'accès.** Sans elle, un identifiant fabriqué permettrait de marquer lues
 * les notifications de quelqu'un d'autre — de les faire disparaître de sa vue,
 * donc de lui cacher un litige ou un paiement. `updateMany` avec la double
 * condition ne trouve simplement rien à mettre à jour.
 */
export async function marquerNotificationLueAction(
  notificationId: string
): Promise<ResultatNotification> {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) {
    return { success: false, error: "Vous devez être connecté." };
  }

  await prisma.notification.updateMany({
    // `readAt: null` rend l'opération idempotente : rejouée, elle ne déplace
    // pas la date de lecture déjà enregistrée.
    where: { id: notificationId, userId: utilisateur.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notifications");
  return { success: true, message: "Notification marquée comme lue." };
}

/** Tout marquer comme lu — le geste attendu quand la liste s'est accumulée. */
export async function toutMarquerLuAction(): Promise<ResultatNotification> {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) {
    return { success: false, error: "Vous devez être connecté." };
  }

  const resultat = await prisma.notification.updateMany({
    where: { userId: utilisateur.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notifications");

  return {
    success: true,
    message:
      resultat.count === 0
        ? "Aucune notification non lue."
        : `${resultat.count} notification(s) marquée(s) comme lue(s).`,
  };
}
