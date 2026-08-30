import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests des garde-fous de securite des actions serveur.
 *
 * On se concentre ici sur les CONTROLES D'ACCES et l'IDEMPOTENCE — c'est-a-dire
 * les chemins qui doivent refuser ou ne rien faire. Ce sont eux qui ont
 * historiquement manque (paiement sans authentification, livraison validee par
 * un autre livreur, fonds liberes deux fois), et ce sont eux qui doivent le
 * rester quoi qu'il arrive.
 *
 * Prisma est mocke : ces tests verifient la logique de decision, pas la base.
 */

const prismaMock = {
  order: { findUnique: vi.fn(), update: vi.fn() },
  delivery: { findUnique: vi.fn(), update: vi.fn() },
  driverProfile: { findUnique: vi.fn(), findMany: vi.fn() },
  // §5.3 — la table des equipes. `assignDriverAction` ne demande plus « ce
  // livreur existe-t-il ? » mais « travaille-t-il pour MOI ? ».
  sellerDriver: { findUnique: vi.fn(), findMany: vi.fn() },
  otpCode: { update: vi.fn(), updateMany: vi.fn() },
  fund: { update: vi.fn(), updateMany: vi.fn() },
  payment: { updateMany: vi.fn() },
  transaction: { create: vi.fn() },
  // La liberation des fonds preleve desormais la commission (§41) : le client
  // transactionnel doit donc savoir lire le taux actif.
  commission: { findFirst: vi.fn() },
  orderStatusHistory: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  deliveryProof: { create: vi.fn() },
  $transaction: vi.fn(),
};

const getCurrentUserMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/actions", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { simulatePaymentAction } = await import("@/lib/payments/actions");
const { validateDeliveryOtpAction } = await import("@/lib/deliveries/actions");
const { confirmReceptionAction } = await import("@/lib/orders/actions");
const { assignDriverAction } = await import("@/lib/deliveries/assign");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("simulatePaymentAction", () => {
  it("refuse un scenario de paiement inconnu", async () => {
    const res = await simulatePaymentAction("KOLI-ABCDEFGH", "AUTRE" as never);
    expect(res.success).toBe(false);
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
  });

  it("refuse une reference vide sans interroger la base", async () => {
    const res = await simulatePaymentAction("   ", "SUCCESS");
    expect(res.success).toBe(false);
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
  });

  it("est idempotent : un paiement deja abouti n'ecrit rien", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "o1",
      reference: "KOLI-ABCDEFGH",
      sellerId: "s1",
      customerId: "c1",
      status: "FUNDS_SECURED",
      payment: { status: "SUCCEEDED", amount: 20500 },
      fund: { amount: 18500 },
    });

    const res = await simulatePaymentAction("KOLI-ABCDEFGH", "SUCCESS");

    expect(res).toEqual({ success: true, status: "FUNDS_SECURED" });
    // Le point crucial : aucune ecriture comptable supplementaire.
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });

  it("refuse de payer une commande deja livree (transition illegale)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "o1",
      reference: "KOLI-ABCDEFGH",
      status: "DELIVERED",
      payment: { status: "PENDING", amount: 20500 },
      fund: { amount: 18500 },
    });

    const res = await simulatePaymentAction("KOLI-ABCDEFGH", "SUCCESS");

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("validateDeliveryOtpAction", () => {
  const livreur = {
    id: "u-livreur",
    role: "DRIVER",
    driverProfile: { id: "d1" },
  };

  it("refuse un utilisateur qui n'est pas livreur", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "CLIENT" });

    const res = await validateDeliveryOtpAction("del1", "4821");

    expect(res.success).toBe(false);
    expect(prismaMock.delivery.findUnique).not.toHaveBeenCalled();
  });

  it("refuse un livreur a qui la livraison n'est pas assignee", async () => {
    getCurrentUserMock.mockResolvedValue(livreur);
    prismaMock.delivery.findUnique.mockResolvedValue({
      id: "del1",
      driverId: "un-autre-livreur",
      status: "ASSIGNED",
      order: { status: "FUNDS_SECURED" },
      otpCodes: [],
    });

    const res = await validateDeliveryOtpAction("del1", "4821");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/assignée/i);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuse l'ancienne backdoor « 1234 »", async () => {
    getCurrentUserMock.mockResolvedValue(livreur);
    prismaMock.delivery.findUnique.mockResolvedValue({
      id: "del1",
      driverId: "d1",
      orderId: "o1",
      status: "ASSIGNED",
      order: { status: "FUNDS_SECURED", reference: "KOLI-ABCDEFGH", fund: { secured: true } },
      otpCodes: [
        {
          id: "otp1",
          code: "4821",
          attempts: 0,
          maxAttempts: 5,
          consumedAt: null,
          createdAt: new Date(),
        },
      ],
    });
    prismaMock.otpCode.update.mockResolvedValue({ attempts: 1, maxAttempts: 5 });

    const res = await validateDeliveryOtpAction("del1", "1234");

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("incremente les tentatives sur un code errone", async () => {
    getCurrentUserMock.mockResolvedValue(livreur);
    prismaMock.delivery.findUnique.mockResolvedValue({
      id: "del1",
      driverId: "d1",
      orderId: "o1",
      status: "ASSIGNED",
      order: { status: "FUNDS_SECURED", reference: "KOLI-ABCDEFGH", fund: { secured: true } },
      otpCodes: [
        {
          id: "otp1",
          code: "4821",
          attempts: 1,
          maxAttempts: 5,
          consumedAt: null,
          createdAt: new Date(),
        },
      ],
    });
    prismaMock.otpCode.update.mockResolvedValue({ attempts: 2, maxAttempts: 5 });

    const res = await validateDeliveryOtpAction("del1", "0000");

    expect(res.success).toBe(false);
    expect(res.attemptsLeft).toBe(3);
    expect(prismaMock.otpCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } })
    );
  });

  it("bloque au-dela du nombre maximal de tentatives", async () => {
    getCurrentUserMock.mockResolvedValue(livreur);
    prismaMock.delivery.findUnique.mockResolvedValue({
      id: "del1",
      driverId: "d1",
      orderId: "o1",
      status: "ASSIGNED",
      order: { status: "FUNDS_SECURED", reference: "KOLI-ABCDEFGH", fund: { secured: true } },
      otpCodes: [
        {
          id: "otp1",
          code: "4821",
          attempts: 5,
          maxAttempts: 5,
          consumedAt: null,
          createdAt: new Date(),
        },
      ],
    });

    // Meme avec le BON code : le quota est epuise.
    const res = await validateDeliveryOtpAction("del1", "4821");

    expect(res.success).toBe(false);
    expect(res.attemptsLeft).toBe(0);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("ignore un code deja consomme", async () => {
    getCurrentUserMock.mockResolvedValue(livreur);
    prismaMock.delivery.findUnique.mockResolvedValue({
      id: "del1",
      driverId: "d1",
      orderId: "o1",
      status: "ASSIGNED",
      order: { status: "FUNDS_SECURED", reference: "KOLI-ABCDEFGH", fund: { secured: true } },
      otpCodes: [
        {
          id: "otp1",
          code: "4821",
          attempts: 0,
          maxAttempts: 5,
          consumedAt: new Date(),
          createdAt: new Date(),
        },
      ],
    });

    const res = await validateDeliveryOtpAction("del1", "4821");

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuse de livrer une commande dont les fonds ne sont pas sequestres", async () => {
    getCurrentUserMock.mockResolvedValue(livreur);
    prismaMock.delivery.findUnique.mockResolvedValue({
      id: "del1",
      driverId: "d1",
      orderId: "o1",
      status: "ASSIGNED",
      // Commande jamais payee.
      order: {
        status: "PAYMENT_PENDING",
        reference: "KOLI-ABCDEFGH",
        fund: { secured: false },
      },
      otpCodes: [
        {
          id: "otp1",
          code: "4821",
          attempts: 0,
          maxAttempts: 5,
          consumedAt: null,
          createdAt: new Date(),
        },
      ],
    });

    const res = await validateDeliveryOtpAction("del1", "4821");

    expect(res.success).toBe(false);
    // Sans ce garde-fou, l'historique enregistrait des etapes de paiement
    // qui n'ont jamais eu lieu.
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("assignDriverAction", () => {
  const vendeur = {
    id: "u-vendeur",
    role: "SELLER",
    sellerProfile: { id: "s1" },
  };

  const commandePayee = {
    id: "o1",
    reference: "KOLI-ABCDEFGH",
    sellerId: "s1",
    status: "FUNDS_SECURED",
    fund: { secured: true },
    delivery: { status: "UNASSIGNED" },
  };

  it("refuse un utilisateur qui n'est pas vendeur", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", role: "CLIENT" });

    const res = await assignDriverAction("KOLI-ABCDEFGH", "d1");

    expect(res.success).toBe(false);
    expect(prismaMock.order.findUnique).not.toHaveBeenCalled();
  });

  it("refuse d'assigner sur la commande d'un autre vendeur", async () => {
    getCurrentUserMock.mockResolvedValue(vendeur);
    prismaMock.order.findUnique.mockResolvedValue({
      ...commandePayee,
      sellerId: "un-autre-vendeur",
    });

    const res = await assignDriverAction("KOLI-ABCDEFGH", "d1");

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuse tant que les fonds ne sont pas sequestres", async () => {
    getCurrentUserMock.mockResolvedValue(vendeur);
    prismaMock.order.findUnique.mockResolvedValue({
      ...commandePayee,
      status: "PAYMENT_PENDING",
      fund: { secured: false },
    });

    const res = await assignDriverAction("KOLI-ABCDEFGH", "d1");

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  /**
   * §5.3 — LA garde. Un vendeur ne peut assigner que SES livreurs.
   *
   * Le code renvoyait auparavant tous les livreurs actifs de la plateforme et
   * ne vérifiait, à l'assignation, que l'existence et le statut du compte. Un
   * vendeur pouvait donc faire porter ses colis par le livreur d'un concurrent
   * — il suffisait de remplacer l'identifiant dans le formulaire.
   *
   * Ce test le fixe : `sellerDriver.findUnique` ne trouve rien, donc refus, et
   * surtout **aucune transaction n'est ouverte**.
   */
  it("refuse un livreur qui n'est pas dans l'equipe du vendeur", async () => {
    getCurrentUserMock.mockResolvedValue(vendeur);
    prismaMock.order.findUnique.mockResolvedValue(commandePayee);
    prismaMock.sellerDriver.findUnique.mockResolvedValue(null);

    const res = await assignDriverAction("KOLI-ABCDEFGH", "d-etranger");

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    // La question posee est bien « travaille-t-il pour MOI ? », et elle porte
    // sur le couple vendeur+livreur — pas sur le seul livreur.
    expect(prismaMock.sellerDriver.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sellerId_driverId: { sellerId: "s1", driverId: "d-etranger" } },
      })
    );
  });

  it("refuse un livreur suspendu", async () => {
    getCurrentUserMock.mockResolvedValue(vendeur);
    prismaMock.order.findUnique.mockResolvedValue(commandePayee);
    prismaMock.sellerDriver.findUnique.mockResolvedValue({
      driver: {
        id: "d1",
        available: true,
        user: { name: "Kouassi", status: "SUSPENDED" },
      },
    });

    const res = await assignDriverAction("KOLI-ABCDEFGH", "d1");

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  /**
   * Indisponible : le livreur l'a declare lui-meme, et lui seul.
   *
   * Passer outre reviendrait a lui confier un colis apres qu'il a dit ne pas en
   * prendre. Le colis resterait sur place, et c'est le client qui l'apprendrait.
   */
  it("refuse un livreur qui s'est declare indisponible", async () => {
    getCurrentUserMock.mockResolvedValue(vendeur);
    prismaMock.order.findUnique.mockResolvedValue(commandePayee);
    prismaMock.sellerDriver.findUnique.mockResolvedValue({
      driver: {
        id: "d1",
        available: false,
        user: { name: "Kouassi Express", status: "ACTIVE" },
      },
    });

    const res = await assignDriverAction("KOLI-ABCDEFGH", "d1");

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("assigne le livreur et fait avancer la commande", async () => {
    getCurrentUserMock.mockResolvedValue(vendeur);
    prismaMock.order.findUnique.mockResolvedValue(commandePayee);
    prismaMock.sellerDriver.findUnique.mockResolvedValue({
      driver: {
        id: "d1",
        available: true,
        user: { name: "Kouassi Express", status: "ACTIVE" },
      },
    });

    const tx = {
      // Les notifications (§44) sont ecrites dans la MEME transaction que
      // l'evenement : le faux client doit connaitre ces tables, sinon l'action
      // echoue avant d'avoir rien fait.
      notification: { createMany: vi.fn() },
      user: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
      driverProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "u-livreur" }) },
      delivery: { update: vi.fn() },
      order: {
        update: vi.fn(),
        // Lue par `partiesDeLaCommande` pour savoir qui prevenir.
        findUnique: vi.fn().mockResolvedValue({
          buyerPhone: "+2250505050505",
          seller: { userId: "u-vendeur" },
          customer: { userId: "u-client" },
        }),
      },
      orderStatusHistory: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    prismaMock.$transaction.mockImplementation(
      async (cb: (t: typeof tx) => unknown) => cb(tx)
    );

    const res = await assignDriverAction("KOLI-ABCDEFGH", "d1");

    expect(res).toEqual({ success: true, driverName: "Kouassi Express" });
    expect(tx.delivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ driverId: "d1", status: "ASSIGNED" }),
      })
    );
    // La commande doit passer a SELLER_ACCEPTED : transition legale depuis
    // FUNDS_SECURED, et c'est bien ce que signifie assigner un livreur.
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "SELLER_ACCEPTED" },
      })
    );
  });
});

