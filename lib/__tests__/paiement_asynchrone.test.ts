import { describe, it, expect } from "vitest";
import { TestPaymentProvider } from "@/lib/payments/TestPaymentProvider";

/**
 * Preparation de l'integration financiere (§29, §52).
 *
 * Ce qui est eprouve ici, c'est la VERIFICATION DES RAPPELS — la porte
 * d'entree la plus dangereuse du systeme. Un rappel accepte sans preuve
 * d'origine permettrait a quiconque de marquer une commande payee, donc de
 * faire expedier un colis sans jamais payer.
 *
 * Elle est implementee pour de bon des le mode test, alors qu'aucun rappel
 * reel n'arrive : sans cela, le chemin le plus critique du systeme ne serait
 * jamais mis a l'epreuve, et l'on decouvrirait le jour du branchement qu'il ne
 * tient pas.
 */

const fournisseur = new TestPaymentProvider();

const corps = (o: Record<string, unknown>) => JSON.stringify(o);
const signe = (c: string) => ({ "x-koli-signature": fournisseur.signerPourTest(c) });

describe("verifierRappel — authenticite", () => {
  it("accepte un rappel correctement signe", async () => {
    const c = corps({ providerRef: "test_ref_1", status: "SUCCEEDED", amount: 20500 });
    const r = await fournisseur.verifierRappel(c, signe(c));

    expect(r.valide).toBe(true);
    if (r.valide) {
      expect(r.intent.providerRef).toBe("test_ref_1");
      expect(r.intent.status).toBe("SUCCEEDED");
      expect(r.intent.amount).toBe(20500);
    }
  });

  it("REFUSE un rappel sans signature", async () => {
    const c = corps({ providerRef: "test_ref_1", status: "SUCCEEDED" });
    const r = await fournisseur.verifierRappel(c, {});

    expect(r.valide).toBe(false);
  });

  it("REFUSE une signature fabriquee", async () => {
    const c = corps({ providerRef: "test_ref_1", status: "SUCCEEDED" });
    const r = await fournisseur.verifierRappel(c, {
      "x-koli-signature": "a".repeat(64),
    });

    expect(r.valide).toBe(false);
  });

  it("REFUSE un corps modifie apres signature", async () => {
    // Le coeur du controle : quelqu'un intercepte un rappel legitime et change
    // le montant, ou l'etat. La signature ne correspond plus.
    const original = corps({ providerRef: "test_ref_1", status: "FAILED", amount: 100 });
    const entetes = signe(original);
    const falsifie = corps({ providerRef: "test_ref_1", status: "SUCCEEDED", amount: 100 });

    const r = await fournisseur.verifierRappel(falsifie, entetes);
    expect(r.valide).toBe(false);
  });

  it("REFUSE la signature d'un AUTRE rappel", async () => {
    // Rejeu : une signature valide, mais pour un autre corps.
    const a = corps({ providerRef: "ref_a", status: "SUCCEEDED" });
    const b = corps({ providerRef: "ref_b", status: "SUCCEEDED" });

    const r = await fournisseur.verifierRappel(b, signe(a));
    expect(r.valide).toBe(false);
  });

  it("accepte l'en-tete quelle que soit la casse", async () => {
    // Les serveurs normalisent differemment ; refuser sur la casse ferait
    // echouer des rappels parfaitement valides.
    const c = corps({ providerRef: "test_ref_1", status: "SUCCEEDED" });
    const r = await fournisseur.verifierRappel(c, {
      "X-Koli-Signature": fournisseur.signerPourTest(c),
    });

    expect(r.valide).toBe(true);
  });
});

describe("verifierRappel — contenu", () => {
  it("REFUSE un corps illisible, meme signe", async () => {
    // Signe par nous, donc authentique — mais inexploitable. Authentique ne
    // veut pas dire valide.
    const c = "ceci n'est pas du JSON";
    const r = await fournisseur.verifierRappel(c, signe(c));

    expect(r.valide).toBe(false);
    if (!r.valide) expect(r.motif).toMatch(/illisible/i);
  });

  it("REFUSE un rappel sans reference de transaction", async () => {
    const c = corps({ status: "SUCCEEDED", amount: 100 });
    const r = await fournisseur.verifierRappel(c, signe(c));

    expect(r.valide).toBe(false);
  });

  it("REFUSE un etat inconnu : rien d'arbitraire n'entre en base", async () => {
    const c = corps({ providerRef: "r", status: "PEUT_ETRE", amount: 100 });
    const r = await fournisseur.verifierRappel(c, signe(c));

    expect(r.valide).toBe(false);
    if (!r.valide) expect(r.motif).toMatch(/état inconnu/i);
  });

  it("accepte les cinq etats du contrat", async () => {
    for (const status of [
      "PENDING",
      "AWAITING_CUSTOMER",
      "SUCCEEDED",
      "FAILED",
      "EXPIRED",
    ]) {
      const c = corps({ providerRef: "r", status, amount: 1 });
      const r = await fournisseur.verifierRappel(c, signe(c));
      expect(r.valide, status).toBe(true);
    }
  });
});

describe("le contrat du fournisseur", () => {
  it("annonce s'il rappelle de lui-meme", async () => {
    // Les ecrans s'y adaptent : inutile d'afficher « validez sur votre
    // telephone » quand rien ne sera demande au client.
    expect(fournisseur.asynchrone).toBe(false);
  });

  it("exige une clef d'idempotence a l'initiation", async () => {
    const intent = await fournisseur.initiate({
      orderReference: "KOLI-ABCDEFGH",
      amount: 20500,
      currency: "XOF",
      idempotencyKey: "cle-1",
    });

    expect(intent.status).toBe("PENDING");
    expect(intent.providerRef).toContain("KOLI-ABCDEFGH");
  });

  it("produit une reference DIFFERENTE a chaque intention", async () => {
    // Sans cela, deux commandes partageraient une reference et un rappel
    // toucherait la mauvaise.
    const a = await fournisseur.initiate({
      orderReference: "KOLI-AAAAAAAA", amount: 1, currency: "XOF", idempotencyKey: "k",
    });
    const b = await fournisseur.initiate({
      orderReference: "KOLI-AAAAAAAA", amount: 1, currency: "XOF", idempotencyKey: "k",
    });

    expect(a.providerRef).not.toBe(b.providerRef);
  });

  it("rend « je ne sais pas » plutot qu'un verdict invente", async () => {
    // `consulter` renvoie null : le fournisseur test ne garde rien. Repondre
    // SUCCEEDED par defaut validerait des paiements qui n'ont jamais eu lieu.
    expect(await fournisseur.consulter()).toBeNull();
  });

  it("ne conclut au succes que sur une simulation explicite", async () => {
    expect((await fournisseur.confirm("r", { simulateOutcome: "SUCCESS" })).status)
      .toBe("SUCCEEDED");
    expect((await fournisseur.confirm("r", { simulateOutcome: "FAILURE" })).status)
      .toBe("FAILED");
    // Sans consigne : echec. Un defaut permissif ferait aboutir un paiement
    // sur un appel mal forme.
    expect((await fournisseur.confirm("r")).status).toBe("FAILED");
  });

  it("motive ses echecs : le client doit lire quelque chose", async () => {
    const r = await fournisseur.confirm("r", { simulateOutcome: "FAILURE" });
    expect(r.failureReason).toBeTruthy();
  });
});
