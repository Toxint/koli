"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/actions";
import { OrderStatus, PaymentStatus, PaymentProviderType, DeliveryStatus } from "@prisma/client";
import { z } from "zod";
import { findTransitionPath } from "@/lib/orders/statusMachine";

const orderSchema = z.object({
  buyerName: z.string().min(2, "Le nom du client est requis"),
  buyerPhone: z.string().min(8, "Numéro de téléphone du client invalide"),
  buyerCountry: z.string().default("Côte d'Ivoire"),
  buyerCity: z.string().min(2, "La ville est requise"),
  buyerAddress: z.string().min(3, "L'adresse de livraison est requise"),
  buyerLandmark: z.string().optional(),
  deliveryFee: z.coerce.number().min(0, "Frais de livraison invalides"),
  productName: z.string().min(2, "Le nom du produit est requis"),
  unitPrice: z.coerce.number().min(100, "Le prix unitaire doit être d'au moins 100 FCFA"),
  quantity: z.coerce.number().min(1, "La quantité doit être d'au moins 1"),
});

export async function createOrderAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    return { success: false, error: "Vous devez être connecté en tant que Vendeur." };
  }

  const rawData = {
    buyerName: formData.get("buyerName") as string,
    buyerPhone: formData.get("buyerPhone") as string,
    buyerCountry: (formData.get("buyerCountry") as string) || "Côte d'Ivoire",
    buyerCity: formData.get("buyerCity") as string,
    buyerAddress: formData.get("buyerAddress") as string,
    buyerLandmark: formData.get("buyerLandmark") as string || undefined,
    deliveryFee: formData.get("deliveryFee") as string,
    productName: formData.get("productName") as string,
    unitPrice: formData.get("unitPrice") as string,
    quantity: formData.get("quantity") as string,
  };

  const validation = orderSchema.safeParse(rawData);
  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        fieldErrors[issue.path[0] as string] = issue.message;
      }
    });
    return { success: false, error: "Veuillez vérifier les champs du formulaire", fieldErrors };
  }

  const data = validation.data;
  const sellerProfileId = user.sellerProfile.id;

  // Generate reference KOLI-XXXXXX
  const count = await prisma.order.count();
  const refNum = (count + 125).toString().padStart(6, "0");
  const reference = `KOLI-${refNum}`;

  // Find or create product
  let product = await prisma.product.findFirst({
    where: {
      sellerId: sellerProfileId,
      name: { equals: data.productName },
    },
  });

  if (!product) {
    product = await prisma.product.create({
      data: {
        sellerId: sellerProfileId,
        name: data.productName,
        price: data.unitPrice,
        quantity: 100,
        status: "ACTIVE",
      },
    });
  }

  // Calculate total item price
  const totalItemAmount = data.unitPrice * data.quantity;
  const grandTotal = totalItemAmount + data.deliveryFee;

  // Generate 4-digit OTP code for delivery validation
  const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

  // Find default driver if available
  const firstDriver = await prisma.driverProfile.findFirst();

  // Create Order in DB
  const order = await prisma.order.create({
    data: {
      reference,
      sellerId: sellerProfileId,
      buyerName: data.buyerName,
      buyerPhone: data.buyerPhone,
      buyerCountry: data.buyerCountry,
      buyerCity: data.buyerCity,
      buyerAddress: data.buyerAddress,
      buyerLandmark: data.buyerLandmark,
      deliveryFee: data.deliveryFee,
      status: OrderStatus.PAYMENT_PENDING,
      items: {
        create: [
          {
            productId: product.id,
            quantity: data.quantity,
            unitPrice: data.unitPrice,
          },
        ],
      },
      payment: {
        create: {
          provider: PaymentProviderType.TEST,
          status: PaymentStatus.PENDING,
          amount: grandTotal,
        },
      },
      fund: {
        create: {
          sellerId: sellerProfileId,
          amount: totalItemAmount,
          secured: false,
          released: false,
        },
      },
      delivery: {
        create: {
          driverId: firstDriver?.id || null,
          status: DeliveryStatus.ASSIGNED,
          otpCodes: {
            create: [
              {
                code: otpCode,
              },
            ],
          },
        },
      },
      statusHistory: {
        create: [
          {
            fromStatus: null,
            toStatus: OrderStatus.DRAFT,
            actorUserId: user.id,
          },
          {
            fromStatus: OrderStatus.DRAFT,
            toStatus: OrderStatus.PAYMENT_PENDING,
            actorUserId: user.id,
          },
        ],
      },
    },
  });

  return {
    success: true,
    reference: order.reference,
    redirectTo: `/pay/${order.reference}`,
  };
}