describe("confirmReceptionAction — autorisation", () => {
  const commandeLivree = {
    id: "o1",
    reference: "KOLI-ABCDEFGH",
    sellerId: "s1",
    customerId: "c1",
    buyerPhone: "+2250505050505",
    status: "DELIVERED",
    fund: { amount: 18500, released: false, secured: true },
  };

  it("refuse un visiteur non connecte", async () => {
    prismaMock.order.findUnique.mockResolvedValue(commandeLivree);
    getCurrentUserMock.mockResolvedValue(null);

    const res = await confirmReceptionAction("KOLI-ABCDEFGH");

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuse le VENDEUR de la commande — il ne peut pas se payer lui-meme", async () => {
    // Le scenario concret : le vendeur ouvre son propre bouton « Partager le
    // lien » et clique sur « Oui, j'ai recu ma commande ».
    prismaMock.order.findUnique.mockResolvedValue(commandeLivree);
    getCurrentUserMock.mockResolvedValue({
      id: "u-vendeur",
      role: "SELLER",
      sellerProfile: { id: "s1" },
      customerProfile: { id: "autre" },
    });

    const res = await confirmReceptionAction("KOLI-ABCDEFGH");

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuse un client tiers detenteur du lien", async () => {
    prismaMock.order.findUnique.mockResolvedValue(commandeLivree);
    getCurrentUserMock.mockResolvedValue({
      id: "u-autre",
      role: "CLIENT",
      phone: "+2250700000000",
      customerProfile: { id: "c2" },
    });

    const res = await confirmReceptionAction("KOLI-ABCDEFGH");

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("accepte le client rattache a la commande", async () => {
    prismaMock.order.findUnique.mockResolvedValue(commandeLivree);
    getCurrentUserMock.mockResolvedValue({
      id: "u-client",
      role: "CLIENT",
      phone: "+2250505050505",
      customerProfile: { id: "c1" },
    });

    const tx = {
      // Les notifications (§44) sont ecrites dans la MEME transaction que
      // l'evenement : le faux client doit connaitre ces tables, sinon l'action
      // echoue avant d'avoir rien fait.
      notification: { createMany: vi.fn() },
      user: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
      driverProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "u-livreur" }) },
      fund: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      transaction: { create: vi.fn(), createMany: vi.fn() },
      // La liberation preleve la commission (§41) dans la MEME transaction.
      commission: { findFirst: vi.fn().mockResolvedValue({ ratePercent: 5 }) },
      order: {
        update: vi.fn(),
        // Lue par `partiesDeLaCommande` pour savoir qui prevenir.
        findUnique: vi.fn().mockResolvedValue({
          buyerPhone: "+2250505050505",
          seller: { userId: "u-vendeur" },
          customer: { userId: "u-client" },
        }),
      },
      orderStatusHistory: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    prismaMock.$transaction.mockImplementation(
      async (cb: (t: typeof tx) => unknown) => cb(tx)
    );

    const res = await confirmReceptionAction("KOLI-ABCDEFGH");

    expect(res.success).toBe(true);
  });
});

