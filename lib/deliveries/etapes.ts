"use server";

import { revalidatePath } from "next/cache";
import { DeliveryStatus, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/actions";
import { findTransitionPath } from "@/lib/orders/statusMachine";
import { partiesDeLaCommande, notifier } from "@/lib/notifications/envoi";
import { jalonParCode, prochainJalonLivreur } from "@/lib/deliveries/jalons";

export type ResultatJalon =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Avancement de la livraison, jalon par jalon (§26).
 *
 * Trois règles, chacune apprise d'un défaut déjà rencontré ailleurs dans ce
 * projet :
 *
 * **1. Propriété de la livraison.** Le contrôle de rôle ne suffit pas : sans
 * vérification de `driverId`, n'importe quel livreur authentifié ferait
 * avancer la course d'un autre.
 *
 * **2. Le jalon posé est celui que la livraison ATTEND**, jamais celui que le
 * formulaire demande. Le code envoyé sert seulement à confirmer l'intention ;
 * un double appui, deux onglets ou un renvoi de formulaire ne peuvent donc ni
 * sauter une étape ni en rejouer une.
 *
 * **3. Rien ici ne conditionne l'argent.** Les jalons informent le client ; la
 * remise reste attestée par le code de réception (§27), et le versement par la
 * confirmation du client (§29). Un livreur qui marquerait « arrivé » sans
 * l'être ne débloque rien.
 */
export async function poserJalonLivraisonAction(
  deliveryId: string,
  codeJalon: string
): Promise<ResultatJalon> {
  const utilisateur = await getCurrentUser();
  if (!utilisateur || utilisateur.role !== "DRIVER" || !utilisateur.driverProfile) {
    return { success: false, error: "Réservé aux livreurs." };
  }

  const demande = jalonParCode(codeJalon);
  if (!demande || demande.acteur !== "livreur") {
    return { success: false, error: "Étape inconnue." };
  }

  const livraison = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: { order: { select: { id: true, reference: true, status: true } } },
  });

  if (!livraison) {
    return { success: false, error: "Livraison introuvable." };
  }

  // Règle 1 : la course doit être la sienne.
  if (livraison.driverId !== utilisateur.driverProfile.id) {
    return { success: false, error: "Cette livraison ne vous est pas assignée." };
  }

  if (livraison.status === DeliveryStatus.CONFIRMED) {
    return { success: false, error: "Cette livraison est déjà terminée." };
  }

  // Règle 2 : on pose l'étape ATTENDUE, pas celle qu'on demande.
  const attendu = prochainJalonLivreur(livraison.status);

  if (attendu === null) {
    return {
      success: false,
      error:
        "Toutes les étapes sont franchies. Il reste à saisir le code de réception du client.",
    };
  }

  if (attendu.code !== demande.code) {
    // Déjà franchie : ce n'est pas une erreur, l'état voulu est atteint.
    const dejaFranchie =
      prochainJalonLivreur(livraison.status) === null ||
      JALON_RANG[demande.code] < JALON_RANG[attendu.code];

    if (dejaFranchie) {
      return { success: true, message: "Cette étape est déjà enregistrée." };
    }

    return {
      success: false,
      error: `Étape suivante : « ${attendu.actionLivreur} ».`,
    };
  }

  const maintenant = new Date();
  const chemin = findTransitionPath(
    livraison.order.status,
    attendu.statutCommande
  );

  if (chemin === null) {
    return {
      success: false,
      error:
        "Cette commande n'est pas dans un état permettant d'avancer la livraison.",
    };
  }

  await prisma.$transaction(async (tx) => {
    // Écriture conditionnelle sur l'état de départ : deux appels simultanés
    // n'en font aboutir qu'un.
    const avance = await tx.delivery.updateMany({
      where: { id: livraison.id, status: livraison.status },
      data: {
        status: attendu.statutLivraison,
        ...(attendu.statutLivraison === DeliveryStatus.PICKED_UP
          ? { pickedUpAt: maintenant }
          : {}),
        ...(attendu.statutLivraison === DeliveryStatus.ARRIVED
          ? { arrivedAt: maintenant }
          : {}),
      },
    });

    if (avance.count === 0) throw new JalonConcurrentError();

    if (chemin.length > 0) {
      await tx.order.update({
        where: { id: livraison.order.id },
        data: { status: attendu.statutCommande },
      });

      // Un enregistrement par saut : l'historique doit être fidèle, même
      // quand la machine à états traverse un état de passage.
      let depuis = livraison.order.status;
      for (const vers of chemin) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: livraison.order.id,
            fromStatus: depuis,
            toStatus: vers,
            actorUserId: utilisateur.id,
          },
        });
        depuis = vers;
      }
    }

    // §44 : c'est tout l'objet de ces jalons — le client suivait son colis
    // sans rien savoir entre l'expédition et la remise.
    const parties = await partiesDeLaCommande(tx, livraison.order.id);

    await notifier(tx, {
      type: TYPE_NOTIFICATION[attendu.code],
      entite: "Order",
      entiteId: livraison.order.reference,
      destinataires: [parties.client],
      exclure: utilisateur.id,
    });
  });

  revalidatePath("/livreur/dashboard");
  revalidatePath(`/pay/${livraison.order.reference}`);
  revalidatePath("/vendeur/commandes");

  return { success: true, message: `Enregistré : ${attendu.libelleClient}.` };
}

