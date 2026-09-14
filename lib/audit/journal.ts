import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Journal d'audit (§48).
 *
 * « L'audit doit permettre de comprendre ce qui s'est passé. »
 *
 * Ce que cela impose, concrètement :
 *
 * **Qui, quoi, sur quoi, quand — et surtout avant → après.** Une ligne
 * « taux de commission modifié » n'apprend rien : il faut lire « de 5 % à
 * 8 % ». Les valeurs précédentes sont donc consignées avec les nouvelles.
 *
 * **Écrit dans la même transaction que l'acte.** Une décision appliquée sans
 * trace, ou une trace sans décision appliquée, mentent toutes deux. Là où
 * l'acte tient dans une transaction, la ligne de journal y entre avec lui.
 *
 * **En ajout seul.** Aucun chemin de l'application ne met à jour ni ne
 * supprime une ligne. Un journal que l'on peut retoucher ne prouve rien.
 *
 * **L'auteur est recopié, pas seulement référencé.** Voir `actorName` dans le
 * schéma : le lien vers le compte est en `SetNull`, donc supprimer un compte
 * rendrait la ligne anonyme.
 *
 * Ce journal ne remplace pas `OrderStatusHistory`, qui suit la vie d'UNE
 * commande. Il enregistre les actes d'autorité — ceux qui n'ont pas de
 * commande pour support, ou qui engagent la plateforme.
 */

/**
 * Vocabulaire fermé.
 *
 * Une chaîne libre finirait par accumuler des variantes (« RATE_CHANGE »,
 * « rate_changed », « COMMISSION_UPDATE ») qui rendraient le journal
 * impossible à filtrer — donc inutile.
 */
