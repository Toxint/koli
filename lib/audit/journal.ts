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
  COMMISSION_RATE_SET: "Taux de commission modifié",
  COMMISSION_SUSPENDED: "Commission suspendue",
  ACCOUNT_STATUS_SET: "Statut de compte modifié",
  SELLER_VERIFICATION_SET: "Vérification vendeur modifiée",
  DISPUTE_RESOLVED: "Litige tranché",
  REFUND_PROCESSED: "Remboursement traité",
  FUNDS_RELEASE_TEST: "Fonds libérés (test)",
  KYC_DOCUMENT_REVIEWED: "Pièce justificative examinée",
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
