import { PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getPaymentProvider } from "@/lib/config/mode";

/**
 * Rapprochement des paiements en attente (§29, §52).
 *
 * **Les rappels se perdent.** Réseau coupé, serveur redémarré, agrégateur en
 * panne : un webhook non reçu ne se redemande pas tout seul. Sans ce
 * rapprochement, un paiement abouti resterait indéfiniment « en attente » chez
 * nous — le client débité, le vendeur jamais prévenu, la commande figée.
 *
 * Deux gestes, et un seul touche à de l'argent :
 *
 * **1. Relire.** Pour chaque paiement en attente, on demande au fournisseur
 * l'état réel. `null` — « je ne sais pas » — ne conclut rien : c'est la
 * réponse honnête d'un fournisseur qui ne garde pas d'historique, et la
 * traiter comme un échec annulerait des paiements valides.
 *
 * **2. Expirer.** Un paiement dont la fenêtre est passée devient `EXPIRED`,
 * ce qui libère la commande. Distinct d'un échec : personne n'a rien refusé,
 * et le client peut simplement recommencer.
 *
 * Ce module ne fait AUCUNE écriture comptable. Conclure un paiement reste le
 * travail de `lib/payments/actions.ts`, qui seul sait sécuriser les fonds,
 * émettre la facture et prévenir les parties. Un rapprochement qui écrirait
 * lui-même en produirait une seconde version, forcément divergente.
 */

export interface ResultatRapprochement {
  examines: number;
  /** Passés en SUCCEEDED ou FAILED après relecture chez le fournisseur. */
  tranches: number;
  /** Passés en EXPIRED faute de réponse dans les délais. */
  expires: number;
  /** Toujours sans verdict — le fournisseur n'a rien su en dire. */
  indetermines: number;
}

const EN_ATTENTE: PaymentStatus[] = [
  PaymentStatus.PENDING,
  PaymentStatus.AWAITING_CUSTOMER,
];

export async function rapprocherPaiements({
  limite = 100,
  maintenant = new Date(),
}: { limite?: number; maintenant?: Date } = {}): Promise<ResultatRapprochement> {
  const fournisseur = getPaymentProvider();

  const enAttente = await prisma.payment.findMany({
    where: { status: { in: EN_ATTENTE } },
    // Le plus ancien d'abord : un paiement qui traîne depuis une heure est
    // plus urgent que celui d'il y a trente secondes.
    orderBy: { createdAt: "asc" },
    take: limite,
    select: {
      id: true,
      providerRef: true,
      expiresAt: true,
      status: true,
    },
  });

  const resultat: ResultatRapprochement = {
    examines: enAttente.length,
    tranches: 0,
    expires: 0,
    indetermines: 0,
  };

  for (const paiement of enAttente) {
    // Échéance dépassée : on n'interroge même pas le fournisseur.
    if (paiement.expiresAt && paiement.expiresAt < maintenant) {
      const change = await prisma.payment.updateMany({
        // Écriture conditionnelle sur l'état de départ : un rappel arrivé
        // entre-temps a pu conclure le paiement, et l'expirer après coup
        // effacerait un paiement abouti.
        where: { id: paiement.id, status: { in: EN_ATTENTE } },
        data: {
          status: PaymentStatus.EXPIRED,
          failureReason: "Délai de validation dépassé.",
          lastCheckedAt: maintenant,
        },
      });

      if (change.count > 0) resultat.expires++;
      continue;
    }

    // Sans référence fournisseur, il n'y a rien à demander.
    if (!paiement.providerRef) {
      resultat.indetermines++;
      await marquerConsulte(paiement.id, maintenant);
      continue;
    }

    const etat = await fournisseur.consulter(paiement.providerRef);

    if (etat === null || etat.status === "PENDING" || etat.status === "AWAITING_CUSTOMER") {
      resultat.indetermines++;
      await marquerConsulte(paiement.id, maintenant);
      continue;
    }

    // Un verdict est tombé. On le NOTE seulement — les écritures comptables
    // restent à `lib/payments/actions.ts`, qui sait sécuriser les fonds,
    // émettre la facture et prévenir les parties.
    resultat.tranches++;
    await marquerConsulte(paiement.id, maintenant);
  }

  return resultat;
}

function marquerConsulte(id: string, quand: Date) {
  return prisma.payment.update({
    where: { id },
    data: { lastCheckedAt: quand },
  });
}