export const ACTIONS_AUDIT = {
  /** Taux de commission fixé ou modifié (§41). */
  COMMISSION_RATE_SET: "COMMISSION_RATE_SET",
  /** Prélèvement suspendu, sans perte de l'historique. */
  COMMISSION_SUSPENDED: "COMMISSION_SUSPENDED",
  /** Compte suspendu ou réactivé (§35). */
  ACCOUNT_STATUS_SET: "ACCOUNT_STATUS_SET",
  /** Vendeur vérifié, rejeté, ou remis en attente (§36). */
  SELLER_VERIFICATION_SET: "SELLER_VERIFICATION_SET",
  /** Litige tranché par l'administration (§32). */
  DISPUTE_RESOLVED: "DISPUTE_RESOLVED",
  /** Remboursement traité (§30). */
  REFUND_PROCESSED: "REFUND_PROCESSED",
  /** Fonds libérés au vendeur, en mode test (§29, §48). */
  FUNDS_RELEASE_TEST: "FUNDS_RELEASE_TEST",
  /** Pièce justificative acceptée ou refusée (§37). */
  KYC_DOCUMENT_REVIEWED: "KYC_DOCUMENT_REVIEWED",

  /**
   * Un vendeur a DEMANDÉ un versement (§43).
   *
   * Consignée bien qu'aucun argent n'ait encore bougé : c'est le seul point du
   * système où quelqu'un réclame de l'argent, et la demande décide de la
   * DESTINATION — un numéro Mobile Money saisi à cet instant. Le jour où un
   * versement part sur un mauvais numéro, c'est cette ligne qui dira lequel
   * avait été demandé, et par qui.
   */
  SELLER_PAYOUT_REQUESTED: "SELLER_PAYOUT_REQUESTED",

  /*
   * Les numéros de retrait ENREGISTRÉS par un vendeur (§43).
   *
   * Ces lignes décident d'où part l'argent. Le jour où un versement arrive au
   * mauvais endroit, la première question est « depuis quand ce numéro
   * était-il là, et qui l'a mis ? » — sans trace, cette question n'a pas de
   * réponse, et un numéro changé la veille ressemble à un numéro de toujours.
   */
  SELLER_PAYOUT_ACCOUNT_SAVED: "SELLER_PAYOUT_ACCOUNT_SAVED",
  SELLER_PAYOUT_ACCOUNT_REMOVED: "SELLER_PAYOUT_ACCOUNT_REMOVED",

  /**
   * Un versement a été EXÉCUTÉ ou REFUSÉ par l'administration (§43).
   *
   * ┌────────────────────────────────────────────────────────────────────┐
   * │  C'est le seul acte de KOLI qui fait SORTIR de l'argent. Tout le  │
   * │  reste déplace des soldes à l'intérieur de la plateforme.          │
   * └────────────────────────────────────────────────────────────────────┘
   *
   * Il ne se rejoue pas, et il ne s'annule pas : l'argent est parti. La trace
   * porte donc le montant, le numéro, et la référence du transfert — de quoi
   * rapprocher notre registre du relevé du prestataire, ce qui est exactement
   * ce qui manquait quand les deux paiements du 6 septembre ont été perdus.
   */
  SELLER_PAYOUT_SETTLED: "SELLER_PAYOUT_SETTLED",

  /**
   * Un rappel du prestataire est arrivé et n'a RIEN produit.
   *
   * ┌────────────────────────────────────────────────────────────────────┐
   * │  Deux vrais paiements ont été perdus le 6 septembre 2026 sans     │
   * │  laisser la moindre trace.                                         │
   * └────────────────────────────────────────────────────────────────────┘
   *
   * La route répond 200 à un rappel qu'elle écarte — la règle anti-oracle
   * interdit de révéler qu'une référence est inconnue, donc le refus et le
   * succès se ressemblent. Le prestataire est satisfait, l'acheteur est
   * débité, et personne n'apprend rien.
   *
   * Consigné SEULEMENT au-delà de la porte du jeton : en deçà, n'importe
   * qui pourrait remplir le journal en frappant l'adresse.
   */
  PAYMENT_CALLBACK_DISCARDED: "PAYMENT_CALLBACK_DISCARDED",

  /*
   * Un paiement en attente fermé À LA MAIN, après vérification chez le
   * prestataire (`npm run paiement:expirer`).
   *
   * Faute de route de consultation chez iKeePay, le code ne peut pas savoir
   * si une intention a abouti : c'est un humain qui va lire leur historique.
   * Sa conclusion doit donc s'écrire quelque part — sans cette ligne, un
   * paiement passerait d'« en attente » à « expiré » sans que personne puisse
   * dire qui l'a décidé ni sur quelle constatation.
   */
  PAYMENT_EXPIRED_MANUALLY: "PAYMENT_EXPIRED_MANUALLY",

  /* ── Équipes de livraison (§5.3) ──
   *
   * Le lien d'invitation vaut droit d'entrée dans l'équipe d'un vendeur : qui
   * l'a émis, quand, et qui est entré par lui doit rester établi. Sans ces
   * lignes, un livreur qui apparaît dans une équipe n'a pas d'histoire, et un
   * vendeur qui conteste sa présence n'a rien à opposer.
   *
   * Le JETON, lui, n'entre jamais au journal — voir `emettreInvitationAction`. */
  /** Un vendeur a émis un lien d'invitation pour ses livreurs. */
  DRIVER_INVITE_ISSUED: "DRIVER_INVITE_ISSUED",
  /** Le lien a été fermé — par révocation directe, ou remplacé par un neuf. */
  DRIVER_INVITE_REVOKED: "DRIVER_INVITE_REVOKED",
  /** Un livreur est entré dans une équipe par un lien d'invitation. */
  DRIVER_JOINED_TEAM: "DRIVER_JOINED_TEAM",
  /** Le vendeur a retiré un livreur de son équipe. */
  DRIVER_REMOVED_FROM_TEAM: "DRIVER_REMOVED_FROM_TEAM",
} as const;

export type ActionAudit =
  (typeof ACTIONS_AUDIT)[keyof typeof ACTIONS_AUDIT];

export interface ActeurAudit {
  id: string;
  name: string;
  role: string;
}

export interface EcritureAudit {
  acteur: ActeurAudit | null;
  action: ActionAudit;
  /** Nature de l'objet : "Commission", "User", "Order", "SellerProfile"… */
  entite: string;
  /**
   * Identifiant lisible de préférence à l'identifiant technique : la référence
   * d'une commande parle, `cmt5ih…` non. Le §48 le montre ainsi
   * (`ORDER: KOLI-000124`).
   */
  entiteId: string;
  /** Avant → après, et tout ce qui aide à comprendre. */
  details?: Record<string, unknown>;
}

