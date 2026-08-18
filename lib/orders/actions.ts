"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/actions";
import { OrderStatus, PaymentStatus, PaymentProviderType, DeliveryStatus } from "@prisma/client";
import { z } from "zod";

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
