import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Verification des vendeurs (§36) et agregats du tableau de bord (§34).
 *
 * Deux choses sont protegees ici : l'action de verification n'est ouverte
 * qu'a un administrateur et n'accepte qu'un statut de la liste blanche, et les
 * agregats financiers ne comptent pas deux fois les memes fonds.
 */

const prismaMock = {
  sellerProfile: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  user: { count: vi.fn() },
  driverProfile: { count: vi.fn() },
  customerProfile: { count: vi.fn() },
  order: { count: vi.fn(), groupBy: vi.fn() },
  payment: { count: vi.fn(), aggregate: vi.fn() },
  fund: { aggregate: vi.fn() },
  dispute: { count: vi.fn() },
  refund: { count: vi.fn(), aggregate: vi.fn() },
  commission: { findFirst: vi.fn() },
  transaction: { aggregate: vi.fn(), groupBy: vi.fn() },
  orderStatusHistory: { findMany: vi.fn() },
  $transaction: vi.fn(),
  /* Les montants agreges se lisent desormais en SQL : leur devise vit sur
     `Order`, et `groupBy` de Prisma ne sait pas classer par une colonne d'une
     autre table. */
  $queryRaw: vi.fn(),
  // Le journal d'audit (§48) est ecrit dans la MEME transaction que l'acte :
  // le faux client doit donc le connaitre, sinon l'acte echoue.
  auditLog: { create: vi.fn() },
};

const getCurrentUserMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/actions", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { definirVerificationVendeurAction } = await import(
  "@/lib/admin/vendeurs"
);
const { chargerStatistiquesAdmin } = await import("@/lib/admin/stats");

const ADMIN = { id: "a1", role: "ADMIN", name: "Admin KOLI" };

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(ADMIN);
});

