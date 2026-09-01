import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * iKeePay — le fournisseur d'encaissement réel (phase 30).
 *
 * Ce qui est protégé ici, c'est `verifierRappel`. Le reste du fournisseur est
 * de la mise en forme d'URL ; celle-ci décide si une commande est payée.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  iKeePay NE SIGNE PAS ses rappels. Leur documentation montre un exemple  │
 * │  PHP qui croit l'événement sur parole.                                   │
 * │                                                                          │
 * │  Faute de signature, l'adresse de rappel porte un jeton secret. Ces      │
 * │  tests sont donc la SEULE chose qui garantisse qu'un rappel forgé est    │
 * │  rejeté — il n'y a pas de second filet.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

const JETON = "jeton-de-rappel-suffisamment-long-pour-passer";
const ENTETE = "x-koli-jeton-rappel";

const { IkeePayProvider } = await import("@/lib/payments/IkeePayProvider");

function configurer() {
  vi.stubEnv("IKEEPAY_PUBLIC_KEY", "pk_test_123");
  vi.stubEnv("IKEEPAY_SECRET_KEY", "sk_test_456");
  vi.stubEnv("IKEEPAY_WEBHOOK_TOKEN", JETON);
}

beforeEach(configurer);
afterEach(() => vi.unstubAllEnvs());

/** Le rappel du H2H : tout est sous `data`. */
const rappelH2H = (statut: string, reference = "KOLI-ABCDEFGH", montant = 18500) =>
  JSON.stringify({
    event: "transaction.updated",
    data: {
      type: "payin",
      external_reference: reference,
      provider_reference: "IKP-H2H-B5C9EC0E",
      amount: montant,
      currency: "XOF",
      status: statut,
      phone_number: "2250700000000",
      operator: "ORANGE",
    },
  });

describe("configuration", () => {
  it("refuse de démarrer si une clef manque, et NOMME laquelle", () => {
    vi.stubEnv("IKEEPAY_SECRET_KEY", "");
    expect(() => new IkeePayProvider()).toThrow(/IKEEPAY_SECRET_KEY/);
  });

  /**
   * Un jeton court se devine. Comme il remplace la signature, le laisser
   * passer reviendrait à n'avoir aucune protection tout en croyant en avoir
   * une — la pire des deux situations.
   */
  it("refuse un jeton de rappel trop court", () => {
    vi.stubEnv("IKEEPAY_WEBHOOK_TOKEN", "trop-court");
    expect(() => new IkeePayProvider()).toThrow(/IKEEPAY_WEBHOOK_TOKEN/);
  });
});

describe("verifierRappel — la porte d'entrée", () => {
  it("REJETTE un rappel sans jeton", async () => {
    const r = await new IkeePayProvider().verifierRappel(rappelH2H("completed"), {});
    expect(r.valide).toBe(false);
  });

  it("REJETTE un rappel dont le jeton est faux", async () => {
    const r = await new IkeePayProvider().verifierRappel(rappelH2H("completed"), {
      [ENTETE]: "un-autre-jeton-tout-aussi-long-mais-faux",
    });
    expect(r.valide).toBe(false);
  });

  /**
   * Le cas réel : l'acheteur ouvre le lien de paiement, y lit la référence de
   * sa propre commande, et poste un faux succès. C'est le seul contrôle qui
   * l'arrête, puisque la référence, elle, est authentique.
   */
  it("REJETTE un faux succès forgé par l'acheteur avec SA référence", async () => {
    const forge = JSON.stringify({
      event: "payment.success",
      order_id: "KOLI-ABCDEFGH",
      amount: 18500,
      currency: "XOF",
      status: "completed",
    });
    const r = await new IkeePayProvider().verifierRappel(forge, {});
    expect(r.valide).toBe(false);
    expect(r).toMatchObject({ valide: false });
  });

  it("accepte un rappel H2H authentique et en tire l'intention", async () => {
    const r = await new IkeePayProvider().verifierRappel(rappelH2H("completed"), {
      [ENTETE]: JETON,
    });
    expect(r).toEqual({
      valide: true,
      intent: {
        providerRef: "KOLI-ABCDEFGH",
        status: "SUCCEEDED",
        amount: 18500,
        payerMsisdn: "2250700000000",
        payerOperator: "ORANGE",
      },
    });
  });

  /**
   * Leur tunnel envoie `payment.success` avec les champs À PLAT et parfois
   * sans `status`. Les deux formes coexistent dans leur documentation, et un
   * rappel refusé pour cause de forme est un paiement perdu.
   */
  it("accepte la forme du tunnel, champs à plat", async () => {
    const tunnel = JSON.stringify({
      event: "payment.success",
      ikeepay_ref: "IKP-H2H-B5C9EC0E",
      order_id: "KOLI-ABCDEFGH",
      amount: 18500,
      currency: "XOF",
    });
    const r = await new IkeePayProvider().verifierRappel(tunnel, { [ENTETE]: JETON });
    expect(r).toMatchObject({ valide: true, intent: { status: "SUCCEEDED" } });
  });

  /**
   * `pending` veut dire « le client doit valider sur son téléphone », pas
   * « nous réfléchissons ». La nuance décide de ce que l'écran affiche.
   */
  it("traduit « pending » en AWAITING_CUSTOMER, pas en PENDING", async () => {
    const r = await new IkeePayProvider().verifierRappel(rappelH2H("pending"), {
      [ENTETE]: JETON,
    });
    expect(r).toMatchObject({ valide: true, intent: { status: "AWAITING_CUSTOMER" } });
  });

  /**
   * LE défaut qui penche du bon côté : un statut qu'on ne connaît pas ne fait
   * expédier aucun colis. Le jour où iKeePay ajoute un état, KOLI ne le
   * confond pas avec un succès.
   */
  it("ne prend JAMAIS un statut inconnu pour un succès", async () => {
    const r = await new IkeePayProvider().verifierRappel(rappelH2H("quelque_chose"), {
      [ENTETE]: JETON,
    });
    expect(r).toMatchObject({ valide: true, intent: { status: "PENDING" } });
  });

  it("rejette un corps sans référence de commande", async () => {
    const r = await new IkeePayProvider().verifierRappel(
      JSON.stringify({ event: "transaction.updated", data: { amount: 100 } }),
      { [ENTETE]: JETON }
    );
    expect(r).toMatchObject({ valide: false });
  });

  it("rejette un montant nul ou absent", async () => {
    const r = await new IkeePayProvider().verifierRappel(
      rappelH2H("completed", "KOLI-ABCDEFGH", 0),
      { [ENTETE]: JETON }
    );
    expect(r).toMatchObject({ valide: false });
  });

  it("rejette un corps illisible", async () => {
    const r = await new IkeePayProvider().verifierRappel("pas du json", {
      [ENTETE]: JETON,
    });
    expect(r).toMatchObject({ valide: false });
  });
});