export type ConfirmReceptionResult =
  | { success: true; status: OrderStatus }
  | { success: false; error: string };

/**
 * Confirmation de reception par le client (§29).
 *
 * « Avez-vous recu votre commande ? » -> « Oui, j'ai recu ma commande »
 * declenche CUSTOMER_CONFIRMED puis FUNDS_RELEASED puis COMPLETED.
 *
 * C'est le seul chemin normal vers la liberation des fonds : la validation OTP
 * du livreur marque la commande livree, elle ne paie pas le vendeur. Le second
 * chemin possible est la resolution d'un litige par un administrateur (§32),
 * qui sera implemente en phase 21.
 *
 * Autorisation : comme pour le paiement, c'est la possession de la reference
 * (contenue dans le lien recu par l'acheteur) qui fait office de capacite —
 * l'achat invite est explicitement prevu.
 *
 * La liberation est bornee a `{ orderId }` : elle ne doit toucher que les fonds
 * de CETTE commande.
 */
export async function confirmReceptionAction(
  reference: string
): Promise<ConfirmReceptionResult> {
  if (typeof reference !== "string" || reference.trim().length === 0) {
    return { success: false, error: "Reference de commande manquante." };
  }

  const order = await prisma.order.findUnique({
    where: { reference: reference.trim() },
    include: { fund: true },
  });

  if (!order || !order.fund) {
    return { success: false, error: "Commande introuvable." };
  }

  // --- Idempotence (§30) : les fonds ne se liberent jamais deux fois. ---
  if (order.fund.released) {
    return { success: true, status: order.status };
  }

  if (order.status === OrderStatus.DISPUTE_OPEN) {
    return {
      success: false,
      error:
        "Un litige est ouvert sur cette commande. Les fonds restent bloques jusqu'a sa resolution.",
    };
  }

  const path = findTransitionPath(order.status, OrderStatus.FUNDS_RELEASED);

  if (path === null) {
    return {
      success: false,
      error:
        "Cette commande n'a pas encore ete livree. La confirmation sera possible des reception du colis.",
    };
  }

  const now = new Date();
  const releasedAmount = order.fund.amount;

  try {
    await prisma.$transaction(async (tx) => {
      // Ecriture conditionnelle : seule cette commande, et seulement si ses
      // fonds sont bien sous sequestre et pas encore liberes.
      const released = await tx.fund.updateMany({
        where: { orderId: order.id, secured: true, released: false },
        data: { released: true, releasedAt: now },
      });

      if (released.count === 0) {
        throw new FundsAlreadyReleasedError();
      }

      await tx.transaction.create({
        data: {
          orderId: order.id,
          type: "FUNDS_RELEASED",
          amount: releasedAmount,
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.FUNDS_RELEASED },
      });

      let from = order.status;
      for (const to of path) {
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, fromStatus: from, toStatus: to },
        });
        from = to;
      }
    });
  } catch (error) {
    if (error instanceof FundsAlreadyReleasedError) {
      return {
        success: false,
        error: "Les fonds de cette commande ont deja ete liberes.",
      };
    }
    throw error;
  }

  revalidatePath(`/pay/${order.reference}`);
  revalidatePath("/client/dashboard");
  revalidatePath("/seller/dashboard");

  return { success: true, status: OrderStatus.FUNDS_RELEASED };
}

class FundsAlreadyReleasedError extends Error {
  constructor() {
    super("Fonds deja liberes par un appel concurrent.");
    this.name = "FundsAlreadyReleasedError";
  }
}
