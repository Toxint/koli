import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Journal financier (§39-40) — la lecture.
 *
 * Le point sensible n'est pas l'affichage : c'est le **cloisonnement**. La
 * page vendeur et la page administration appellent la MÊME fonction ; seule la
 * présence de `sellerId` les sépare. Si ce filtre se perdait, un commerçant
 * lirait le chiffre d'affaires de ses concurrents sans qu'aucune erreur ne
 * s'affiche nulle part.
 *
 * Le second point est la pagination : les totaux doivent être calculés sur
 * l'ensemble du filtre, jamais sur la page affichée, sinon ils changent quand
 * on tourne la page.
 */

const prismaMock = {
  transaction: {
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
};

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

const { chargerJournal, LIBELLES_TYPE, EXPLICATIONS } = await import(
  "@/lib/finance/journal"
);

const LIGNE = {
  id: "t1",
  type: "COMMISSION",
  amount: -925,
  rate: 5,
  createdAt: new Date("2026-08-01T10:00:00Z"),
  order: {
    reference: "KOLI-ABCDEFGH",
    buyerName: "Awa Koné",
    seller: { businessName: "Boutique Chic" },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.transaction.findMany.mockResolvedValue([LIGNE]);
  prismaMock.transaction.count.mockResolvedValue(1);
  prismaMock.transaction.groupBy.mockResolvedValue([
    { type: "COMMISSION", _sum: { amount: -925 }, _count: { _all: 1 } },
  ]);
});

describe("chargerJournal — cloisonnement", () => {
  it("restreint TOUTES les requetes au vendeur demande", async () => {
    await chargerJournal({ sellerId: "s1", page: 1, parPage: 25 });

    const attendu = { order: { sellerId: "s1" } };
    expect(prismaMock.transaction.findMany.mock.calls[0][0].where).toEqual(
      attendu
    );
    // Le comptage et les totaux DOIVENT porter le meme filtre : un total
    // calcule sans lui afficherait au vendeur le volume de la plateforme
    // entiere sous une liste qui, elle, ne montre que ses propres lignes.
    expect(prismaMock.transaction.count.mock.calls[0][0].where).toEqual(
      attendu
    );
    expect(prismaMock.transaction.groupBy.mock.calls[0][0].where).toEqual(
      attendu
    );
  });

  it("ne pose aucun filtre de vendeur cote administration", async () => {
    await chargerJournal({ page: 1, parPage: 30 });

    expect(prismaMock.transaction.findMany.mock.calls[0][0].where).toEqual({});
  });

  it("combine le vendeur et la recherche par reference", async () => {
    await chargerJournal({
      sellerId: "s1",
      reference: "ABCD",
      page: 1,
      parPage: 25,
    });

    expect(prismaMock.transaction.findMany.mock.calls[0][0].where).toEqual({
      order: { sellerId: "s1", reference: { contains: "ABCD" } },
    });
  });

  it("garde le filtre vendeur meme avec un filtre de nature", async () => {
    await chargerJournal({
      sellerId: "s1",
      type: "COMMISSION",
      page: 1,
      parPage: 25,
    });

    expect(prismaMock.transaction.findMany.mock.calls[0][0].where).toEqual({
      type: "COMMISSION",
      order: { sellerId: "s1" },
    });
  });
});

describe("chargerJournal — pagination et ordre", () => {
  it("saute les pages precedentes plutot que de tout charger", async () => {
    await chargerJournal({ sellerId: "s1", page: 3, parPage: 25 });

    const appel = prismaMock.transaction.findMany.mock.calls[0][0];
    expect(appel.skip).toBe(50);
    expect(appel.take).toBe(25);
  });

  it("ordonne avec un second critere stable", async () => {
    await chargerJournal({ page: 1, parPage: 25 });

    // Les ecritures d'une meme transaction partagent la milliseconde. Sans
    // second critere, une ligne peut apparaitre deux fois ou disparaitre en
    // changeant de page.
    expect(prismaMock.transaction.findMany.mock.calls[0][0].orderBy).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
  });

  it("calcule les totaux sur le filtre, pas sur la page affichee", async () => {
    prismaMock.transaction.groupBy.mockResolvedValue([
      { type: "PAYMENT", _sum: { amount: 205_000 }, _count: { _all: 10 } },
      { type: "COMMISSION", _sum: { amount: -9_250 }, _count: { _all: 10 } },
    ]);

    const res = await chargerJournal({ sellerId: "s1", page: 2, parPage: 1 });

    // Aucune pagination sur l'agregat : c'est ce qui garantit que le total ne
    // change pas quand on tourne la page.
    const agregat = prismaMock.transaction.groupBy.mock.calls[0][0];
    expect(agregat.skip).toBeUndefined();
    expect(agregat.take).toBeUndefined();
    expect(res.totauxParType).toHaveLength(2);
  });
});

describe("chargerJournal — restitution", () => {
  it("expose le taux fige sur l'ecriture", async () => {
    const res = await chargerJournal({ sellerId: "s1", page: 1, parPage: 25 });

    expect(res.lignes[0]).toMatchObject({
      type: "COMMISSION",
      montant: -925,
      taux: 5,
      reference: "KOLI-ABCDEFGH",
      vendeur: "Boutique Chic",
      client: "Awa Koné",
    });
  });

  it("ne laisse aucune nature sans libelle ni explication", async () => {
    // Ajouter une valeur a `TransactionType` sans l'expliquer afficherait la
    // valeur brute de l'enum a un commercant.
    for (const type of Object.keys(LIBELLES_TYPE)) {
      expect(LIBELLES_TYPE[type as keyof typeof LIBELLES_TYPE]).toBeTruthy();
      expect(EXPLICATIONS[type as keyof typeof EXPLICATIONS]).toBeTruthy();
    }
    expect(Object.keys(EXPLICATIONS)).toEqual(Object.keys(LIBELLES_TYPE));
  });
});
