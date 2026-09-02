import { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { partiesDeLaCommande, notifier } from "@/lib/notifications/envoi";
import { formaterNumeroFacture, rangSuivant } from "@/lib/invoices/numero";
import {
  assertTransition,
  InvalidOrderTransitionError,
} from "@/lib/orders/statusMachine";

/**
 * CE QUE FAIT UN PAIEMENT QUI ABOUTIT — et qui n'appartient à aucun chemin.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Ces écritures vivaient à l'intérieur de `simulatePaymentAction`, donc    │
 * │  du chemin SIMULÉ. Le rappel du prestataire — le seul chemin qui existe   │
 * │  en mode réel — notait le paiement « abouti » et s'arrêtait là.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le commentaire de `/api/paiements/rappel` l'annonçait sans détour : « le
 * jour du branchement (phase 30), c'est ici que l'action de confirmation sera
 * appelée ». Ce jour est arrivé, et voici ce qui se serait produit sans ce
 * fichier :
 *
 *   · le client paie, et il est bel et bien débité chez l'agrégateur ;
 *   · le paiement passe à SUCCEEDED chez nous ;
 *   · **les fonds ne sont jamais mis sous séquestre** ;
 *   · la commande reste « en attente de paiement », donc invisible du vendeur ;
 *   · aucune facture, aucune notification, aucun décompte de stock.
 *
 * Autrement dit : de l'argent prélevé, et personne pour l'apprendre. Sur une
 * application dont le sujet est la confiance, c'est le pire scénario possible
 * — et il n'a été trouvé que parce que `npm run ikeepay:repetition` a joué la
 * chaîne complète en mode réel avant qu'un franc ne bouge.
 *
 * ── Pourquoi une fonction, et pas une action serveur ────────────────────────
 *
 * Elle est appelée depuis deux endroits de natures différentes : une action
 * serveur (le bouton de simulation) et une route d'API (le rappel du
 * prestataire, qui n'a ni session ni utilisateur). Une action `"use server"`
 * conviendrait techniquement, mais elle annoncerait une intention qu'elle n'a
 * pas : ceci n'est pas une commande de l'utilisateur, c'est la conséquence
 * d'un fait déjà établi ailleurs.
 *
 * **Elle ne décide de rien.** Le verdict lui est donné : `simulatePaymentAction`
 * le tient de `provider.confirm()`, la route du rappel de
 * `provider.verifierRappel()`. Elle ne recontacte jamais le prestataire — la
 * tentation serait grande, et elle transformerait chaque appel en un aller-
 * retour réseau au milieu d'une transaction de base de données.
 */

export const MOTIF_TRANSITION_ILLEGALE =
  "Cette commande n'est plus au stade du paiement.";

/**
 * Le chemin de statuts qu'un paiement fait parcourir à sa commande (§15).
 *
 * Rend `null` si aucun chemin n'est légal — commande déjà livrée, annulée,
 * remboursée.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Il est EXPORTÉ parce que deux appelants doivent poser la même question   │
 * │  à deux moments différents, et surtout : l'un d'eux doit la poser AVANT   │
 * │  de contacter le prestataire.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `simulatePaymentAction` appelle `provider.initiate()` puis `confirm()` avant
 * de pouvoir transmettre un verdict. Si la légalité de la transition n'était
 * vérifiée qu'ici — donc après —, on demanderait une intention de paiement
 * pour une commande déjà livrée. Avec le tunnel iKeePay, `initiate()` ne fait
 * que bâtir une adresse et c'est sans effet ; avec un prestataire en direct,
 * ce serait une vraie demande de prélèvement sur une commande qui ne peut plus
 * être payée.
 *
 * Le défaut penche donc du côté qui ne prélève rien. Un test unitaire garde
 * cette propriété (`refuse de payer une commande deja livree`) : il vérifie
 * que le refus intervient sans qu'aucune écriture ne parte.
 */
export function cheminDePaiement(
  depuis: OrderStatus,
  aAbouti: boolean
): OrderStatus[] | null {
  const sauts: OrderStatus[] = [];

  if (aAbouti) {
    // Reprise après un échec précédent (bouton « Réessayer », §23).
    if (depuis === OrderStatus.PAYMENT_FAILED) {
      sauts.push(OrderStatus.PAYMENT_PENDING);
    }
    sauts.push(OrderStatus.PAYMENT_CONFIRMED, OrderStatus.FUNDS_SECURED);
  } else {
    sauts.push(OrderStatus.PAYMENT_FAILED);
  }

  try {
    let courant = depuis;
    for (const suivant of sauts) {
      assertTransition(courant, suivant);
      courant = suivant;
    }
  } catch (error) {
    if (error instanceof InvalidOrderTransitionError) return null;
    throw error;
  }

  return sauts;
}

/** Levée quand un appel concurrent a déjà emporté le paiement. */
class PaiementConcurrent extends Error {
  constructor() {
    super("Paiement deja traite par un appel concurrent.");
    this.name = "PaiementConcurrent";
  }
}

export type ResultatAboutissement =
  | { ok: true; status: OrderStatus; dejaTraite?: boolean }
  | { ok: false; motif: string };

export async function appliquerAboutissement(
  reference: string,
  aAbouti: boolean,
  options: {
    /**
     * Le scénario choisi, en mode test seulement.
     *
     * Il reste `null` en mode réel, et ce n'est pas un détail cosmétique :
     * cette colonne est ce qui distingue, dans le registre, un encaissement
     * qu'on a joué d'un encaissement qui a eu lieu.
     */
    simulatedOutcome?: "SUCCESS" | "FAILURE" | null;
  } = {}
): Promise<ResultatAboutissement> {
  if (typeof reference !== "string" || reference.trim().length === 0) {
    return { ok: false, motif: "Reference de commande manquante." };
  }

  const order = await prisma.order.findUnique({
    where: { reference: reference.trim() },
    include: { payment: true, fund: true, items: true },
  });

  if (!order || !order.payment || !order.fund) {
    return { ok: false, motif: "Commande introuvable." };
  }

  /*
   * Idempotence (§30).
   *
   * Les agrégateurs REJOUENT leurs rappels quand ils n'ont pas reçu de 200
   * assez vite — c'est la norme, pas l'exception. Sans ce garde-fou, un même
   * paiement écrirait deux fois au grand livre et le vendeur serait crédité
   * deux fois d'un seul encaissement.
   */
  if (order.payment.status === PaymentStatus.SUCCEEDED) {
    return { ok: true, status: order.status, dejaTraite: true };
  }

  const sauts = cheminDePaiement(order.status, aAbouti);

  if (!sauts) {
    return { ok: false, motif: MOTIF_TRANSITION_ILLEGALE };
  }

  const statutFinal = sauts[sauts.length - 1];
  const maintenant = new Date();
  // Capturés avant la transaction : TypeScript ne conserve pas le narrowing de
  // `order.fund` à l'intérieur de la closure.
  const montantSequestre = order.fund.amount;
  // Total réglé par le client (articles + livraison), à distinguer de la part
  // séquestrée qui revient au vendeur (hors livraison).
  const montantPaye = order.payment.amount;
  const scenario = options.simulatedOutcome ?? null;

  try {
    await prisma.$transaction(async (tx) => {
      // Écriture conditionnelle : si un appel concurrent a déjà fait passer le
      // paiement, `count` vaut 0 et on abandonne sans rien dupliquer.
      const pris = await tx.payment.updateMany({
        where: { orderId: order.id, status: PaymentStatus.PENDING },
        data: {
          status: aAbouti ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED,
          simulatedOutcome: scenario,
          confirmedAt: aAbouti ? maintenant : null,
        },
      });

      if (pris.count === 0) {
        /*
         * Deux états de départ mènent ici, et il faut les distinguer.
         *
         * FAILED : une tentative précédente a échoué, celle-ci la remplace.
         *
         * AWAITING_CUSTOMER : le client est parti valider sur son téléphone.
         * C'est l'état NORMAL d'un paiement Mobile Money au moment où le rappel
         * arrive — il n'existait pas dans le chemin simulé, où le verdict tombe
         * dans la milliseconde. Sans lui, tout paiement réel serait refusé ici
         * comme « concurrent », et rien ne serait jamais séquestré.
         */
        const repris = await tx.payment.updateMany({
          where: {
            orderId: order.id,
            status: {
              in: [PaymentStatus.FAILED, PaymentStatus.AWAITING_CUSTOMER],
            },
          },
          data: {
            status: aAbouti ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED,
            simulatedOutcome: scenario,
            confirmedAt: aAbouti ? maintenant : null,
          },
        });

        if (repris.count === 0) {
          throw new PaiementConcurrent();
        }
      }

      if (aAbouti) {
        await tx.fund.update({
          where: { orderId: order.id },
          data: { secured: true, securedAt: maintenant },
        });

        // §40 : le journal doit refléter tous les mouvements. L'écriture
        // PAYMENT (ce que le client a effectivement réglé) est distincte de
        // FUNDS_SECURED (la part qui revient au vendeur) : la différence, ce
        // sont les frais de livraison, qui sans cela ne seraient imputés à
        // personne.
        await tx.transaction.createMany({
          data: [
            { orderId: order.id, type: "PAYMENT", amount: montantPaye },
            { orderId: order.id, type: "FUNDS_SECURED", amount: montantSequestre },
          ],
        });

        // Décompte du stock (§17), au paiement et non à la création : un lien
        // de paiement jamais réglé ne doit pas immobiliser l'inventaire. Le
        // `gte` empêche de passer sous zéro si deux paiements aboutissent en
        // même temps sur le dernier article ; `count` à 0 est alors accepté,
        // la vente ayant déjà été encaissée.
        for (const ligne of order.items) {
          await tx.product.updateMany({
            where: { id: ligne.productId, quantity: { gte: ligne.quantity } },
            data: { quantity: { decrement: ligne.quantity } },
          });
        }

        // Facture (§38) : émise dans la MÊME transaction. Émise après coup, un
        // incident laisserait un paiement encaissé sans pièce correspondante.
        //
        // Le rang vient du PLUS GRAND numéro de l'année, et non du nombre de
        // factures : `Invoice` étant en cascade depuis `Order`, une suppression
        // de commande faisait redescendre le compte et le numéro suivant
        // entrait en collision. Voir `lib/invoices/numero.ts`.
        const annee = maintenant.getFullYear();
        const rang = await rangSuivant(tx, annee);

        await tx.invoice.create({
          data: {
            orderId: order.id,
            number: formaterNumeroFacture(annee, rang),
          },
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: statutFinal },
      });

      // Un enregistrement d'historique par saut, pour que la trace soit fidèle.
      let depuis = order.status;
      for (const vers of sauts) {
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, fromStatus: depuis, toStatus: vers },
        });
        depuis = vers;
      }

      // §44 : c'est LE moment le plus important à annoncer. Le vendeur n'avait
      // aucun moyen d'apprendre qu'un client venait de payer.
      //
      // En mode réel, c'est encore plus vrai : personne n'est devant un écran
      // au moment où le rappel arrive. Sans cette notification, le vendeur ne
      // découvrirait la commande qu'en rafraîchissant sa liste par hasard.
      if (aAbouti) {
        const parties = await partiesDeLaCommande(tx, order.id);

        await notifier(tx, {
          type: "FUNDS_SECURED",
          entite: "Order",
          entiteId: order.reference,
          destinataires: [parties.vendeur],
        });

        await notifier(tx, {
          type: "PAYMENT_CONFIRMED",
          entite: "Order",
          entiteId: order.reference,
          destinataires: [parties.client],
        });
      }
    });
  } catch (error) {
    if (error instanceof PaiementConcurrent) {
      return {
        ok: false,
        motif: "Ce paiement a deja ete traite. Rafraichissez la page.",
      };
    }
    throw error;
  }

  return { ok: true, status: statutFinal };
}
