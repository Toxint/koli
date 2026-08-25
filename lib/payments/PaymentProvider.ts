/**
 * Abstraction du fournisseur de paiement (§51, §52, §83).
 *
 * La logique métier de KOLI — statuts, séquestre, commission — ne doit JAMAIS
 * dépendre d'un fournisseur concret. Le jour où le partenaire est branché, on
 * ajoute une implémentation de cette interface sans toucher au reste.
 *
 * §52 : **aucun fournisseur réel n'est inventé ici.** Seule l'implémentation
 * TEST existe. Ce fichier décrit ce qu'un agrégateur Mobile Money exige
 * réellement — c'est le travail de la phase 29 : que le branchement du
 * partenaire soit l'écriture d'un adaptateur, et non une refonte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA PREMIÈRE VERSION NE SAVAIT PAS EXPRIMER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Elle supposait un aller-retour immédiat : on demande, on obtient un verdict.
 * Un paiement Mobile Money ne fonctionne pas ainsi.
 *
 * **1. Le payeur valide sur son téléphone.** Entre la demande et la réponse il
 * s'écoule de quelques secondes à plusieurs minutes. Pendant ce temps, l'état
 * n'est ni « en attente chez nous » ni « échoué » : la balle est dans le camp
 * du client, et l'écran doit le dire.
 *
 * **2. C'est l'agrégateur qui rappelle**, par un webhook. Le verdict arrive
 * sans qu'on l'ait demandé, parfois plusieurs fois pour la même transaction,
 * parfois dans le désordre.
 *
 * **3. Les rappels se perdent.** Réseau, redémarrage, panne. Il faut donc
 * pouvoir REDEMANDER l'état — c'est le rapprochement (`consulter`), sans quoi
 * des paiements aboutis restent éternellement « en attente ».
 *
 * **4. Une clef d'idempotence est obligatoire.** Sans elle, un renvoi de
 * requête après une coupure crée un SECOND prélèvement — sur l'argent réel de
 * quelqu'un.
 *
 * **5. Un rappel non signé ne vaut rien.** Accepter un webhook sans vérifier sa
 * provenance permettrait à n'importe qui de marquer une commande payée.
 * `verifierRappel` n'est donc pas optionnel : c'est la porte d'entrée.
 */

/**
 * États d'un paiement chez le fournisseur.
 *
 * `AWAITING_CUSTOMER` et `EXPIRED` sont nouveaux, et chacun répond à une
 * question que le client se pose :
 *  - « dois-je faire quelque chose ? » → oui, valider sur son téléphone ;
 *  - « ai-je été refusé ? » → non, le délai a simplement expiré.
 *
 * L'annulation par le payeur n'a PAS d'état dédié : c'est un échec, avec un
 * motif. Multiplier les états terminaux double les branches de l'interface
 * pour une distinction que `failureReason` porte déjà.
 */
export type PaymentIntentStatus =
  | "PENDING"
  | "AWAITING_CUSTOMER"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED";

export interface PaymentIntent {
  /** Référence de la transaction chez le fournisseur. */
  providerRef: string;
  status: PaymentIntentStatus;
  /** Montant en unités entières de la devise (FCFA, pas de centimes). */
  amount: number;
  /** Motif en clair quand l'état est FAILED. Destiné à être montré au client. */
  failureReason?: string;
  /** Numéro qui a payé, quand le fournisseur le communique. */
  payerMsisdn?: string;
  /** Opérateur : "ORANGE", "MTN", "MOOV", "WAVE"… selon le fournisseur. */
  payerOperator?: string;
  /** Fin de la fenêtre de validation, quand le fournisseur en impose une. */
  expiresAt?: Date;
}

export interface InitiatePaymentInput {
  orderReference: string;
  /** Montant en unités entières (FCFA). */
  amount: number;
  /** Code devise ISO : "XOF" (UEMOA) ou "XAF" (CEMAC). */
  currency: string;

  /**
   * Clef d'idempotence, **obligatoire**.
   *
   * Elle appartient à KOLI, pas au fournisseur : c'est nous qui garantissons
   * qu'un réessai porte la même clef. Un fournisseur qui la reçoit deux fois
   * doit renvoyer la MÊME transaction, sans en créer une seconde.
   */
  idempotencyKey: string;

  /** Numéro du payeur. Requis par la plupart des agrégateurs Mobile Money. */
  payerMsisdn?: string;
  /** Adresse à rappeler. Le fournisseur y postera le verdict. */
  callbackUrl?: string;
}

export interface ConfirmPaymentOptions {
  /**
   * MODE TEST UNIQUEMENT : force le résultat, piloté par le choix explicite de
   * l'utilisateur au checkout (§21). Jamais aléatoire.
   *
   * Une implémentation réelle **ignore ce champ** : c'est le prestataire qui
   * fait foi, jamais l'appelant.
   */
  simulateOutcome?: "SUCCESS" | "FAILURE";
}

/**
 * Résultat de la vérification d'un rappel.
 *
 * `valide: false` doit conduire au REJET pur et simple — jamais à un
 * traitement « au cas où ». Un rappel dont on ne peut pas établir l'origine
 * est, par défaut, une tentative de fraude.
 */
export type RappelVerifie =
  | { valide: true; intent: PaymentIntent }
  | { valide: false; motif: string };

export interface PaymentProvider {
  /** Identifiant du fournisseur, journalisé avec chaque paiement. */
  readonly id: string;

  /**
   * Le fournisseur rappelle-t-il de lui-même ?
   *
   * `false` pour le mode test, qui répond immédiatement. Les écrans s'y
   * adaptent : inutile d'afficher « validez sur votre téléphone » quand rien
   * ne sera demandé au client.
   */
  readonly asynchrone: boolean;

  /** Crée une intention de paiement. Ne déplace aucun argent. */
  initiate(input: InitiatePaymentInput): Promise<PaymentIntent>;

  /** Récupère le verdict du fournisseur pour une intention donnée. */
  confirm(
    providerRef: string,
    options?: ConfirmPaymentOptions
  ): Promise<PaymentIntent>;

  /**
   * Interroge le fournisseur sur l'état RÉEL d'une transaction.
   *
   * Sert au rapprochement (`lib/payments/rapprochement.ts`) : les rappels se
   * perdent, et sans cette relecture des paiements aboutis resteraient
   * indéfiniment « en attente » chez nous alors que le client a été débité.
   *
   * Distinct de `confirm` : `confirm` conclut un paiement que l'on vient de
   * demander, `consulter` ne fait que lire, sans effet de bord.
   */
  consulter(providerRef: string): Promise<PaymentIntent | null>;

  /**
   * Vérifie l'authenticité d'un rappel et en extrait l'intention.
   *
   * **C'est la porte d'entrée du système de paiement.** Un rappel accepté sans
   * preuve d'origine permettrait à quiconque connaît une référence de commande
   * de la marquer payée — donc de faire expédier un colis sans payer.
   *
   * La signature est vérifiée en comparaison à temps constant, et le corps
   * BRUT est utilisé : re-sérialiser du JSON change les espaces et invalide la
   * signature.
   */
  verifierRappel(
    corpsBrut: string,
    entetes: Record<string, string>
  ): Promise<RappelVerifie>;
}
