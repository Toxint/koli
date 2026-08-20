"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getPaymentProvider } from "@/lib/config/mode";
import {
  assertTransition,
  InvalidOrderTransitionError,
} from "@/lib/orders/statusMachine";

const outcomeSchema = z.enum(["SUCCESS", "FAILURE"]);

export type SimulatePaymentResult =
  | { success: true; status: OrderStatus }
  | { success: false; error: string };

/**
 * Paiement SIMULE d'une commande (§21-23).
 *
 * Autorisation — la commande se paie depuis un lien public
 * (`/pay/<reference>`), sans compte : le cahier des charges prevoit
 * explicitement l'achat invite. C'est donc la POSSESSION DE LA REFERENCE qui
 * fait office de capacite, exactement comme un lien de paiement bancaire.
 * L'action prend donc la reference (contenue dans le lien) et non l'identifiant
 * interne de la commande, qui n'est jamais cense circuler.
 * Cette garantie repose sur le caractere non devinable de la reference —
 * assure par `generateOrderReference()` (lib/orders/reference.ts).
 *
 * Aucun argent reel n'est deplace : le fournisseur est obtenu via
 * `getPaymentProvider()`, qui refuse tout mode autre que "test" (§1, §84).
 */
export async function simulatePaymentAction(
  reference: string,
  outcome: "SUCCESS" | "FAILURE"
): Promise<SimulatePaymentResult> {
  const parsedOutcome = outcomeSchema.safeParse(outcome);
  if (!parsedOutcome.success) {
    return { success: false, error: "Scenario de paiement invalide." };
  }

  if (typeof reference !== "string" || reference.trim().length === 0) {
    return { success: false, error: "Reference de commande manquante." };
  }

  const order = await prisma.order.findUnique({
    where: { reference: reference.trim() },
    include: { payment: true, fund: true, items: true },
  });

  if (!order || !order.payment || !order.fund) {
    return { success: false, error: "Commande introuvable." };
  }

  // --- Idempotence (§30) : un paiement deja abouti ne se rejoue pas. ---
  // Sans ce garde-fou, chaque appel repete dupliquait l'ecriture comptable
  // `Transaction` et faussait le grand livre.
  if (order.payment.status === PaymentStatus.SUCCEEDED) {
    return { success: true, status: order.status };
  }

  // --- Chemin de statuts a parcourir, valide par la machine a etats (§15) ---
  const hops: OrderStatus[] = [];
  if (parsedOutcome.data === "SUCCESS") {
    // Reprise apres un echec precedent (bouton « Reessayer », §23).
    if (order.status === OrderStatus.PAYMENT_FAILED) {
      hops.push(OrderStatus.PAYMENT_PENDING);
    }
    hops.push(OrderStatus.PAYMENT_CONFIRMED, OrderStatus.FUNDS_SECURED);
  } else {
    hops.push(OrderStatus.PAYMENT_FAILED);
  }

  try {
    let running = order.status;
    for (const next of hops) {
      assertTransition(running, next);
      running = next;
    }
  } catch (error) {
    if (error instanceof InvalidOrderTransitionError) {
      return {
        success: false,
        error: "Cette commande n'est plus au stade du paiement.",
      };
    }
    throw error;
  }

  // --- Verdict du fournisseur (simule, deterministe) ---
  const provider = getPaymentProvider();
  const intent = await provider.initiate({
    orderReference: order.reference,
    amount: order.payment.amount,
    // Devise reelle de la commande, et non "XOF" en dur : le Cameroun est en
    // zone XAF (voir data/markets.ts).
    currency: order.currency,
  });
  const verdict = await provider.confirm(intent.providerRef, {
    simulateOutcome: parsedOutcome.data,
  });

  const succeeded = verdict.status === "SUCCEEDED";
  const finalStatus = hops[hops.length - 1];
  const now = new Date();
  // Capture avant la transaction : TypeScript ne conserve pas le narrowing de
  // `order.fund` a l'interieur de la closure.
  const securedAmount = order.fund.amount;
  // Total regle par le client (articles + livraison), a distinguer de la part
  // sequestree qui revient au vendeur (hors livraison).
  const paidAmount = order.payment.amount;

  try {
    await prisma.$transaction(async (tx) => {
      // Ecriture conditionnelle : si un appel concurrent a deja fait passer le
      // paiement, `count` vaut 0 et on abandonne sans rien dupliquer.
      const claimed = await tx.payment.updateMany({
        where: { orderId: order.id, status: PaymentStatus.PENDING },
        data: {
          status: succeeded ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED,
          simulatedOutcome: parsedOutcome.data,
          confirmedAt: succeeded ? now : null,
        },
      });

      // Le paiement etait en echec : on le remet en jeu pour cette tentative.
      if (claimed.count === 0) {
        const retried = await tx.payment.updateMany({
          where: { orderId: order.id, status: PaymentStatus.FAILED },
          data: {
            status: succeeded ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED,
            simulatedOutcome: parsedOutcome.data,
            confirmedAt: succeeded ? now : null,
          },
        });

        if (retried.count === 0) {
          throw new ConcurrentPaymentError();
        }
      }

      if (succeeded) {
        await tx.fund.update({
          where: { orderId: order.id },
          data: { secured: true, securedAt: now },
        });

        // §40 : le journal doit refleter tous les mouvements.
        // L'ecriture PAYMENT (ce que le client a effectivement regle) manquait :
        // seul FUNDS_SECURED etait inscrit, si bien que les frais de livraison
        // — la difference entre les deux — n'apparaissaient nulle part et
        // n'etaient imputes a personne.
        await tx.transaction.createMany({
          data: [
            {
              orderId: order.id,
              type: "PAYMENT",
              amount: paidAmount,
            },
            {
              orderId: order.id,
              type: "FUNDS_SECURED",
              amount: securedAmount,
            },
          ],
        });

        // Decompte du stock (§17), au paiement et non a la creation : un lien
        // de paiement jamais regle ne doit pas immobiliser l'inventaire. Le
        // `gte` empeche de passer sous zero si deux paiements aboutissent en
        // meme temps sur le dernier article ; `count` a 0 est alors accepte,
        // la vente ayant deja ete encaissee.
        for (const item of order.items) {
          await tx.product.updateMany({
            where: { id: item.productId, quantity: { gte: item.quantity } },
            data: { quantity: { decrement: item.quantity } },
          });
        }
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: finalStatus },
      });

      // Un enregistrement d'historique par saut, pour que la trace soit fidele.
      let from = order.status;
      for (const to of hops) {
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, fromStatus: from, toStatus: to },
        });
        from = to;
      }
    });
  } catch (error) {
    if (error instanceof ConcurrentPaymentError) {
      return {
        success: false,
        error: "Ce paiement a deja ete traite. Rafraichissez la page.",
      };
    }
    throw error;
  }

  revalidatePath(`/pay/${order.reference}`);

  if (!succeeded) {
    return { success: false, error: "Le paiement n'a pas abouti." };
  }

  return { success: true, status: finalStatus };
}

class ConcurrentPaymentError extends Error {
  constructor() {
    super("Paiement deja traite par un appel concurrent.");
    this.name = "ConcurrentPaymentError";
  }
}