class JalonConcurrentError extends Error {}

/** Rang de chaque jalon livreur, pour distinguer « déjà fait » de « trop tôt ». */
const JALON_RANG: Record<string, number> = {
  RECUPERE: 0,
  EN_ROUTE: 1,
  ARRIVE: 2,
};

const TYPE_NOTIFICATION: Record<string, NotificationType> = {
  RECUPERE: NotificationType.PICKED_UP,
  EN_ROUTE: NotificationType.IN_TRANSIT,
  ARRIVE: NotificationType.ARRIVED,
};

/**
 * Le vendeur declare le colis pret (§26 — « COLIS A RECUPERER »).
 *
 * C'est le seul jalon qui lui appartienne : il sait, lui, quand le colis est
 * emballe. L'assignation d'un livreur ne suffit pas — un vendeur designe
 * souvent son livreur avant d'avoir fini de preparer.
 *
 * Le livreur en est prevenu : sans avis, il devrait passer au hasard ou
 * telephoner.
 */
export async function declarerColisPretAction(
  orderReference: string
): Promise<ResultatJalon> {
  const utilisateur = await getCurrentUser();
  if (!utilisateur || utilisateur.role !== "SELLER" || !utilisateur.sellerProfile) {
    return { success: false, error: "Réservé aux vendeurs." };
  }

  const commande = await prisma.order.findUnique({
    where: { reference: String(orderReference).trim() },
    include: { delivery: true },
  });

  if (!commande) {
    return { success: false, error: "Commande introuvable." };
  }

  // Propriete : un vendeur ne declare pas le colis d'un concurrent.
  if (commande.sellerId !== utilisateur.sellerProfile.id) {
    return { success: false, error: "Cette commande ne vous appartient pas." };
  }

  if (!commande.delivery?.driverId) {
    return {
      success: false,
      error: "Assignez d'abord un livreur : c'est lui qui sera prévenu.",
    };
  }

  // Deja pret, ou plus loin : l'etat voulu est atteint, ce n'est pas une erreur.
  if (commande.delivery.status !== DeliveryStatus.ASSIGNED) {
    return { success: true, message: "Le livreur est déjà prévenu." };
  }

  const jalon = jalonParCode("PRET")!;
  const chemin = findTransitionPath(commande.status, jalon.statutCommande);

  if (chemin === null) {
    return {
      success: false,
      error: "Cette commande n'est pas au stade de la préparation du colis.",
    };
  }

  await prisma.$transaction(async (tx) => {
    const avance = await tx.delivery.updateMany({
      where: { id: commande.delivery!.id, status: DeliveryStatus.ASSIGNED },
      data: { status: DeliveryStatus.TO_PICK_UP },
    });

    if (avance.count === 0) throw new JalonConcurrentError();

    if (chemin.length > 0) {
      await tx.order.update({
        where: { id: commande.id },
        data: { status: jalon.statutCommande },
      });

      let depuis = commande.status;
      for (const vers of chemin) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: commande.id,
            fromStatus: depuis,
            toStatus: vers,
            actorUserId: utilisateur.id,
          },
        });
        depuis = vers;
      }
    }

    const parties = await partiesDeLaCommande(tx, commande.id);
    const compteLivreur = await tx.driverProfile.findUnique({
      where: { id: commande.delivery!.driverId! },
      select: { userId: true },
    });

    await notifier(tx, {
      type: NotificationType.PACKAGE_READY,
      entite: "Order",
      entiteId: commande.reference,
      destinataires: [compteLivreur?.userId, parties.client],
      exclure: utilisateur.id,
    });
  });

  revalidatePath("/vendeur/commandes");
  revalidatePath("/livreur/dashboard");
  revalidatePath(`/pay/${commande.reference}`);

  return { success: true, message: "Le livreur est prévenu que le colis est prêt." };
}
