"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  DisputeReason,
  DisputeStatus,
  OrderStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/actions";
import {
  assertTransition,
  InvalidOrderTransitionError,
} from "@/lib/orders/statusMachine";
import { roleDansLitige } from "@/lib/disputes/acces";
import { litigeEstClos } from "@/lib/disputes/libelles";

export type ResultatLitige =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Litiges (§31-33).
 *
 * Trois règles gouvernent tout ce fichier :
 *
 *  1. **Seul le client ouvre un litige.** C'est lui qui conteste ; laisser le
 *     vendeur le faire lui donnerait un moyen de bloquer un versement qu'il
 *     doit.
 *  2. **Les fonds ne bougent pas tant que le litige est ouvert** (§33). Le
 *     verrou est déjà posé dans `confirmReceptionAction` ; l'ouverture d'un
 *     litige fait passer la commande en `DISPUTE_OPEN`, d'où la machine à
 *     états n'autorise que deux sorties, toutes deux réservées à l'admin.
 *  3. **Seule l'administration tranche.** Ni le client ni le vendeur ne
 *     peuvent décider de l'issue de leur propre différend.
 */

const ouvertureSchema = z.object({
  motif: z.enum(
    Object.values(DisputeReason) as [DisputeReason, ...DisputeReason[]],
    { message: "Choisissez un motif." }
  ),
  description: z
    .string()
    .trim()
    .min(10, "Décrivez le problème en quelques mots (10 caractères minimum).")
    .max(2000, "Description trop longue."),
});

export async function ouvrirLitigeAction(
  reference: string,
  formData: FormData
): Promise<ResultatLitige> {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) {
    return {
      success: false,
      error: "Connectez-vous à votre compte client pour signaler un problème.",
    };
  }

  const commande = await prisma.order.findUnique({
    where: { reference: String(reference).trim() },
    include: { dispute: true, fund: true },
  });

  if (!commande) {
    return { success: false, error: "Commande introuvable." };
  }

  // Seul le client conteste (règle 1).
  const role = roleDansLitige(utilisateur, commande);
  if (role !== "client") {
    return {
      success: false,
      error:
        role === "vendeur"
          ? "Un vendeur ne peut pas ouvrir un litige sur sa propre vente."
          : "Cette commande n'est pas rattachée à votre compte client.",
    };
  }

  if (commande.dispute) {
    return {
      success: false,
      error: "Un litige est déjà ouvert sur cette commande.",
    };
  }

  // Rien à contester si l'argent n'a jamais été encaissé.
  if (!commande.fund?.secured) {
    return {
      success: false,
      error:
        "Cette commande n'a pas encore été réglée. Il n'y a rien à contester.",
    };
  }

  if (commande.fund.released) {
    return {
      success: false,
      error:
        "Les fonds ont déjà été versés au vendeur. Contactez le support pour cette commande.",
    };
  }

  const validation = ouvertureSchema.safeParse({
    motif: formData.get("motif"),
    description: formData.get("description"),
  });

  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  try {
    assertTransition(commande.status, OrderStatus.DISPUTE_OPEN);
  } catch (erreur) {
    if (erreur instanceof InvalidOrderTransitionError) {
      return {
        success: false,
        error:
          "Cette commande n'est plus au stade où un litige peut être ouvert.",
      };
    }
    throw erreur;
  }

  const { motif, description } = validation.data;

  await prisma.$transaction(async (tx) => {
    // Écriture conditionnelle : deux envois simultanés ne doivent pas créer
    // deux litiges, ni faire deux fois la transition.
    const change = await tx.order.updateMany({
      where: { id: commande.id, status: commande.status },
      data: { status: OrderStatus.DISPUTE_OPEN },
    });

    if (change.count === 0) {
      throw new Error("CONCURRENT");
    }

    await tx.dispute.create({
      data: {
        orderId: commande.id,
        reason: motif,
        description,
        status: DisputeStatus.OPEN,
        messages: {
          create: [{ authorUserId: utilisateur.id, body: description }],
        },
      },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: commande.id,
        fromStatus: commande.status,
        toStatus: OrderStatus.DISPUTE_OPEN,
        actorUserId: utilisateur.id,
      },
    });
  });

  revalidatePath(`/pay/${commande.reference}`);
  revalidatePath(`/litige/${commande.reference}`);
  revalidatePath("/admin/litiges");

  return {
    success: true,
    message:
      "Votre signalement est enregistré. Les fonds restent bloqués jusqu'à la décision de KOLI.",
  };
}

const messageSchema = z
  .string()
  .trim()
  .min(2, "Votre message est vide.")
  .max(2000, "Message trop long.");

/** Le fil du litige : client, vendeur et administration s'y répondent (§31). */
export async function ajouterMessageLitigeAction(
  reference: string,
  formData: FormData
): Promise<ResultatLitige> {
  const utilisateur = await getCurrentUser();
  if (!utilisateur) {
    return { success: false, error: "Vous devez être connecté." };
  }

  const commande = await prisma.order.findUnique({
    where: { reference: String(reference).trim() },
    include: { dispute: true },
  });

  if (!commande?.dispute) {
    return { success: false, error: "Aucun litige sur cette commande." };
  }

  if (roleDansLitige(utilisateur, commande) === null) {
    return { success: false, error: "Ce litige ne vous concerne pas." };
  }

  if (litigeEstClos(commande.dispute.status)) {
    return {
      success: false,
      error: "Ce litige est clos : il n'accepte plus de message.",
    };
  }

  const validation = messageSchema.safeParse(formData.get("message"));
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  await prisma.disputeMessage.create({
    data: {
      disputeId: commande.dispute.id,
      authorUserId: utilisateur.id,
      body: validation.data,
    },
  });

  revalidatePath(`/litige/${commande.reference}`);
  return { success: true, message: "Message ajouté." };
}

