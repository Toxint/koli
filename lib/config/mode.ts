import type { PaymentProvider } from "@/lib/payments/PaymentProvider";
import { TestPaymentProvider } from "@/lib/payments/TestPaymentProvider";
import { IkeePayProvider } from "@/lib/payments/IkeePayProvider";

/**
 * Garde du MODE DE PAIEMENT.
 *
 * Cahier des charges §1 : « Aucun argent reel ne doit etre traite dans le MVP
 * tant que le partenaire financier, les exigences reglementaires et
 * l'integration de paiement reelle ne sont pas valides. »
 * §84 : KOLI ne doit pas pretendre detenir legalement les fonds des clients
 * avant validation du cadre applicable.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │  CE QUI A CHANGE, ET POURQUOI LA GARDE PEUT S'OUVRIR                    │
 * │                                                                        │
 * │  Le §84 interdit a KOLI de DETENIR les fonds. Chez iKeePay, les fonds   │
 * │  dorment sur LEUR compte : c'est l'agregateur qui porte l'agrement, et  │
 * │  KOLI ne fait que dire quand les liberer. KOLI ne detient donc jamais   │
 * │  l'argent de personne, et le §84 est satisfait — non pas contourne.     │
 * │                                                                        │
 * │  Si un jour les fonds transitent par un compte KOLI, cette garde doit   │
 * │  se refermer : detenir les fonds de tiers est une activite reglementee. │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * La garde ne disparait pas pour autant. Elle refuse toujours toute valeur
 * inconnue, et surtout : **le mode reel exige que sa configuration soit
 * complete**. Un `PAYMENT_MODE=ikeepay` pose sur un environnement sans clefs
 * fait echouer l'application au demarrage, bruyamment, plutot que d'encaisser
 * dans le vide.
 */

export type PaymentMode = "test" | "ikeepay";

const MODES: readonly PaymentMode[] = ["test", "ikeepay"];

export function getPaymentMode(): PaymentMode {
  const brut = (process.env.PAYMENT_MODE ?? "test").trim().toLowerCase();

  if (!MODES.includes(brut as PaymentMode)) {
    throw new Error(
      `PAYMENT_MODE="${brut}" inconnu. Valeurs acceptees : ${MODES.join(", ")}. ` +
        `Voir docs/koli-plan.md, phases 29 a 31.`
    );
  }

  return brut as PaymentMode;
}

/**
 * Vrai tant que la plateforme tourne en paiement simule.
 *
 * Lu par les ecrans pour afficher la mention « mode test » (§75). Elle doit
 * disparaitre le jour ou l'argent devient reel : annoncer « aucun paiement
 * reel » alors qu'on preleve serait la pire chose que cette application
 * puisse afficher.
 */
export function isTestMode(): boolean {
  return getPaymentMode() === "test";
}

/**
 * Unique point d'obtention d'un fournisseur de paiement.
 *
 * C'est ici — et seulement ici — que le choix se fait. La logique metier de
 * KOLI (statuts, sequestre, commission, facture) ne connait aucun fournisseur
 * concret, et c'est ce qui rend ce fichier remplacable en trois lignes (§51).
 *
 * Le fournisseur est construit A CHAQUE APPEL et non mis en cache : son
 * constructeur relit la configuration et jette si elle est incomplete. Un
 * cache ferait survivre une instance construite avant qu'une variable ne
 * disparaisse, et l'erreur ne remonterait jamais.
 */
export function getPaymentProvider(): PaymentProvider {
  switch (getPaymentMode()) {
    case "ikeepay":
      return new IkeePayProvider();
    case "test":
    default:
      return new TestPaymentProvider();
  }
}