describe("initiate — le tunnel", () => {
  it("bâtit l'adresse du tunnel avec notre référence en order_id", async () => {
    const intent = await new IkeePayProvider().initiate({
      orderReference: "KOLI-ABCDEFGH",
      amount: 18500,
      currency: "XOF",
      idempotencyKey: "cle-1",
    });

    expect(intent.status).toBe("AWAITING_CUSTOMER");
    expect(intent.providerRef).toBe("KOLI-ABCDEFGH");

    const url = new URL(intent.checkoutUrl!);
    expect(url.searchParams.get("order_id")).toBe("KOLI-ABCDEFGH");
    expect(url.searchParams.get("amount")).toBe("18500");
    expect(url.searchParams.get("currency")).toBe("XOF");
    // La clef PUBLIQUE, jamais la secrète : cette adresse part au navigateur.
    expect(url.searchParams.get("pk")).toBe("pk_test_123");
    expect(intent.checkoutUrl).not.toContain("sk_test_456");
  });
});

describe("ce que le fournisseur NE PEUT PAS faire", () => {
  /**
   * `ikeepay-success` est un message posté au navigateur : n'importe qui peut
   * l'émettre depuis la console. `confirm` ne doit donc jamais conclure — même
   * quand on le lui demande explicitement.
   */
  it("confirm ne conclut jamais, même si on lui demande un succès", async () => {
    const r = await new IkeePayProvider().confirm("KOLI-ABCDEFGH", {
      simulateOutcome: "SUCCESS",
    });
    expect(r.status).toBe("AWAITING_CUSTOMER");
    expect(r.status).not.toBe("SUCCEEDED");
  });

  /**
   * iKeePay n'expose aucun point d'entrée de consultation. `null` veut dire
   * « je ne sais pas » et non « échec » — la nuance évite qu'un rapprochement
   * marque échoué un paiement qui a peut-être abouti.
   */
  it("consulter renvoie null : il n'y a pas d'entrée pour relire un état", async () => {
    expect(await new IkeePayProvider().consulter("KOLI-ABCDEFGH")).toBeNull();
  });
});

describe("la garde PAYMENT_MODE", () => {
  it("refuse une valeur inconnue", async () => {
    vi.resetModules();
    vi.stubEnv("PAYMENT_MODE", "n-importe-quoi");
    const { getPaymentMode } = await import("@/lib/config/mode");
    expect(() => getPaymentMode()).toThrow(/inconnu/);
  });

  it("accepte « test », et isTestMode le confirme", async () => {
    vi.resetModules();
    vi.stubEnv("PAYMENT_MODE", "test");
    const { getPaymentMode, isTestMode } = await import("@/lib/config/mode");
    expect(getPaymentMode()).toBe("test");
    expect(isTestMode()).toBe(true);
  });

  /**
   * En mode réel, la mention « aucun paiement réel » doit DISPARAÎTRE des
   * écrans (§75). L'afficher pendant qu'on prélève serait la pire chose que
   * cette application puisse dire.
   */
  it("en mode ikeepay, isTestMode est faux", async () => {
    vi.resetModules();
    configurer();
    vi.stubEnv("PAYMENT_MODE", "ikeepay");
    const { getPaymentMode, isTestMode } = await import("@/lib/config/mode");
    expect(getPaymentMode()).toBe("ikeepay");
    expect(isTestMode()).toBe(false);
  });
});