describe("definirVerificationVendeurAction", () => {
  it("refuse un utilisateur qui n'est pas administrateur", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u2", role: "SELLER" });

    const res = await definirVerificationVendeurAction("s1", "VERIFIED");

    expect(res.success).toBe(false);
    expect(prismaMock.sellerProfile.update).not.toHaveBeenCalled();
  });

  it("refuse un statut hors liste blanche sans interroger la base", async () => {
    const res = await definirVerificationVendeurAction("s1", "SUPER_VERIFIE");

    expect(res.success).toBe(false);
    expect(prismaMock.sellerProfile.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.sellerProfile.update).not.toHaveBeenCalled();
  });

  it("refuse SUSPENDED, qui releve du compte et non de la verification", async () => {
    // Suspendre passe par basculerStatutCompteAction : deux notions distinctes,
    // qu'on ne laisse pas se confondre.
    const res = await definirVerificationVendeurAction("s1", "SUSPENDED");

    expect(res.success).toBe(false);
    expect(prismaMock.sellerProfile.update).not.toHaveBeenCalled();
  });

  it("refuse un vendeur inexistant", async () => {
    prismaMock.sellerProfile.findUnique.mockResolvedValue(null);

    const res = await definirVerificationVendeurAction("inconnu", "VERIFIED");

    expect(res.success).toBe(false);
    expect(prismaMock.sellerProfile.update).not.toHaveBeenCalled();
  });

  it("n'ecrit rien si le statut est deja celui demande", async () => {
    prismaMock.sellerProfile.findUnique.mockResolvedValue({
      id: "s1",
      businessName: "Boutique Chic",
      verificationStatus: "VERIFIED",
      user: { name: "Awa" },
    });

    const res = await definirVerificationVendeurAction("s1", "VERIFIED");

    expect(res.success).toBe(true);
    expect(prismaMock.sellerProfile.update).not.toHaveBeenCalled();
  });

  it("enregistre la decision d'un administrateur", async () => {
    prismaMock.sellerProfile.findUnique.mockResolvedValue({
      id: "s1",
      businessName: "Boutique Chic",
      verificationStatus: "PENDING",
      user: { name: "Awa" },
    });

    const tx = {
      sellerProfile: { update: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    prismaMock.$transaction.mockImplementation(
      async (cb: (t: typeof tx) => unknown) => cb(tx)
    );

    const res = await definirVerificationVendeurAction("s1", "VERIFIED");

    expect(res.success).toBe(true);
    expect(tx.sellerProfile.update.mock.calls[0][0].data.verificationStatus).toBe(
      "VERIFIED"
    );
  });

  it("consigne la decision au journal, dans la MEME transaction (§48)", async () => {
    // Rejeter un vendeur ferme son activite sur KOLI. Sans trace, la decision
    // n'est rattachable a personne. La consignation partage la transaction de
    // l'acte : l'une ne peut pas aboutir sans l'autre.
    prismaMock.sellerProfile.findUnique.mockResolvedValue({
      id: "s1",
      businessName: "Boutique Chic",
      verificationStatus: "PENDING",
      user: { name: "Awa" },
    });

    const tx = {
      sellerProfile: { update: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    prismaMock.$transaction.mockImplementation(
      async (cb: (t: typeof tx) => unknown) => cb(tx)
    );

    await definirVerificationVendeurAction("s1", "REJECTED");

    const trace = tx.auditLog.create.mock.calls[0][0].data;
    expect(trace.action).toBe("SELLER_VERIFICATION_SET");
    expect(trace.entityId).toBe("s1");
    // Le nom est recopie : il survit a la suppression du compte administrateur.
    expect(trace.actorName).toBeTruthy();

    // Sans le « avant », la ligne n'apprend rien. Et en francais : le journal
    // se lit, il ne se dechiffre pas — « REJECTED → VERIFIED » obligerait le
    // lecteur a traduire.
    const details = JSON.parse(trace.metadata);
    expect(details.avant).toBe("en attente");
    expect(details.apres).toBe("rejeté");
    expect(details.vendeur).toBe("Boutique Chic");
  });
});

describe("chargerStatistiquesAdmin", () => {
  beforeEach(() => {
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.sellerProfile.count.mockResolvedValue(0);
    prismaMock.driverProfile.count.mockResolvedValue(0);
    prismaMock.customerProfile.count.mockResolvedValue(0);
    prismaMock.order.count.mockResolvedValue(0);
    prismaMock.order.groupBy.mockResolvedValue([]);
    prismaMock.payment.count.mockResolvedValue(0);
    prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prismaMock.dispute.count.mockResolvedValue(0);
    prismaMock.refund.count.mockResolvedValue(0);
    prismaMock.refund.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prismaMock.commission.findFirst.mockResolvedValue({ ratePercent: 5 });
    prismaMock.fund.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    prismaMock.transaction.aggregate.mockResolvedValue({
      _sum: { amount: 0 },
      _count: { _all: 0 },
    });
    prismaMock.transaction.groupBy.mockResolvedValue([]);
    prismaMock.$queryRaw.mockResolvedValue([]);
  });

  /** Le texte SQL des quatre sommes agregees, dans l'ordre ou elles partent. */
  const sqlEnvoye = () =>
    prismaMock.$queryRaw.mock.calls.map((c) =>
      (c[0].strings ?? []).join(" ").replace(/\s+/g, " ")
    );

  it("exclut les fonds liberes du montant sequestre", async () => {
    // `released` ne remet pas `secured` a false : sans le filtre, l'engagement
    // de la plateforme serait surevalue de tout le volume deja verse.
    await chargerStatistiquesAdmin();

    const fonds = sqlEnvoye().filter((s) => s.includes('"Fund"'));
    expect(fonds).toHaveLength(2);
    expect(fonds.some((s) => /f\.secured = true AND f\.released = false/.test(s))).toBe(true);
    expect(fonds.some((s) => /f\.released = true/.test(s))).toBe(true);
  });

  it("groupe CHAQUE somme par devise, et n'additionne jamais entre monnaies", async () => {
    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │  Ces ecrans agregent TOUS les vendeurs, donc plusieurs monnaies. Un  │
     * │  seul nombre y melangeait des francs CFA et des francs congolais.    │
     * └──────────────────────────────────────────────────────────────────────┘
     *
     * Le controle porte sur la FORME rendue : un montant par devise, jamais un
     * total. Si quelqu'un rebranche un `_sum` global, la valeur redevient un
     * nombre et ce test tombe.
     */
    prismaMock.$queryRaw.mockResolvedValue([
      { devise: "XOF", total: BigInt(120_000) },
      { devise: "CDF", total: BigInt(4_500_000) },
    ]);

    const s = await chargerStatistiquesAdmin();

    expect(s.paiements.volumeEncaisse).toEqual({ XOF: 120_000, CDF: 4_500_000 });
    expect(s.fonds.sequestre).toEqual({ XOF: 120_000, CDF: 4_500_000 });
    expect(s.remboursements.volume).toEqual({ XOF: 120_000, CDF: 4_500_000 });

    // Les quatre sommes passent par le MEME chemin : aucune ne doit avoir ete
    // repliee en un seul nombre au passage.
    for (const v of [s.paiements.volumeEncaisse, s.fonds.libere]) {
      expect(typeof v).toBe("object");
    }
  });

  it("lit la commission au journal, et non par projection", async () => {
    // Le point du test : le montant affiche vient des ecritures COMMISSION,
    // pas d'un pourcentage recalcule sur les fonds liberes. Les deux chiffres
    // sont volontairement incompatibles ici — 5 % de 18 501 donnerait 925 —
    // pour que le test echoue si quelqu'un revient a la projection.
    prismaMock.$queryRaw.mockResolvedValue([{ devise: "XOF", total: BigInt(18_501) }]);
    prismaMock.transaction.groupBy.mockResolvedValue([
      { currency: "XOF", _sum: { amount: -1_200 }, _count: { _all: 3 } },
    ]);

    const s = await chargerStatistiquesAdmin();

    expect(s.commission.tauxActif).toBe(5);
    // Repasse en positif : l'ecriture est un debit.
    expect(s.commission.prelevee).toEqual({ XOF: 1_200 });
    expect(s.commission.nombrePrelevements).toBe(3);
  });

  it("n'affiche aucune commission quand rien n'a ete preleve", async () => {
    prismaMock.commission.findFirst.mockResolvedValue(null);
    prismaMock.$queryRaw.mockResolvedValue([{ devise: "XOF", total: BigInt(50_000) }]);

    const s = await chargerStatistiquesAdmin();

    expect(s.commission.tauxActif).toBeNull();
    // Des fonds liberes SANS commission prelevee : c'est exactement le cas
    // qu'une projection maquillait en recette. L'objet est VIDE, pas « 0 XOF » :
    // un zero dans une monnaie que personne n'a choisie affirme quelque chose.
    expect(s.commission.prelevee).toEqual({});
    expect(s.commission.nombrePrelevements).toBe(0);
  });

  it("traite une somme vide comme AUCUNE devise, et non comme un zero", async () => {
    prismaMock.$queryRaw.mockResolvedValue([]);

    const s = await chargerStatistiquesAdmin();

    expect(s.fonds.sequestre).toEqual({});
    expect(s.fonds.libere).toEqual({});
    expect(s.paiements.volumeEncaisse).toEqual({});
    expect(s.remboursements.volume).toEqual({});
  });
});
