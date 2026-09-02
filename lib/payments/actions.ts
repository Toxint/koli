"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getPaymentProvider } from "@/lib/config/mode";
import {
  appliquerAboutissement,
  cheminDePaiement,
  MOTIF_TRANSITION_ILLEGALE,
} from "@/lib/payments/aboutissement";

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
    select: {
      id: true,
      reference: true,
      currency: true,
      status: true,
      payment: { select: { id: true, amount: true, status: true, idempotencyKey: true } },
    },
  });

  if (!order || !order.payment) {
    return { success: false, error: "Commande introuvable." };
  }

  // Idempotence (§30) : un paiement deja abouti ne se rejoue pas. Le controle
  // est refait par `appliquerAboutissement`, mais on s'arrete AVANT d'appeler
  // le fournisseur : lui redemander une intention pour un paiement conclu est
  // au mieux inutile, au pire un second prelevement.
  if (order.payment.status === PaymentStatus.SUCCEEDED) {
    const dejaFait = await prisma.order.findUnique({
      where: { id: order.id },
      select: { status: true },
    });
    return { success: true, status: dejaFait!.status };
  }

  /*
   * La transition est verifiee AVANT de contacter le prestataire.
   *
   * `appliquerAboutissement` la verifie aussi — c'est elle qui ecrit, c'est
   * donc elle qui doit garder la porte. Mais elle n'intervient qu'apres
   * `initiate()` et `confirm()` : s'y fier seulement reviendrait a demander une
   * intention de paiement pour une commande deja livree. Le defaut penche du
   * cote qui ne preleve rien.
   */
  if (!cheminDePaiement(order.status, parsedOutcome.data === "SUCCESS")) {
    return { success: false, error: MOTIF_TRANSITION_ILLEGALE };
  }

  const provider = getPaymentProvider();

  /**
   * Clef d'idempotence (§29).
   *
   * Les agregateurs l'exigent : sans elle, un renvoi de requete apres une
   * coupure reseau cree un SECOND prelevement — sur l'argent reel de
   * quelqu'un.
   *
   * Elle est REUTILISEE tant que le paiement est en cours : deux appuis sur le
   * bouton doivent designer la meme transaction. Une nouvelle tentative apres
   * echec en obtient une neuve, parce que c'est bien une nouvelle demande.
   */
  const cleIdempotence =
    order.payment.idempotencyKey ?? `koli_${order.reference}_${randomUUID()}`;

  const intent = await provider.initiate({
    orderReference: order.reference,
    amount: order.payment.amount,
    // Devise reelle de la commande, et non "XOF" en dur : le Cameroun est en
    // zone XAF (voir data/markets.ts).
    currency: order.currency,
    idempotencyKey: cleIdempotence,
  });

  // La reference du fournisseur est CONSERVEE. Elle etait produite puis jetee :
  // un rappel asynchrone — le mode normal en Mobile Money — n'avait alors aucun
  // moyen de retrouver le paiement concerne.
  await prisma.payment.update({
    where: { id: order.payment.id },
    data: {
      providerRef: intent.providerRef,
      idempotencyKey: cleIdempotence,
      ...(intent.expiresAt ? { expiresAt: intent.expiresAt } : {}),
    },
  });

  const verdict = await provider.confirm(intent.providerRef, {
    simulateOutcome: parsedOutcome.data,
  });

  /*
   * Les CONSEQUENCES du paiement ne vivent plus ici.
   *
   * Elles etaient enfermees dans cette action, donc dans le chemin SIMULE. Le
   * rappel du prestataire — le seul chemin qui existe en mode reel — notait le
   * paiement abouti et s'arretait la : aucun sequestre, aucune facture, aucune
   * notification, et une commande invisible du vendeur. Voir
   * `lib/payments/aboutissement.ts`.
   */
  const applique = await appliquerAboutissement(
    order.reference,
    verdict.status === "SUCCEEDED",
    { simulatedOutcome: parsedOutcome.data }
  );

  revalidatePath(`/pay/${order.reference}`);

  if (!applique.ok) {
    return { success: false, error: applique.motif };
  }

  if (verdict.status !== "SUCCEEDED") {
    return { success: false, error: "Le paiement n'a pas abouti." };
  }

  return { success: true, status: applique.status };
}


/**
 * L'état actuel d'une commande, pour l'écran de paiement.
 *
 * Après un paiement iKeePay, le tunnel poste `ikeepay-success` au navigateur —
 * un message CLIENT, que n'importe qui peut émettre depuis la console. Il ne
 * conclut donc rien : il indique seulement qu'il est temps de **demander au
 * serveur** où en est la commande. Le verdict, lui, arrive par le rappel signé
 * (`/api/paiements/rappel`), et c'est la base qui fait foi.
 *
 * Ne renvoie que le STATUT. Pas le montant, pas l'acheteur, pas la référence
 * du fournisseur : l'écran a déjà tout cela, et un point d'entrée qui en dit
 * plus que nécessaire finit par en dire trop.
 *
 * La référence fait office de capacité — c'est elle qui circule dans le lien
 * de paiement (`lib/orders/reference.ts`). Qui l'a peut déjà voir cette page ;
 * lire le statut n'ajoute donc aucun accès.
 */
export async function etatDeLaCommandeAction(
  reference: string
): Promise<{ status: OrderStatus } | null> {
  if (typeof reference !== "string" || reference.trim().length === 0) {
    return null;
  }

  const commande = await prisma.order.findUnique({
    where: { reference: reference.trim() },
    select: { status: true },
  });

  return commande ? { status: commande.status } : null;
}