/**
 * Inscrit une ligne au journal.
 *
 * `client` accepte une transaction : passer le `tx` de l'acte lie les deux
 * écritures, si bien qu'aucune ne peut aboutir sans l'autre.
 *
 * **N'échoue jamais bruyamment.** Une panne d'écriture du journal ne doit pas
 * annuler un remboursement déjà décidé — hors transaction, du moins. À
 * l'intérieur d'une transaction, l'erreur remonte et fait tout annuler, ce qui
 * est le comportement voulu : mieux vaut ne rien faire que d'agir en aveugle.
 */
export async function consigner(
  client: Prisma.TransactionClient | typeof prisma,
  ecriture: EcritureAudit
): Promise<void> {
  await client.auditLog.create({
    data: {
      actorUserId: ecriture.acteur?.id ?? null,
      actorName: ecriture.acteur?.name ?? null,
      actorRole: ecriture.acteur?.role ?? null,
      action: ecriture.action,
      entityType: ecriture.entite,
      entityId: ecriture.entiteId,
      metadata: ecriture.details ? JSON.stringify(ecriture.details) : null,
    },
  });
}

/** Libellés français des actions, pour l'écran de consultation. */
export const LIBELLES_ACTION: Record<string, string> = {
  PAYMENT_CALLBACK_DISCARDED: "Rappel de paiement écarté",
  PAYMENT_EXPIRED_MANUALLY: "Paiement fermé après vérification chez le prestataire",
  COMMISSION_RATE_SET: "Taux de commission modifié",
  COMMISSION_SUSPENDED: "Commission suspendue",
  ACCOUNT_STATUS_SET: "Statut de compte modifié",
  SELLER_VERIFICATION_SET: "Vérification vendeur modifiée",
  DISPUTE_RESOLVED: "Litige tranché",
  REFUND_PROCESSED: "Remboursement traité",
  FUNDS_RELEASE_TEST: "Fonds libérés (test)",
  KYC_DOCUMENT_REVIEWED: "Pièce justificative examinée",
  DRIVER_INVITE_ISSUED: "Lien d'invitation livreur émis",
  DRIVER_INVITE_REVOKED: "Lien d'invitation livreur révoqué",
  DRIVER_JOINED_TEAM: "Livreur entré dans une équipe",
  DRIVER_REMOVED_FROM_TEAM: "Livreur retiré d'une équipe",
  /* Les deux temps du versement (§43). Distincts, parce que la demande et
     l'exécution ne sont pas le fait de la même personne — et c'est exactement
     ce qu'on relit le jour où un versement part au mauvais endroit. */
  SELLER_PAYOUT_REQUESTED: "Versement demandé par un vendeur",
  SELLER_PAYOUT_SETTLED: "Versement réglé par l'administration",
  SELLER_PAYOUT_ACCOUNT_SAVED: "Numéro de retrait enregistré",
  SELLER_PAYOUT_ACCOUNT_REMOVED: "Numéro de retrait supprimé",
};

export function libelleAction(action: string): string {
  return LIBELLES_ACTION[action] ?? action;
}

/**
 * Rend les détails lisibles par un humain.
 *
 * Le JSON brut est illisible dans un tableau. On en tire une phrase, en
 * privilégiant la forme « avant → après » qui est la seule vraiment utile.
 */
export function resumerDetails(metadata: string | null): string {
  if (!metadata) return "";

  let donnees: Record<string, unknown>;
  try {
    donnees = JSON.parse(metadata) as Record<string, unknown>;
  } catch {
    // Une ligne illisible ne doit pas casser la page : on montre le brut.
    return metadata.slice(0, 120);
  }

  const morceaux: string[] = [];

  if ("avant" in donnees || "apres" in donnees) {
    const avant = donnees.avant ?? "—";
    const apres = donnees.apres ?? "—";
    morceaux.push(`${String(avant)} → ${String(apres)}`);
  }

  for (const [cle, valeur] of Object.entries(donnees)) {
    if (cle === "avant" || cle === "apres") continue;
    if (valeur === null || valeur === undefined || valeur === "") continue;
    morceaux.push(`${cle} : ${String(valeur)}`);
  }

  return morceaux.join(" · ");
}
