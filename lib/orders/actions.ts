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
import { preleverCommission } from "@/lib/finance/commission";
import { ACTIONS_AUDIT, consigner } from "@/lib/audit/journal";
import { partiesDeLaCommande, notifier } from "@/lib/notifications/envoi";
import { getPaymentMode } from "@/lib/config/mode";

/**
 * Le mode de paiement courant, dans le vocabulaire du schema.
 *
 * La correspondance est EXPLICITE et non derivee de `provider.id` : un
 * identifiant de fournisseur est une chaine libre, une valeur d'enum est un
 * contrat avec la base. Les lier par une conversion ferait echouer une
 * insertion le jour ou quelqu'un renomme un identifiant — au moment de
 * l'encaissement, c'est-a-dire au pire moment.
 */
function fournisseurEnBase(): PaymentProviderType {
  switch (getPaymentMode()) {
    case "ikeepay":
      return PaymentProviderType.IKEEPAY;
    case "test":
    default:
      return PaymentProviderType.TEST;
  }
}


const orderSchema = z.object({
  buyerName: z.string().min(2, "Le nom du client est requis"),
  buyerPhone: z.string().min(8, "Numéro de téléphone du client invalide"),
  buyerCountry: z.string().default("Côte d'Ivoire"),
  buyerCity: z.string().min(2, "La ville est requise"),
  buyerAddress: z.string().min(3, "L'adresse de livraison est requise"),
  buyerLandmark: z.string().optional(),
  // Facultatif : la plupart des acheteurs n'en ont pas. Chaine vide toleree,
  // le champ etant optionnel dans le formulaire.
  buyerEmail: z.string().email("Email du client invalide").optional().or(z.literal("")),
  // Montants en FCFA : entiers obligatoires, la base les stocke en Int.
  // Sans `.int()`, une saisie comme 1500.7 passait la validation et faisait
  // echouer Prisma a l'ecriture.
  deliveryFee: z.coerce.number().int("Frais de livraison invalides").min(0, "Frais de livraison invalides"),
  // Produit issu du catalogue (§16). Vide = saisie libre, conservee pour la
  // vente ponctuelle d'un article non catalogue.
  productId: z.string().optional(),
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
    buyerEmail: (formData.get("buyerEmail") as string) || undefined,
    deliveryFee: formData.get("deliveryFee") as string,
    productId: (formData.get("productId") as string) || undefined,
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

  // Resolution du produit (§16-17).
  //
  // Avant le catalogue, cette action cherchait un produit par egalite de nom et
  // en creait un au vol sinon : deux orthographes donnaient deux fiches, le
  // stock etait invente a 100, et le prix du catalogue n'etait jamais consulte.
  // Desormais le vendeur choisit dans son catalogue ; la saisie libre reste
  // possible pour l'article ponctuel, mais cree une vraie fiche a stock nul.
  let product;
  let prixUnitaire = data.unitPrice;

  if (data.productId) {
    // Filtrer sur `sellerId` fait office de controle de propriete : un
    // identifiant d'un autre vendeur est simplement introuvable.
    product = await prisma.product.findFirst({
      where: { id: data.productId, sellerId: sellerProfileId },
    });

    if (!product) {
      return {
        success: false,
        error: "Ce produit n'existe pas dans votre catalogue.",
        fieldErrors: { productId: "Produit introuvable." },
      };
    }

    if (product.status !== "ACTIVE") {
      return {
        success: false,
        error: "Ce produit a été retiré de votre catalogue.",
        fieldErrors: { productId: "Produit retiré du catalogue." },
      };
    }

    if (product.quantity < data.quantity) {
      return {
        success: false,
        error:
          product.quantity === 0
            ? `${product.name} est en rupture de stock.`
            : `Stock insuffisant : il reste ${product.quantity} unité(s) de ${product.name}.`,
        fieldErrors: { quantity: `Stock disponible : ${product.quantity}.` },
      };
    }

    // Le prix fait foi cote catalogue : c'est ce qui garantit qu'un lien de
    // paiement ne peut pas etre genere a un montant fabrique cote client.
    prixUnitaire = product.price;
  } else {
    const existant = await prisma.product.findFirst({
      where: { sellerId: sellerProfileId, name: data.productName },
    });

    product =
      existant ??
      (await prisma.product.create({
        data: {
          sellerId: sellerProfileId,
          name: data.productName,
          price: data.unitPrice,
          // Stock a 0 et non 100 : rien ne justifie d'inventer un inventaire.
          // Le vendeur le renseignera depuis son catalogue.
          quantity: 0,
          status: "ACTIVE",
        },
      }));
  }

  // Montants.
  // Convention : `Payment.amount` est le total regle par le client (articles +
  // livraison), tandis que `Fund.amount` est ce qui revient au vendeur, donc
  // hors frais de livraison. Les deux ne sont volontairement pas egaux.
  // La commission KOLI (§41) porte sur `Fund.amount` et n'est prelevee qu'a la
  // liberation des fonds : voir lib/finance/commission.ts.
  const totalItemAmount = prixUnitaire * data.quantity;
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
      buyerEmail: data.buyerEmail ? data.buyerEmail.toLowerCase() : null,
      deliveryFee: data.deliveryFee,
      currency: deviseDuPays(data.buyerCountry),
      status: OrderStatus.PAYMENT_PENDING,
      items: {
        create: [
          {
            productId: product.id,
            quantity: data.quantity,
            // Prix fige a la commande : modifier le catalogue plus tard ne doit
            // pas reecrire le montant d'une vente deja conclue.
            unitPrice: prixUnitaire,
          },
        ],
      },
      payment: {
        create: {
          /*
           * Le fournisseur REEL, pas TEST en dur.
           *
           * C'etait ecrit en dur, et rien ne le signalait tant que le mode
           * reel n'avait jamais tourne. Une commande encaissee par iKeePay
           * aurait porte la mention TEST dans le registre — et c'est
           * exactement la colonne qu'on lit pour rapprocher nos ecritures de
           * leur releve. Un journal financier qui se trompe de payeur ne se
           * rattrape pas apres coup.
           */
          provider: fournisseurEnBase(),
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

      // §41 : la commission KOLI est prélevée ici, sur l'argent effectivement
      // remis au vendeur — jamais au paiement, puisqu'une commande peut encore
      // finir remboursée. Dans la MÊME transaction que la libération : une
      // libération sans sa commission serait un manque à gagner invisible.
      await preleverCommission(tx, {
        orderId: order.id,
        assiette: releasedAmount,
      });

      // §48, dont c'est l'exemple même : « ACTION: FUNDS_RELEASE_TEST ».
      // L'acteur est ici le CLIENT, pas un administrateur : c'est lui qui, en
      // confirmant la réception, déclenche le versement au vendeur.
      await consigner(tx, {
        acteur: { id: user.id, name: user.name, role: user.role },
        action: ACTIONS_AUDIT.FUNDS_RELEASE_TEST,
        entite: "Order",
        entiteId: order.reference,
        details: { montant: `${releasedAmount} FCFA` },
      });

      // §44 : le vendeur apprend qu'il est regle. C'est l'aboutissement de
      // toute la promesse KOLI — il n'en etait prevenu par rien.
      const parties = await partiesDeLaCommande(tx, order.id);

      await notifier(tx, {
        type: "FUNDS_RELEASED",
        entite: "Order",
        entiteId: order.reference,
        destinataires: [parties.vendeur],
        exclure: user.id,
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
