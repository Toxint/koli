import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Litiges (§31-33).
 *
 * Ce qui est protege ici, ce sont les regles d'ARGENT et de ROLE :
 *  - seul le client ouvre un litige ; un vendeur pourrait sinon bloquer un
 *    versement qu'il doit ;
 *  - seule l'administration tranche ;
 *  - la liberation reste restreinte a la commande concernee, jamais au vendeur ;
 *  - un litige tranche ne se rejoue pas.
 */

const prismaMock = {
  order: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  dispute: { create: vi.fn(), updateMany: vi.fn() },
  disputeMessage: { create: vi.fn() },
  orderStatusHistory: { create: vi.fn() },
  fund: { updateMany: vi.fn() },
  refund: { create: vi.fn() },
  transaction: { create: vi.fn() },
  // La liberation des fonds preleve desormais la commission (§41) : le client
  // transactionnel doit donc savoir lire le taux actif.
  commission: { findFirst: vi.fn() },
  user: { findMany: vi.fn() },
  // Le journal d'audit (§48) est ecrit dans la MEME transaction que l'acte :
  // le faux client doit donc le connaitre, sinon l'acte echoue.
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
};

const getCurrentUserMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/actions", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  ouvrirLitigeAction,
  ajouterMessageLitigeAction,
  trancherLitigeAction,
} = await import("@/lib/disputes/actions");

const CLIENT = {
  id: "u-client",
  role: "CLIENT",
  name: "Awa",
  phone: "+2250505050505",
  sellerProfile: null,
  customerProfile: { id: "c1" },
};
const VENDEUR = {
  id: "u-vendeur",
  role: "SELLER",
  name: "Boutique",
  phone: "+2250701020304",
  sellerProfile: { id: "s1" },
  customerProfile: null,
};
const ADMIN = {
  id: "u-admin",
  role: "ADMIN",
  name: "Admin",
  phone: "+2250700000000",
  sellerProfile: null,
  customerProfile: null,
};

const COMMANDE = {
  id: "o1",
  reference: "KOLI-ABCDEFGH",
  sellerId: "s1",
  customerId: "c1",
  buyerPhone: "+2250505050505",
  status: "DELIVERED",
  deliveryFee: 2000,
  dispute: null,
  fund: { amount: 18500, secured: true, released: false },
};

function formulaire(champs: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.append(k, v);
  return fd;
}

const OUVERTURE = {
  motif: "NOT_RECEIVED",
  description: "Le colis n'est jamais arrive chez moi.",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Par defaut, la transaction execute la closure avec le meme mock.
  prismaMock.$transaction.mockImplementation(async (f: (tx: unknown) => unknown) =>
    f(prismaMock)
  );
  prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.dispute.updateMany.mockResolvedValue({ count: 1 });
});

