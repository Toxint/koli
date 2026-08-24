import type { NotificationType, Prisma } from "@prisma/client";

/**
 * Notifications (§44-45).
 *
 * Le modèle `Notification` existait en base et n'était **jamais écrit**. Un
 * vendeur n'apprenait donc jamais qu'un client venait de payer, et un client
 * n'apprenait jamais que son colis avait été remis : chacun devait retourner
 * voir de lui-même. C'est le manque le plus visible du produit.
 *
 * **Mode test : aucun SMS, aucun e-mail.** Les notifications vivent en base et
 * s'affichent dans l'application. Le jour où un fournisseur SMS sera choisi,
 * il n'y aura qu'un adaptateur à brancher ici — exactement comme
 * `PaymentProvider` pour les paiements.
 *
 * Trois règles gouvernent ce fichier.
 *
 * **1. Une ligne par destinataire.** Une notification n'est pas un message
 * diffusé : l'état « lu » appartient à chaque personne. Deux destinataires du
 * même événement obtiennent deux lignes.
 *
 * **2. On ne notifie jamais l'auteur de sa propre action.** Le vendeur qui
 * assigne un livreur n'a pas besoin qu'on lui apprenne qu'il vient de le
 * faire. Une boîte pleine de ses propres gestes cesse d'être lue — et le jour
 * où une vraie information y arrive, elle passe inaperçue.
 *
 * **3. Écrites dans la transaction de l'événement.** Un paiement qui aboutit
 * sans prévenir personne est précisément le défaut que l'on corrige ici.
 *
 * **Limite assumée : l'acheteur en mode invité n'a pas de compte**, donc pas
 * de notification. Il garde son lien de suivi, qui reste son moyen d'accès —
 * c'est le fonctionnement prévu (§9). Dès qu'il crée un compte avec le même
 * numéro, ses commandes le rejoignent.
 *
 * **Types jamais émis** — `PACKAGE_READY`, `PICKED_UP`, `IN_TRANSIT` : les
 * statuts correspondants figurent dans l'énumération mais aucune action de
 * l'application ne les pose aujourd'hui. Le parcours va de l'assignation du
 * livreur directement à la validation du code de réception. Émettre ces
 * notifications reviendrait à annoncer des événements qui n'ont pas lieu.
 */

export interface Destinataire {
  /** Identifiant du compte. Absent pour un acheteur en mode invité. */
  userId: string | null;
}

export interface EnvoiNotification {
  type: NotificationType;
  /** Nature de l'objet concerné : "Order" dans tous les cas actuels. */
  entite: string;
  /** Référence lisible, celle qui sert à construire le lien de consultation. */
  entiteId: string;
}

/**
 * Écrit une notification pour chaque destinataire réel.
 *
 * Les identifiants nuls (invité) et les doublons sont écartés : un vendeur qui
 * serait aussi le client de sa propre commande — cas de test — ne recevrait
 * pas deux fois le même avis.
 *
 * `exclure` porte l'auteur de l'action : voir la règle 2.
 */
export async function notifier(
  tx: Prisma.TransactionClient,
  {
    destinataires,
    exclure,
    ...envoi
  }: EnvoiNotification & {
    destinataires: (string | null | undefined)[];
    exclure?: string | null;
  }
): Promise<number> {
  const cibles = [
    ...new Set(
      destinataires.filter(
        (id): id is string => typeof id === "string" && id.length > 0
      )
    ),
  ].filter((id) => id !== exclure);

  if (cibles.length === 0) return 0;

  await tx.notification.createMany({
    data: cibles.map((userId) => ({
      userId,
      type: envoi.type,
      entityType: envoi.entite,
      entityId: envoi.entiteId,
    })),
  });

  return cibles.length;
}

/**
 * Retrouve les comptes concernés par une commande.
 *
 * Le client est cherché par son compte rattaché ET, à défaut, par son numéro
 * de téléphone : une commande passée en mode invité, puis revendiquée par un
 * compte créé plus tard avec le même numéro, doit notifier la bonne personne.
 */
export async function partiesDeLaCommande(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<{ vendeur: string | null; client: string | null }> {
  const commande = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      buyerPhone: true,
      seller: { select: { userId: true } },
      customer: { select: { userId: true } },
    },
  });

  if (!commande) return { vendeur: null, client: null };

  let client = commande.customer?.userId ?? null;

  if (client === null && commande.buyerPhone) {
    const compte = await tx.user.findFirst({
      where: { phone: commande.buyerPhone },
      select: { id: true },
    });
    client = compte?.id ?? null;
  }

  return { vendeur: commande.seller?.userId ?? null, client };
}

/** Les administrateurs — destinataires des litiges (§31). */
export async function comptesAdministrateurs(
  tx: Prisma.TransactionClient
): Promise<string[]> {
  const admins = await tx.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true },
  });
  return admins.map((a) => a.id);
}
