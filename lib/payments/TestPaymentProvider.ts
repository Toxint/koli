import { randomUUID } from "node:crypto";
import type {
  ConfirmPaymentOptions,
  InitiatePaymentInput,
  PaymentIntent,
  PaymentProvider,
} from "./PaymentProvider";

/**
 * Fournisseur de paiement SIMULE — le seul disponible dans le MVP.
 *
 * Cahier des charges §1, §21, §75, §84 : aucun argent reel n'est traite tant
 * que le partenaire financier et le cadre reglementaire ne sont pas valides.
 * Ce fournisseur ne contacte aucun service externe et ne deplace aucun fonds.
 *
 * Le resultat est pilote par le choix explicite de l'utilisateur au checkout,
 * jamais par un tirage aleatoire : un test doit etre reproductible.
 *
 * Volontairement sans etat : la source de verite est la table `Payment` en base,
 * ce fournisseur n'est que la couture d'abstraction (§51). Cela evite aussi
 * toute dependance a une memoire de processus, qui ne survivrait pas en
 * environnement serverless.
 */
export class TestPaymentProvider implements PaymentProvider {
  readonly id = "TEST";

  async initiate(input: InitiatePaymentInput): Promise<PaymentIntent> {
    return {
      providerRef: `test_${input.orderReference}_${randomUUID()}`,
      status: "PENDING",
      amount: input.amount,
    };
  }

  async confirm(
    providerRef: string,
    options?: ConfirmPaymentOptions
  ): Promise<PaymentIntent> {
    const succeeded = options?.simulateOutcome === "SUCCESS";

    return {
      providerRef,
      status: succeeded ? "SUCCEEDED" : "FAILED",
      // Le montant fait foi cote base (table Payment) ; le fournisseur test
      // ne le rejoue pas pour eviter toute divergence silencieuse.
      amount: 0,
    };
  }
}