describe("ouverture d'un litige", () => {
  it("refuse un visiteur non connecte", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await ouvrirLitigeAction("KOLI-ABCDEFGH", formulaire(OUVERTURE));
    expect(res.success).toBe(false);
    expect(prismaMock.dispute.create).not.toHaveBeenCalled();
  });

  it("refuse le VENDEUR de la commande", async () => {
    // Sinon un vendeur bloquerait a volonte un versement qu'il doit.
    getCurrentUserMock.mockResolvedValue(VENDEUR);
    prismaMock.order.findUnique.mockResolvedValue(COMMANDE);

    const res = await ouvrirLitigeAction("KOLI-ABCDEFGH", formulaire(OUVERTURE));

    expect(res.success).toBe(false);
    expect(prismaMock.dispute.create).not.toHaveBeenCalled();
  });

  it("refuse un client etranger a la commande", async () => {
    getCurrentUserMock.mockResolvedValue({
      ...CLIENT,
      customerProfile: { id: "AUTRE" },
      phone: "+2250000000000",
    });
    prismaMock.order.findUnique.mockResolvedValue(COMMANDE);

    const res = await ouvrirLitigeAction("KOLI-ABCDEFGH", formulaire(OUVERTURE));

    expect(res.success).toBe(false);
    expect(prismaMock.dispute.create).not.toHaveBeenCalled();
  });

  it("refuse si les fonds n'ont jamais ete sequestres", async () => {
    getCurrentUserMock.mockResolvedValue(CLIENT);
    prismaMock.order.findUnique.mockResolvedValue({
      ...COMMANDE,
      status: "PAYMENT_PENDING",
      fund: { amount: 18500, secured: false, released: false },
    });

    const res = await ouvrirLitigeAction("KOLI-ABCDEFGH", formulaire(OUVERTURE));

    expect(res.success).toBe(false);
    expect(prismaMock.dispute.create).not.toHaveBeenCalled();
  });

  it("refuse un second litige sur la meme commande", async () => {
    getCurrentUserMock.mockResolvedValue(CLIENT);
    prismaMock.order.findUnique.mockResolvedValue({
      ...COMMANDE,
      dispute: { id: "d1", status: "OPEN" },
    });

    const res = await ouvrirLitigeAction("KOLI-ABCDEFGH", formulaire(OUVERTURE));

    expect(res.success).toBe(false);
    expect(prismaMock.dispute.create).not.toHaveBeenCalled();
  });

  it("refuse une description trop courte", async () => {
    getCurrentUserMock.mockResolvedValue(CLIENT);
    prismaMock.order.findUnique.mockResolvedValue(COMMANDE);

    const res = await ouvrirLitigeAction(
      "KOLI-ABCDEFGH",
      formulaire({ ...OUVERTURE, description: "rien" })
    );

    expect(res.success).toBe(false);
    expect(prismaMock.dispute.create).not.toHaveBeenCalled();
  });

  it("ouvre le litige et bascule la commande en DISPUTE_OPEN", async () => {
    getCurrentUserMock.mockResolvedValue(CLIENT);
    prismaMock.order.findUnique.mockResolvedValue(COMMANDE);

    const res = await ouvrirLitigeAction("KOLI-ABCDEFGH", formulaire(OUVERTURE));

    expect(res.success).toBe(true);
    expect(prismaMock.order.updateMany.mock.calls[0][0].data.status).toBe(
      "DISPUTE_OPEN"
    );
    const cree = prismaMock.dispute.create.mock.calls[0][0].data;
    expect(cree.status).toBe("OPEN");
    expect(cree.reason).toBe("NOT_RECEIVED");
  });

  it("peut etre ouvert AVANT livraison : « produit non recu »", async () => {
    // Le premier motif du §31 vise un colis qui n'arrive jamais. Restreindre
    // le litige a DELIVERED laissait ce client sans recours, argent bloque.
    getCurrentUserMock.mockResolvedValue(CLIENT);
    prismaMock.order.findUnique.mockResolvedValue({
      ...COMMANDE,
      status: "IN_TRANSIT",
    });

    const res = await ouvrirLitigeAction("KOLI-ABCDEFGH", formulaire(OUVERTURE));

    expect(res.success).toBe(true);
  });
});

describe("fil du litige", () => {
  it("refuse un tiers etranger au litige", async () => {
    getCurrentUserMock.mockResolvedValue({
      ...CLIENT,
      customerProfile: { id: "AUTRE" },
      phone: "+2250000000000",
    });
    prismaMock.order.findUnique.mockResolvedValue({
      ...COMMANDE,
      dispute: { id: "d1", status: "OPEN" },
    });

    const res = await ajouterMessageLitigeAction(
      "KOLI-ABCDEFGH",
      formulaire({ message: "je passais par la" })
    );

    expect(res.success).toBe(false);
    expect(prismaMock.disputeMessage.create).not.toHaveBeenCalled();
  });

  it("accepte le vendeur mis en cause", async () => {
    getCurrentUserMock.mockResolvedValue(VENDEUR);
    prismaMock.order.findUnique.mockResolvedValue({
      ...COMMANDE,
      dispute: { id: "d1", status: "OPEN" },
    });
    prismaMock.disputeMessage.create.mockResolvedValue({});

    const res = await ajouterMessageLitigeAction(
      "KOLI-ABCDEFGH",
      formulaire({ message: "J'ai bien expedie le colis le 12." })
    );

    expect(res.success).toBe(true);
  });

  it("refuse d'ecrire dans un litige deja tranche", async () => {
    getCurrentUserMock.mockResolvedValue(CLIENT);
    prismaMock.order.findUnique.mockResolvedValue({
      ...COMMANDE,
      dispute: { id: "d1", status: "SELLER_WINS" },
    });

    const res = await ajouterMessageLitigeAction(
      "KOLI-ABCDEFGH",
      formulaire({ message: "je ne suis pas d'accord" })
    );

    expect(res.success).toBe(false);
    expect(prismaMock.disputeMessage.create).not.toHaveBeenCalled();
  });
});

