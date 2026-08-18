import type { PaymentProvider } from "@/lib/payments/PaymentProvider";
import { TestPaymentProvider } from "@/lib/payments/TestPaymentProvider";

/**
 * Garde du MODE TEST.
 *
 * Cahier des charges §1 : « Aucun argent reel ne doit etre traite dans le MVP
 * tant que le partenaire financier, les exigences reglementaires et
 * l'integration de paiement reelle ne sont pas valides. »
 * §84 : KOLI ne doit pas pretendre detenir legalement les fonds des clients
 * avant validation du cadre applicable.
 *
 * Cette garde rend l'invariant explicite dans le code plutot que de le faire
 * reposer sur la simple absence d'integration : toute valeur de PAYMENT_MODE
 * autre que "test" fait echouer l'application immediatement et bruyamment.
 */

export type PaymentMode = "test";

export function getPaymentMode(): PaymentMode {
  const raw = (process.env.PAYMENT_MODE ?? "test").trim().toLowerCase();

  if (raw !== "test") {
    throw new Error(
      `PAYMENT_MODE="${raw}" refuse. KOLI ne peut fonctionner qu'en mode test ` +
        `tant qu'un partenaire financier agree n'a pas ete retenu et que le ` +
        `cadre reglementaire n'a pas ete valide (cahier des charges §1, §84). ` +
        `Voir docs/koli-plan.md, phases 29 a 31.`
    );
  }

  return "test";
}

/** Vrai tant que la plateforme tourne en paiement simule. */
export function isTestMode(): boolean {
  return getPaymentMode() === "test";
}

/**
 * Unique point d'obtention d'un fournisseur de paiement.
 * Le jour ou un partenaire reel est integre (phase 30), c'est ici — et
 * seulement ici — que le choix se fera.
 */
export function getPaymentProvider(): PaymentProvider {
  getPaymentMode(); // leve si le mode n'est pas "test"
  return new TestPaymentProvider();
}
