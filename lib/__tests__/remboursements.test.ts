import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Remboursements simules (phase 22).
 *
 * La regle cardinale est le §30 — « le systeme doit empecher : deux
 * validations, deux liberations, DEUX REMBOURSEMENTS, deux confirmations de
 * paiement ». C'est elle que ces tests protegent en premier, avec le role et
 * la restitution de stock, qui n'est PAS automatique.
 */
const prismaMock = {
  // Le journal d'audit (§48) est ecrit dans la MEME transaction que l'acte :
  // le faux client doit donc le connaitre, sinon l'acte echoue.
  auditLog: { create: vi.fn() },
  order: { findUnique: vi.fn(), update: vi.fn() },
  refund: { updateMany: vi.fn() },
  fund: { updateMany: vi.fn() },
  product: { update: vi.fn() },
  transaction: { create: vi.fn() },
  orderStatusHistory: { create: vi.fn() },
  $transaction: vi.fn(),
};

const getCurrentUserMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/actions", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { traiterRemboursementAction } = await import("@/lib/refunds/actions");

const ADMIN = { id: "a1", role: "ADMIN", name: "Admin" };
const VENDEUR = { id: "s1", role: "SELLER", name: "Boutique" };

const A_REMBOURSER = {
  id: "o1",
  reference: "KOLI-ABCDEFGH",
  status: "REFUND_PENDING",
  items: [
    { productId: "p1", quantity: 2 },
    { productId: "p2", quantity: 1 },
  ],
  fund: { amount: 18500, released: false },
  refund: { id: "r1", status: "PENDING", amount: 20500 },
};

function formulaire(champs: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (f: (tx: unknown) => unknown) =>
    f(prismaMock)
  );
  prismaMock.refund.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.fund.updateMany.mockResolvedValue({ count: 1 });
});

describe("role", () => {
  it("refuse un utilisateur qui n'est pas administrateur", async () => {
    getCurrentUserMock.mockResolvedValue(VENDEUR);

    const res = await traiterRemboursementAction("KOLI-ABCDEFGH", formulaire());

    expect(res.success).toBe(false);
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
  });

  it("refuse un visiteur non connecte", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const res = await traiterRemboursementAction("KOLI-ABCDEFGH", formulaire());

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("traitement", () => {
  beforeEach(() => getCurrentUserMock.mockResolvedValue(ADMIN));

  it("refuse une commande sans remboursement", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      ...A_REMBOURSER,
      refund: null,
    });

    const res = await traiterRemboursementAction("KOLI-ABCDEFGH", formulaire());

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuse une commande qui n'est pas en attente de remboursement", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      ...A_REMBOURSER,
      status: "FUNDS_SECURED",
    });

    const res = await traiterRemboursementAction("KOLI-ABCDEFGH", formulaire());

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("inscrit le mouvement au journal en NEGATIF : l'argent sort", async () => {
    prismaMock.order.findUnique.mockResolvedValue(A_REMBOURSER);

    const res = await traiterRemboursementAction("KOLI-ABCDEFGH", formulaire());

    expect(res.success).toBe(true);
    const ecrit = prismaMock.transaction.create.mock.calls[0][0].data;
    expect(ecrit.type).toBe("REFUND");
    expect(ecrit.amount).toBe(-20500);
    expect(prismaMock.order.update.mock.calls[0][0].data.status).toBe("REFUNDED");
  });

  it("solde le sequestre : l'argent n'est plus un engagement de la plateforme", async () => {
    prismaMock.order.findUnique.mockResolvedValue(A_REMBOURSER);

    await traiterRemboursementAction("KOLI-ABCDEFGH", formulaire());

    // Restreint a CETTE commande, jamais au vendeur.
    expect(prismaMock.fund.updateMany.mock.calls[0][0].where).toEqual({
      orderId: "o1",
      released: false,
    });
  });
});

describe("idempotence (§30)", () => {
  beforeEach(() => getCurrentUserMock.mockResolvedValue(ADMIN));

  it("ne rembourse pas deux fois un remboursement deja traite", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      ...A_REMBOURSER,
      refund: { id: "r1", status: "COMPLETED", amount: 20500 },
    });

    const res = await traiterRemboursementAction("KOLI-ABCDEFGH", formulaire());

    // Ce n'est pas une erreur : l'etat voulu est deja atteint.
    expect(res.success).toBe(true);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });

  it("deux appels simultanes n'ecrivent qu'une fois", async () => {
    prismaMock.order.findUnique.mockResolvedValue(A_REMBOURSER);
    // L'ecriture conditionnelle ne trouve plus rien : un autre appel a gagne.
    prismaMock.refund.updateMany.mockResolvedValue({ count: 0 });

    const res = await traiterRemboursementAction("KOLI-ABCDEFGH", formulaire());

    expect(res.success).toBe(true);
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });
});

describe("restitution du stock", () => {
  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(ADMIN);
    prismaMock.order.findUnique.mockResolvedValue(A_REMBOURSER);
  });

  it("ne remet RIEN au catalogue par defaut", async () => {
    // Remettre a tort cree du stock fantome, donc de la survente, donc une
    // autre commande impossible a honorer. Ne pas remettre laisse simplement
    // un compteur a corriger. Le defaut penche du bon cote.
    await traiterRemboursementAction("KOLI-ABCDEFGH", formulaire());

    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it("remet chaque article dans sa quantite exacte quand on le demande", async () => {
    prismaMock.product.update.mockResolvedValue({});

    await traiterRemboursementAction(
      "KOLI-ABCDEFGH",
      formulaire({ restituerStock: "on" })
    );

    const appels = prismaMock.product.update.mock.calls.map((c) => c[0]);
    expect(appels).toHaveLength(2);
    expect(appels[0].where).toEqual({ id: "p1" });
    expect(appels[0].data).toEqual({ quantity: { increment: 2 } });
    expect(appels[1].where).toEqual({ id: "p2" });
    expect(appels[1].data).toEqual({ quantity: { increment: 1 } });
  });
});
