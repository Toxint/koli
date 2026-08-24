"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/actions";
import { ACTIONS_AUDIT, consigner } from "@/lib/audit/journal";

export type ResultatCommission =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Configuration du taux de commission (§41).
 *
 * « Ne pas coder définitivement le taux — il doit être configurable par
 * l'administrateur. » Le taux vivait bien en base, mais aucun écran ne
 * permettait d'y toucher : il était donc figé dans les faits, à la valeur
 * inscrite une fois par le jeu de données initial.
 *
 * **Changer de taux crée une ligne, n'en modifie aucune.** Les anciennes sont
 * désactivées, jamais réécrites. Deux raisons : on peut retracer quel taux
 * était en vigueur à quelle date, et les écritures passées gardent le leur —
 * `Transaction.rate` le fige à l'inscription. Corriger le taux aujourd'hui ne
 * réécrit donc aucune commission déjà prélevée, ce qui est exactement ce qu'on
 * attend d'un registre comptable.
 */

const tauxSchema = z.coerce
  .number({ message: "Saisissez un taux valide." })
  .min(0, "Le taux ne peut pas être négatif.")
  // 100 % signifierait que le vendeur ne touche rien : c'est une saisie
  // certainement erronée, et la refuser coûte moins cher que la réparer.
  .max(50, "Un taux supérieur à 50 % est certainement une erreur de saisie.")
  .refine(
    (v) => Number.isFinite(v) && Math.round(v * 100) === v * 100,
    "Deux décimales au maximum (exemple : 4,75)."
  );

export async function definirTauxCommissionAction(
  formData: FormData
): Promise<ResultatCommission> {
  const utilisateur = await getCurrentUser();
  if (!utilisateur || utilisateur.role !== "ADMIN") {
    return {
      success: false,
      error: "Seule l'administration peut modifier la commission.",
    };
  }

  // La virgule décimale est la notation française. La refuser obligerait
  // l'administrateur à saisir « 4.75 » sur un clavier de téléphone qui propose
  // une virgule.
  const brut = String(formData.get("taux") ?? "").trim().replace(",", ".");
  const validation = tauxSchema.safeParse(brut);

  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  const taux = validation.data;

  const actif = await prisma.commission.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    select: { ratePercent: true },
  });

  // Réenregistrer le même taux créerait une ligne d'historique sans événement :
  // on lirait plus tard un « changement » qui n'a jamais eu lieu.
  if (actif && actif.ratePercent === taux) {
    return {
      success: true,
      message: `Le taux est déjà fixé à ${taux} %. Rien n'a été modifié.`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.commission.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    const nouvelle = await tx.commission.create({
      data: { ratePercent: taux, isActive: true },
    });

    // §48 : ce geste change la recette de la plateforme. Il ne laissait
    // jusqu'ici aucune trace de son auteur — dans la même transaction, pour
    // qu'un taux ne puisse pas changer sans que le journal le sache.
    await consigner(tx, {
      acteur: {
        id: utilisateur.id,
        name: utilisateur.name,
        role: utilisateur.role,
      },
      action: ACTIONS_AUDIT.COMMISSION_RATE_SET,
      entite: "Commission",
      entiteId: nouvelle.id,
      details: {
        avant: actif ? `${actif.ratePercent} %` : "aucune commission",
        apres: `${taux} %`,
      },
    });
  });

  revalidatePath("/admin/commissions");
  revalidatePath("/admin/dashboard");

  return {
    success: true,
    message:
      actif === null
        ? `Commission activée à ${taux} %. Elle s'appliquera aux prochaines libérations de fonds.`
        : `Commission portée de ${actif.ratePercent} % à ${taux} %. Les commissions déjà prélevées ne changent pas.`,
  };
}

/**
 * Suspend le prélèvement sans perdre l'historique.
 *
 * Utile pour une période promotionnelle : les lignes passées restent, et rien
 * n'est prélevé tant que la commission n'est pas réactivée.
 */
export async function suspendreCommissionAction(): Promise<ResultatCommission> {
  const utilisateur = await getCurrentUser();
  if (!utilisateur || utilisateur.role !== "ADMIN") {
    return {
      success: false,
      error: "Seule l'administration peut modifier la commission.",
    };
  }

  const arret = await prisma.$transaction(async (tx) => {
    const actif = await tx.commission.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: { ratePercent: true },
    });

    const resultat = await tx.commission.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // Rien à consigner s'il n'y avait rien à suspendre : le journal
    // n'enregistre que des événements, pas des gestes sans effet.
    if (resultat.count > 0) {
      await consigner(tx, {
        acteur: {
          id: utilisateur.id,
          name: utilisateur.name,
          role: utilisateur.role,
        },
        action: ACTIONS_AUDIT.COMMISSION_SUSPENDED,
        entite: "Commission",
        entiteId: "active",
        details: {
          avant: actif ? `${actif.ratePercent} %` : "—",
          apres: "suspendue",
        },
      });
    }

    return resultat;
  });

  revalidatePath("/admin/commissions");
  revalidatePath("/admin/dashboard");

  return {
    success: true,
    message:
      arret.count === 0
        ? "Aucune commission n'était active."
        : "Commission suspendue. Plus rien ne sera prélevé sur les prochaines libérations.",
  };
}
