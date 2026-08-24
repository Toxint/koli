"use server";

import { revalidatePath } from "next/cache";
import { UserStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { ACTIONS_AUDIT, consigner } from "@/lib/audit/journal";

export type AdminResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Suspension / reactivation d'un compte (§35).
 *
 * Reserve a l'administrateur, et un administrateur ne peut pas se suspendre
 * lui-meme : ce serait le seul moyen de se verrouiller definitivement hors de
 * la plateforme.
 */
export async function basculerStatutCompteAction(
  userId: string
): Promise<AdminResult> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "ADMIN") {
    return { success: false, error: "Action réservée à l'administration." };
  }

  if (userId === admin.id) {
    return {
      success: false,
      error: "Vous ne pouvez pas suspendre votre propre compte.",
    };
  }

  const cible = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true, name: true },
  });

  if (!cible) {
    return { success: false, error: "Utilisateur introuvable." };
  }

  const nouveau =
    cible.status === UserStatus.ACTIVE
      ? UserStatus.SUSPENDED
      : UserStatus.ACTIVE;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: cible.id },
      data: {
        status: nouveau,
        // Une reactivation remet le compteur de tentatives a zero : sinon un
        // compte reactive resterait bloque par un verrouillage anterieur.
        ...(nouveau === UserStatus.ACTIVE
          ? { failedLoginAttempts: 0, lockedUntil: null }
          : {}),
      },
    });

    // §48 : suspendre un compte prive quelqu'un de son outil de travail. Qui
    // l'a decide, et quand, doit rester etabli.
    await consigner(tx, {
      acteur: { id: admin.id, name: admin.name, role: admin.role },
      action: ACTIONS_AUDIT.ACCOUNT_STATUS_SET,
      entite: "User",
      entiteId: cible.id,
      details: {
        compte: cible.name,
        avant: cible.status === UserStatus.ACTIVE ? "actif" : "suspendu",
        apres: nouveau === UserStatus.ACTIVE ? "actif" : "suspendu",
      },
    });
  });

  revalidatePath("/admin/utilisateurs");
  revalidatePath("/admin/dashboard");

  return {
    success: true,
    message:
      nouveau === UserStatus.SUSPENDED
        ? `${cible.name} a été suspendu.`
        : `${cible.name} a été réactivé.`,
  };
}