/**
 * Décision de l'administration (§32).
 *
 * Deux issues seulement, et elles se traduisent différemment sur la commande :
 *   SELLER_WINS   → FUNDS_RELEASED  : le vendeur est payé
 *   CUSTOMER_WINS → REFUND_PENDING  : le remboursement est enclenché (phase 22)
 */
type Decision = typeof DisputeStatus.SELLER_WINS | typeof DisputeStatus.CUSTOMER_WINS;

const DECISIONS: Decision[] = [
  DisputeStatus.SELLER_WINS,
  DisputeStatus.CUSTOMER_WINS,
];

/** Liste blanche : la valeur vient du navigateur, on ne la croit pas sur parole. */
function estUneDecision(valeur: unknown): valeur is Decision {
  return DECISIONS.includes(valeur as Decision);
}

export async function trancherLitigeAction(
  reference: string,
  formData: FormData
): Promise<ResultatLitige> {
  const utilisateur = await getCurrentUser();
  if (!utilisateur || utilisateur.role !== "ADMIN") {
    return {
      success: false,
      error: "Seule l'administration peut trancher un litige.",
    };
  }

  const decision = formData.get("decision");
  if (!estUneDecision(decision)) {
    return { success: false, error: "Décision inconnue." };
  }

  const motivation = z
    .string()
    .trim()
    .min(10, "Motivez la décision : les deux parties la liront.")
    .max(2000)
    .safeParse(formData.get("motivation"));

  if (!motivation.success) {
    return { success: false, error: motivation.error.issues[0].message };
  }

  const commande = await prisma.order.findUnique({
    where: { reference: String(reference).trim() },
    include: { dispute: true, fund: true },
  });

  if (!commande?.dispute || !commande.fund) {
    return { success: false, error: "Aucun litige sur cette commande." };
  }

  if (litigeEstClos(commande.dispute.status)) {
    return { success: false, error: "Ce litige a déjà été tranché." };
  }

  const versStatut =
    decision === DisputeStatus.SELLER_WINS
      ? OrderStatus.FUNDS_RELEASED
      : OrderStatus.REFUND_PENDING;

  try {
    assertTransition(commande.status, versStatut);
  } catch (erreur) {
    if (erreur instanceof InvalidOrderTransitionError) {
      return {
        success: false,
        error: "Cette commande n'est plus dans un état permettant cette décision.",
      };
    }
    throw erreur;
  }

  const maintenant = new Date();

  await prisma.$transaction(async (tx) => {
    const change = await tx.dispute.updateMany({
      where: { id: commande.dispute!.id, resolvedAt: null },
      data: {
        status: decision,
        decision: motivation.data,
        resolvedAt: maintenant,
      },
    });

    // Deux administrateurs qui tranchent en même temps : le second n'écrit rien.
    if (change.count === 0) throw new Error("CONCURRENT");

    await tx.order.update({
      where: { id: commande.id },
      data: { status: versStatut },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: commande.id,
        fromStatus: commande.status,
        toStatus: versStatut,
        actorUserId: utilisateur.id,
      },
    });

    if (decision === DisputeStatus.SELLER_WINS) {
      // Libération restreinte à CETTE commande (`orderId`), jamais au vendeur :
      // un filtre par `sellerId` viderait tout son séquestre d'un coup.
      await tx.fund.updateMany({
        where: { orderId: commande.id, released: false },
        data: { released: true, releasedAt: maintenant },
      });

      await tx.transaction.create({
        data: {
          orderId: commande.id,
          type: "FUNDS_RELEASED",
          amount: commande.fund!.amount,
        },
      });
    } else {
      // Le remboursement lui-même relève de la phase 22 : on inscrit la
      // créance, on ne déplace pas encore l'argent.
      await tx.refund.create({
        data: {
          orderId: commande.id,
          amount: commande.fund!.amount + commande.deliveryFee,
          reason: motivation.data,
        },
      });
    }

    // Le fil garde la trace de la décision, lisible par les deux parties.
    await tx.disputeMessage.create({
      data: {
        disputeId: commande.dispute!.id,
        authorUserId: utilisateur.id,
        body: motivation.data,
      },
    });
  });

  revalidatePath(`/litige/${commande.reference}`);
  revalidatePath(`/pay/${commande.reference}`);
  revalidatePath("/admin/litiges");
  revalidatePath("/admin/dashboard");

  return {
    success: true,
    message:
      decision === DisputeStatus.SELLER_WINS
        ? "Litige tranché : les fonds sont versés au vendeur."
        : "Litige tranché : le remboursement du client est enclenché.",
  };
}

/** Utilisé par les pages pour savoir quoi afficher, sans dupliquer les règles. */
export async function chargerContexteLitige(reference: string) {
  const utilisateur = await getCurrentUser();

  const commande = await prisma.order.findUnique({
    where: { reference: String(reference).trim() },
    include: {
      fund: true,
      seller: { select: { businessName: true, user: { select: { name: true } } } },
      dispute: { include: { messages: { orderBy: { createdAt: "asc" } } } },
    },
  });

  if (!commande) return null;

  const role = roleDansLitige(utilisateur, commande);
  if (role === null) return null;

  // Les auteurs des messages sont résolus en une requête plutôt qu'une par
  // message.
  const auteurs = commande.dispute
    ? await prisma.user.findMany({
        where: {
          id: { in: [...new Set(commande.dispute.messages.map((m) => m.authorUserId))] },
        },
        select: { id: true, name: true, role: true },
      })
    : [];

  return { commande, role, auteurs, utilisateur };
}

