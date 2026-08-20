"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/actions";
import { OrderStatus, PaymentStatus, PaymentProviderType, DeliveryStatus } from "@prisma/client";
import { z } from "zod";
import { findTransitionPath } from "@/lib/orders/statusMachine";
import { generateOrderReference } from "@/lib/orders/reference";
import { deviseDuPays } from "@/data/markets";

const orderSchema = z.object({
  buyerName: z.string().min(2, "Le nom du client est requis"),
  buyerPhone: z.string().min(8, "Numéro de téléphone du client invalide"),
  buyerCountry: z.string().default("Côte d'Ivoire"),
  buyerCity: z.string().min(2, "La ville est requise"),
  buyerAddress: z.string().min(3, "L'adresse de livraison est requise"),
  buyerLandmark: z.string().optional(),
  // Montants en FCFA : entiers obligatoires, la base les stocke en Int.
  // Sans `.int()`, une saisie comme 1500.7 passait la validation et faisait
  // echouer Prisma a l'ecriture.
  deliveryFee: z.coerce.number().int("Frais de livraison invalides").min(0, "Frais de livraison invalides"),
  productName: z.string().min(2, "Le nom du produit est requis"),
  unitPrice: z.coerce.number().int("Le prix unitaire doit être un nombre entier").min(100, "Le prix unitaire doit être d'au moins 100 FCFA"),
  quantity: z.coerce.number().int("La quantité doit être un nombre entier").min(1, "La quantité doit être d'au moins 1"),
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

  // Reference non devinable : elle sert de capacite d'acces au lien de
  // paiement (voir lib/orders/reference.ts).
  const reference = generateOrderReference();

  // Rattachement a un compte client existant, identifie par le telephone.
  // Sans cela, `customerId` restait toujours nul et les commandes creees par
  // le vendeur n'apparaissaient JAMAIS dans l'espace client.
  const compteClient = await prisma.customerProfile.findFirst({
    where: { user: { phone: data.buyerPhone } },
    select: { id: true },
  });

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

  // Montants.
  // Convention : `Payment.amount` est le total regle par le client (articles +
  // livraison), tandis que `Fund.amount` est ce qui revient au vendeur, donc
  // hors frais de livraison. Les deux ne sont volontairement pas egaux.
  // La commission KOLI (§41) sera prelevee sur Fund.amount en phase 19.
  const totalItemAmount = data.unitPrice * data.quantity;
  const grandTotal = totalItemAmount + data.deliveryFee;

  // Code de reception remis au client (§27). randomInt (crypto) et non
  // Math.random : ce code conditionne la remise du colis.
  const otpCode = randomInt(1000, 10000).toString();

  const order = await prisma.order.create({
    data: {
      reference,
      sellerId: sellerProfileId,
      customerId: compteClient?.id ?? null,
      buyerName: data.buyerName,
      buyerPhone: data.buyerPhone,
      buyerCountry: data.buyerCountry,
      buyerCity: data.buyerCity,
      buyerAddress: data.buyerAddress,
      buyerLandmark: data.buyerLandmark,
      deliveryFee: data.deliveryFee,
      currency: deviseDuPays(data.buyerCountry),
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
          // Aucun livreur a la creation : l'assignation est un acte explicite
          // du vendeur (§26), via `assignDriverAction`. Le code precedent
          // prenait le premier livreur venu et l'assignait a toutes les
          // commandes de la plateforme.
          driverId: null,
          status: DeliveryStatus.UNASSIGNED,
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
 * AUTORISATION — point critique.
 *
 * Contrairement au paiement, la possession de la reference ne peut PAS servir
 * de capacite ici. La reference est precisement ce que le vendeur partage : il
 * l'a dans son tableau de bord, et le livreur la voit sur sa fiche de course.
 * S'en contenter reviendrait a laisser le vendeur — et le livreur — declencher
 * le versement au vendeur. Toute la garantie KOLI (§29, §82) s'effondrerait.
 *
 * On exige donc une session client rattachee a cette commande. L'acheteur
 * invite dont le telephone correspond peut revendiquer sa commande en se
 * connectant : le rattachement se fait alors automatiquement.
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

  const user = await getCurrentUser();

  if (!user) {
    return {
      success: false,
      error:
        "Connectez-vous a votre compte client pour confirmer la reception de cette commande.",
    };
  }

  // Le vendeur de la commande ne peut jamais se payer lui-meme, meme s'il est
  // par ailleurs client sur la plateforme.
  if (user.sellerProfile && user.sellerProfile.id === order.sellerId) {
    return {
      success: false,
      error:
        "Seul le client peut confirmer la reception. Un vendeur ne peut pas valider sa propre commande.",
    };
  }

  const estLeClient =
    (order.customerId !== null &&
      user.customerProfile?.id === order.customerId) ||
    // Commande passee en mode invite : l'acheteur la revendique par son numero.
    (order.customerId === null &&
      user.customerProfile != null &&
      user.phone === order.buyerPhone);

  if (!estLeClient) {
    return {
      success: false,
      error: "Cette commande n'est pas rattachee a votre compte client.",
    };
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

  // Seule une commande effectivement livree peut etre confirmee.
  //
  // On ne passe volontairement PAS par findTransitionPath ici : celui-ci
  // trouverait un chemin depuis FUNDS_SECURED en traversant toute la chaine de
  // livraison, et le client pourrait donc « confirmer » un colis jamais parti —
  // ce qui viderait la garantie KOLI de son sens. La traversee multi-sauts n'a
  // de sens que pour le livreur, qui a physiquement remis le colis.
  const departsAutorises: OrderStatus[] = [
    OrderStatus.DELIVERED,
    // Reprise si une tentative precedente s'est interrompue entre les deux etapes.
    OrderStatus.CUSTOMER_CONFIRMED,
  ];

  if (!departsAutorises.includes(order.status)) {
    return {
      success: false,
      error:
        "Cette commande n'a pas encore ete livree. La confirmation sera possible des reception du colis.",
    };
  }

  // §29 : « CUSTOMER_CONFIRMED puis FUNDS_RELEASED puis COMPLETED ».
  // La chaine s'arretait a FUNDS_RELEASED : COMPLETED n'etait jamais atteint.
  const path = findTransitionPath(order.status, OrderStatus.COMPLETED);

  if (path === null) {
    return {
      success: false,
      error: "Cette commande ne peut pas etre confirmee dans son etat actuel.",
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
        data: {
          status: OrderStatus.COMPLETED,
          // Rattachement d'une commande passee en mode invite au compte qui
          // vient de la revendiquer : elle apparaitra desormais dans son espace.
          ...(order.customerId === null && user.customerProfile
            ? { customerId: user.customerProfile.id }
            : {}),
        },
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
  revalidatePath("/vendeur/dashboard");

  return { success: true, status: OrderStatus.COMPLETED };
}

class FundsAlreadyReleasedError extends Error {
  constructor() {
    super("Fonds deja liberes par un appel concurrent.");
    this.name = "FundsAlreadyReleasedError";
  }
}
