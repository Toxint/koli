/**
 * Abstraction du fournisseur de paiement.
 *
 * Cahier des charges §51 et §83 : la logique metier de KOLI (statuts, fonds,
 * commissions) ne doit JAMAIS dependre d'un fournisseur concret. Le jour ou un
 * partenaire financier agree est retenu, on ajoute une implementation de cette
 * interface — sans toucher au fonctionnement general des commandes.
 *
 * §52 : aucun fournisseur reel ne doit etre invente dans le code. Seule
 * l'implementation TEST existe aujourd'hui.
 */

export type PaymentIntentStatus = "PENDING" | "SUCCEEDED" | "FAILED";

export interface PaymentIntent {
  /** Reference cote fournisseur. En mode test, generee localement. */
  providerRef: string;
  status: PaymentIntentStatus;
  /** Montant en unites entieres de la devise (FCFA, pas de centimes). */
  amount: number;
}

export interface InitiatePaymentInput {
  orderReference: string;
  /** Montant en unites entieres (FCFA). */
  amount: number;
  /** Code devise ISO : "XOF" (UEMOA) ou "XAF" (CEMAC). */
  currency: string;
}

export interface ConfirmPaymentOptions {
  /**
   * MODE TEST UNIQUEMENT : force le resultat de la confirmation, pilote par le
   * choix explicite de l'utilisateur au checkout (§21 : « Simuler un paiement
   * reussi » / « Simuler un paiement echoue »). Jamais aleatoire.
   *
   * Une implementation reelle ignore ce champ : c'est le prestataire qui fait
   * foi, pas l'appelant.
   */
  simulateOutcome?: "SUCCESS" | "FAILURE";
}

export interface PaymentProvider {
  /** Identifiant du fournisseur, journalise avec chaque paiement. */
  readonly id: string;

  /** Cree une intention de paiement. Ne deplace aucun argent. */
  initiate(input: InitiatePaymentInput): Promise<PaymentIntent>;

  /** Recupere le verdict du fournisseur pour une intention donnee. */
  confirm(
    providerRef: string,
    options?: ConfirmPaymentOptions
  ): Promise<PaymentIntent>;
}