describe("arbitrage", () => {
  const EN_LITIGE = {
    ...COMMANDE,
    status: "DISPUTE_OPEN",
    dispute: { id: "d1", status: "OPEN", resolvedAt: null },
  };
  const DECISION = {
    decision: "SELLER_WINS",
    motivation: "Le colis a bien ete remis, preuve de livraison a l'appui.",
  };

  it("refuse le client", async () => {
    getCurrentUserMock.mockResolvedValue(CLIENT);
    const res = await trancherLitigeAction("KOLI-ABCDEFGH", formulaire(DECISION));
    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuse le vendeur", async () => {
    getCurrentUserMock.mockResolvedValue(VENDEUR);
    const res = await trancherLitigeAction("KOLI-ABCDEFGH", formulaire(DECISION));
    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuse une decision hors liste blanche", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN);
    const res = await trancherLitigeAction(
      "KOLI-ABCDEFGH",
      formulaire({ ...DECISION, decision: "KOLI_WINS" })
    );
    expect(res.success).toBe(false);
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
  });

  it("exige une motivation : les deux parties la liront", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN);
    const res = await trancherLitigeAction(
      "KOLI-ABCDEFGH",
      formulaire({ ...DECISION, motivation: "non" })
    );
    expect(res.success).toBe(false);
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
  });

  it("en faveur du vendeur : libere UNIQUEMENT cette commande", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN);
    prismaMock.order.findUnique.mockResolvedValue(EN_LITIGE);
    prismaMock.fund.updateMany.mockResolvedValue({ count: 1 });

    const res = await trancherLitigeAction("KOLI-ABCDEFGH", formulaire(DECISION));

    expect(res.success).toBe(true);
    const ou = prismaMock.fund.updateMany.mock.calls[0][0].where;
    // Un filtre par sellerId viderait tout le sequestre du vendeur.
    expect(ou).toEqual({ orderId: "o1", released: false });
    expect(prismaMock.refund.create).not.toHaveBeenCalled();
  });

  it("en faveur du vendeur : preleve aussi la commission (§41)", async () => {
    // Il existe DEUX chemins de liberation : la confirmation du client, et
    // l'arbitrage. En oublier un ne casserait rien de visible — la plateforme
    // cesserait simplement de se remunerer sur les commandes arbitrees, qui
    // sont justement celles qui lui ont coute le plus de travail.
    getCurrentUserMock.mockResolvedValue(ADMIN);
    prismaMock.order.findUnique.mockResolvedValue(EN_LITIGE);
    prismaMock.fund.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.commission.findFirst.mockResolvedValue({ ratePercent: 5 });

    await trancherLitigeAction("KOLI-ABCDEFGH", formulaire(DECISION));

    const ecritures = prismaMock.transaction.create.mock.calls.map(
      (c) => c[0].data
    );
    expect(ecritures).toContainEqual(
      expect.objectContaining({ type: "FUNDS_RELEASED", amount: 18500 })
    );
    // 5 % de 18 500 = 925, en debit.
    expect(ecritures).toContainEqual(
      expect.objectContaining({ type: "COMMISSION", amount: -925, rate: 5 })
    );
  });

  it("en faveur du client : aucune commission, rien n'a ete verse", async () => {
    // Le coeur du choix de conception : prelever au paiement obligerait a
    // rendre la commission ici. Prelever a la liberation fait disparaitre le
    // probleme — une commande remboursee ne coute rien au vendeur.
    getCurrentUserMock.mockResolvedValue(ADMIN);
    prismaMock.order.findUnique.mockResolvedValue(EN_LITIGE);
    prismaMock.refund.create.mockResolvedValue({});
    prismaMock.commission.findFirst.mockResolvedValue({ ratePercent: 5 });

    await trancherLitigeAction(
      "KOLI-ABCDEFGH",
      formulaire({ ...DECISION, decision: "CUSTOMER_WINS" })
    );

    const types = prismaMock.transaction.create.mock.calls.map(
      (c) => c[0].data.type
    );
    expect(types).not.toContain("COMMISSION");
  });

  it("en faveur du client : inscrit la creance, ne libere rien", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN);
    prismaMock.order.findUnique.mockResolvedValue(EN_LITIGE);
    prismaMock.refund.create.mockResolvedValue({});

    const res = await trancherLitigeAction(
      "KOLI-ABCDEFGH",
      formulaire({ ...DECISION, decision: "CUSTOMER_WINS" })
    );

    expect(res.success).toBe(true);
    expect(prismaMock.fund.updateMany).not.toHaveBeenCalled();
    // Articles + livraison : le client a regle les deux.
    expect(prismaMock.refund.create.mock.calls[0][0].data.amount).toBe(20500);
    expect(prismaMock.order.update.mock.calls[0][0].data.status).toBe(
      "REFUND_PENDING"
    );
  });

  it("refuse de trancher deux fois", async () => {
    getCurrentUserMock.mockResolvedValue(ADMIN);
    prismaMock.order.findUnique.mockResolvedValue({
      ...EN_LITIGE,
      dispute: { id: "d1", status: "SELLER_WINS", resolvedAt: new Date() },
    });

    const res = await trancherLitigeAction("KOLI-ABCDEFGH", formulaire(DECISION));

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
