import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Commission KOLI (§41) — phase 19.
 *
 * Ce que ces tests protègent, dans l'ordre d'importance :
 *
 *  1. **Le taux n'est jamais codé en dur.** Il est lu en base à chaque
 *     prélèvement, et une commission enregistrée conserve le taux qui lui a été
 *     appliqué. Corriger le taux aujourd'hui ne doit pas réécrire le passé.
 *  2. **Le prélèvement suit l'argent.** Aucune commission tant que les fonds ne
 *     sont pas versés au vendeur — une commande remboursée ne coûte rien.
 *  3. **L'arrondi ne prend jamais plus que le taux annoncé.**
 */

const prismaMock = {
  commission: { findFirst: vi.fn() },
};

const txMock = {
  commission: { findFirst: vi.fn() },
  transaction: { create: vi.fn() },
};

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

const { calculerCommission, tauxCommissionActif, preleverCommission } =
  await import("@/lib/finance/commission");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("calculerCommission", () => {
  it("applique le taux et arrondit a l'entier inferieur", () => {
    // 5 % de 18 501 = 925,05. Le FCFA n'a pas de subdivision en circulation :
    // arrondir vers le bas laisse le franc chez le vendeur.
    expect(calculerCommission(18_501, 5)).toBe(925);
  });

  it("ne prend jamais plus que le taux annonce", () => {
    // 7 % de 999 = 69,93 -> 69, jamais 70.
    expect(calculerCommission(999, 7)).toBe(69);
  });

  it("ne preleve rien sans taux", () => {
    expect(calculerCommission(50_000, 0)).toBe(0);
  });

  it("ne preleve rien sur une assiette nulle ou negative", () => {
    expect(calculerCommission(0, 5)).toBe(0);
    expect(calculerCommission(-1_000, 5)).toBe(0);
  });

  it("ignore un taux aberrant plutot que de produire NaN", () => {
    expect(calculerCommission(10_000, Number.NaN)).toBe(0);
    expect(calculerCommission(10_000, -3)).toBe(0);
  });
});

describe("tauxCommissionActif", () => {
  it("retourne le taux actif", async () => {
    prismaMock.commission.findFirst.mockResolvedValue({ ratePercent: 4.5 });
    expect(await tauxCommissionActif()).toBe(4.5);
  });

  it("retourne 0 quand aucune commission n'est active", async () => {
    prismaMock.commission.findFirst.mockResolvedValue(null);
    expect(await tauxCommissionActif()).toBe(0);
  });

  it("prend la plus recente si plusieurs lignes restent actives", async () => {
    prismaMock.commission.findFirst.mockResolvedValue({ ratePercent: 8 });
    await tauxCommissionActif();

    // Une reprise de donnees peut laisser deux lignes actives : l'ordre doit
    // etre explicite, sinon la base rend une ligne arbitraire.
    expect(prismaMock.commission.findFirst.mock.calls[0][0].orderBy).toEqual({
      createdAt: "desc",
    });
  });

  it("neutralise un taux aberrant lu en base", async () => {
    // Une valeur a 300 % viderait la vente du vendeur. Mieux vaut ne rien
    // prelever que prelever n'importe quoi.
    prismaMock.commission.findFirst.mockResolvedValue({ ratePercent: 300 });
    expect(await tauxCommissionActif()).toBe(0);
  });
});

describe("preleverCommission", () => {
  it("inscrit un DEBIT au journal, avec le taux fige", async () => {
    txMock.commission.findFirst.mockResolvedValue({ ratePercent: 5 });

    const res = await preleverCommission(txMock as never, {
      orderId: "o1",
      assiette: 20_000,
    });

    expect(res).toEqual({ montant: 1_000, taux: 5 });

    const ecrit = txMock.transaction.create.mock.calls[0][0].data;
    expect(ecrit.type).toBe("COMMISSION");
    // Signe negatif : la convention de `Transaction.amount` est
    // « + credit / - debit ». Ecrire 1 000 en positif ferait apparaitre la
    // commission comme une recette du vendeur.
    expect(ecrit.amount).toBe(-1_000);
    // Le taux est stocke sur l'ecriture, pas relu plus tard : c'est ce qui
    // rend la ligne verifiable apres un changement de taux.
    expect(ecrit.rate).toBe(5);
    expect(ecrit.orderId).toBe("o1");
  });

  it("n'ecrit rien quand aucun taux n'est actif", async () => {
    txMock.commission.findFirst.mockResolvedValue(null);

    const res = await preleverCommission(txMock as never, {
      orderId: "o1",
      assiette: 20_000,
    });

    expect(res.montant).toBe(0);
    // Une ligne a 0 FCFA encombrerait le journal sans rien apprendre.
    expect(txMock.transaction.create).not.toHaveBeenCalled();
  });

  it("n'ecrit rien quand l'arrondi ramene le montant a zero", async () => {
    // 1 % de 50 = 0,5 -> 0.
    txMock.commission.findFirst.mockResolvedValue({ ratePercent: 1 });

    const res = await preleverCommission(txMock as never, {
      orderId: "o1",
      assiette: 50,
    });

    expect(res.montant).toBe(0);
    expect(txMock.transaction.create).not.toHaveBeenCalled();
  });

  it("lit le taux DANS la transaction en cours, pas hors d'elle", async () => {
    txMock.commission.findFirst.mockResolvedValue({ ratePercent: 5 });

    await preleverCommission(txMock as never, {
      orderId: "o1",
      assiette: 20_000,
    });

    // Le taux doit etre lu par le client transactionnel : le lire sur le
    // client global sortirait de l'isolation de la liberation.
    expect(txMock.commission.findFirst).toHaveBeenCalled();
    expect(prismaMock.commission.findFirst).not.toHaveBeenCalled();
  });
});
