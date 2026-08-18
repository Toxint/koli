"use server";

import { prisma } from "@/lib/db/prisma";
import { OrderStatus, PaymentStatus } from "@prisma/client";

export async function simulatePaymentAction(orderId: string, outcome: "SUCCESS" | "FAILURE") {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payment: true, fund: true },
  });

  if (!order) {
    return { success: false, error: "Commande introuvable" };
  }

  if (outcome === "SUCCESS") {
    // Update payment, fund, and order status in Prisma
    await prisma.$transaction([
      prisma.payment.update({
        where: { orderId: order.id },
        data: {
          status: PaymentStatus.SUCCEEDED,
          simulatedOutcome: "SUCCESS",
          confirmedAt: new Date(),
        },
      }),
      prisma.fund.update({
        where: { orderId: order.id },
        data: {
          secured: true,
          securedAt: new Date(),
        },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.FUNDS_SECURED,
        },
      }),
      prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: OrderStatus.FUNDS_SECURED,
        },
      }),
      prisma.transaction.create({
        data: {
          orderId: order.id,
          type: "FUNDS_SECURED",
          amount: order.payment?.amount || 0,
        },
      }),
    ]);

    return { success: true, status: OrderStatus.FUNDS_SECURED };
  } else {
    await prisma.$transaction([
      prisma.payment.update({
        where: { orderId: order.id },
        data: {
          status: PaymentStatus.FAILED,
          simulatedOutcome: "FAILURE",
        },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAYMENT_FAILED,
        },
      }),
    ]);

    return { success: false, error: "Échec du paiement simulé." };
  }
}