describe("confirmReceptionAction", () => {
  // Session cliente valide, commune a ce bloc : l'autorisation est verifiee
  // dans le bloc precedent, ici on teste la logique metier.
  const clientLegitime = {
    id: "u-client",
    role: "CLIENT",
    phone: "+2250505050505",
    customerProfile: { id: "c1" },
  };

  beforeEach(() => {
    getCurrentUserMock.mockResolvedValue(clientLegitime);
  });

  it("est idempotent : des fonds deja liberes ne le sont pas deux fois", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "o1",
      reference: "KOLI-ABCDEFGH",
      sellerId: "s1",
      customerId: "c1",
      status: "FUNDS_RELEASED",
      fund: { amount: 18500, released: true, secured: true },
    });

    const res = await confirmReceptionAction("KOLI-ABCDEFGH");

    expect(res).toEqual({ success: true, status: "FUNDS_RELEASED" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuse de liberer les fonds tant qu'un litige est ouvert (§33)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "o1",
      reference: "KOLI-ABCDEFGH",
      sellerId: "s1",
      customerId: "c1",
      status: "DISPUTE_OPEN",
      fund: { amount: 18500, released: false, secured: true },
    });

    const res = await confirmReceptionAction("KOLI-ABCDEFGH");

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuse de liberer les fonds d'une commande non livree", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "o1",
      reference: "KOLI-ABCDEFGH",
      sellerId: "s1",
      customerId: "c1",
      status: "FUNDS_SECURED",
      fund: { amount: 18500, released: false, secured: true },
    });

    const res = await confirmReceptionAction("KOLI-ABCDEFGH");

    expect(res.success).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("borne la liberation a la seule commande concernee", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "o1",
      reference: "KOLI-ABCDEFGH",
      sellerId: "s1",
      customerId: "c1",
      status: "DELIVERED",
      fund: { amount: 18500, released: false, secured: true },
    });

    const tx = {
      // Les notifications (§44) sont ecrites dans la MEME transaction que
      // l'evenement : le faux client doit connaitre ces tables, sinon l'action
      // echoue avant d'avoir rien fait.
      notification: { createMany: vi.fn() },
      user: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
      driverProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "u-livreur" }) },
      fund: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      transaction: { create: vi.fn(), createMany: vi.fn() },
      // La liberation preleve la commission (§41) dans la MEME transaction.
      commission: { findFirst: vi.fn().mockResolvedValue({ ratePercent: 5 }) },
      order: {
        update: vi.fn(),
        // Lue par `partiesDeLaCommande` pour savoir qui prevenir.
        findUnique: vi.fn().mockResolvedValue({
          buyerPhone: "+2250505050505",
          seller: { userId: "u-vendeur" },
          customer: { userId: "u-client" },
        }),
      },
      orderStatusHistory: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    prismaMock.$transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));

    const res = await confirmReceptionAction("KOLI-ABCDEFGH");

    expect(res.success).toBe(true);
    // Le bug corrige : le filtre portait sur sellerId et vidait tout l'escrow
    // du vendeur, toutes commandes confondues.
    expect(tx.fund.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: "o1", secured: true, released: false },
      })
    );
  });

  it("preleve la commission DANS la transaction de liberation (§41)", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "o1",
      reference: "KOLI-ABCDEFGH",
      sellerId: "s1",
      customerId: "c1",
      status: "DELIVERED",
      fund: { amount: 20000, released: false, secured: true },
    });

    const tx = {
      // Les notifications (§44) sont ecrites dans la MEME transaction que
      // l'evenement : le faux client doit connaitre ces tables, sinon l'action
      // echoue avant d'avoir rien fait.
      notification: { createMany: vi.fn() },
      user: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
      driverProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "u-livreur" }) },
      fund: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      transaction: { create: vi.fn(), createMany: vi.fn() },
      commission: { findFirst: vi.fn().mockResolvedValue({ ratePercent: 5 }) },
      order: {
        update: vi.fn(),
        // Lue par `partiesDeLaCommande` pour savoir qui prevenir.
        findUnique: vi.fn().mockResolvedValue({
          buyerPhone: "+2250505050505",
          seller: { userId: "u-vendeur" },
          customer: { userId: "u-client" },
        }),
      },
      orderStatusHistory: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    prismaMock.$transaction.mockImplementation(
      async (cb: (t: typeof tx) => unknown) => cb(tx)
    );

    await confirmReceptionAction("KOLI-ABCDEFGH");

    const ecritures = tx.transaction.create.mock.calls.map((c) => c[0].data);

    // La liberation, puis la commission : les deux dans la meme transaction.
    // Prelevee en dehors, une panne laisserait le vendeur paye sans que KOLI
    // ait retenu quoi que ce soit — un manque a gagner totalement invisible.
    expect(ecritures).toContainEqual(
      expect.objectContaining({ type: "FUNDS_RELEASED", amount: 20000 })
    );
    expect(ecritures).toContainEqual(
      expect.objectContaining({ type: "COMMISSION", amount: -1000, rate: 5 })
    );

    // §48 en donne l'exemple meme : « ACTION: FUNDS_RELEASE_TEST ».
    // L'acteur est le CLIENT, pas un administrateur : c'est sa confirmation de
    // reception qui declenche le versement au vendeur.
    const trace = tx.auditLog.create.mock.calls[0][0].data;
    expect(trace.action).toBe("FUNDS_RELEASE_TEST");
    // La reference lisible, pas l'identifiant technique (§48).
    expect(trace.entityId).toBe("KOLI-ABCDEFGH");
    expect(trace.actorRole).toBe("CLIENT");
  });

  it("libere sans commission quand aucun taux n'est actif", async () => {
    prismaMock.order.findUnique.mockResolvedValue({
      id: "o1",
      reference: "KOLI-ABCDEFGH",
      sellerId: "s1",
      customerId: "c1",
      status: "DELIVERED",
      fund: { amount: 20000, released: false, secured: true },
    });

    const tx = {
      // Les notifications (§44) sont ecrites dans la MEME transaction que
      // l'evenement : le faux client doit connaitre ces tables, sinon l'action
      // echoue avant d'avoir rien fait.
      notification: { createMany: vi.fn() },
      user: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
      driverProfile: { findUnique: vi.fn().mockResolvedValue({ userId: "u-livreur" }) },
      fund: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      transaction: { create: vi.fn(), createMany: vi.fn() },
      commission: { findFirst: vi.fn().mockResolvedValue(null) },
      order: {
        update: vi.fn(),
        // Lue par `partiesDeLaCommande` pour savoir qui prevenir.
        findUnique: vi.fn().mockResolvedValue({
          buyerPhone: "+2250505050505",
          seller: { userId: "u-vendeur" },
          customer: { userId: "u-client" },
        }),
      },
      orderStatusHistory: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    prismaMock.$transaction.mockImplementation(
      async (cb: (t: typeof tx) => unknown) => cb(tx)
    );

    const res = await confirmReceptionAction("KOLI-ABCDEFGH");

    // Sans taux configure, la liberation doit aboutir quand meme : le vendeur
    // ne doit pas etre bloque parce que l'administration n'a rien parametre.
    expect(res.success).toBe(true);
    const types = tx.transaction.create.mock.calls.map((c) => c[0].data.type);
    expect(types).toContain("FUNDS_RELEASED");
    expect(types).not.toContain("COMMISSION");
  });
});
