import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Factures (§38) — phase 20 : numérotation robuste et listes cloisonnées.
 *
 * Deux dangers distincts sont couverts ici.
 *
 * **La numérotation.** Le rang était déduit du NOMBRE de factures de l'année.
 * `Invoice` étant en `onDelete: Cascade` depuis `Order`, supprimer une commande
 * fait redescendre ce compte : la facture suivante réutilise alors un numéro
 * déjà attribué, la contrainte d'unicité la rejette, et c'est un paiement
 * parfaitement valide qui échoue. En comptabilité, un trou se constate et
 * s'explique ; un doublon invalide le registre.
 *
 * **Le cloisonnement.** Une facture porte le nom, le téléphone et l'adresse
 * d'un client. La laisser fuir vers un autre compte est une fuite de données
 * personnelles, pas seulement une indiscrétion commerciale.
 */

const prismaMock = {
  invoice: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  payment: { aggregate: vi.fn() },
};

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

const { rangSuivant, rangDuNumero, formaterNumeroFacture } = await import(
  "@/lib/invoices/numero"
);
const { chargerFacturesVendeur, chargerFacturesClient } = await import(
  "@/lib/invoices/liste"
);

const FACTURE = {
  number: "FAC-2026-000007",
  createdAt: new Date("2026-08-23T10:00:00Z"),
  order: {
    reference: "KOLI-ABCDEFGH",
    status: "COMPLETED",
    buyerName: "Awa Koné",
    payment: { amount: 20500, status: "SUCCEEDED" },
    seller: { businessName: "Boutique Chic", user: { name: "Kof" } },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.invoice.findMany.mockResolvedValue([FACTURE]);
  prismaMock.invoice.count.mockResolvedValue(1);
  prismaMock.payment.aggregate.mockResolvedValue({ _sum: { amount: 20500 } });
});

describe("rangDuNumero", () => {
  it("extrait le rang d'un numero valide", () => {
    expect(rangDuNumero("FAC-2026-000042")).toBe(42);
  });

  it("retourne 0 sur une chaine qui n'est pas un numero", () => {
    // Une donnee inattendue ne doit pas produire NaN et propager un numero
    // « FAC-2026-00000NaN » jusqu'en base.
    expect(rangDuNumero("KOLI-ABCDEFGH")).toBe(0);
    expect(rangDuNumero("")).toBe(0);
    expect(rangDuNumero("FAC-2026-12")).toBe(0);
  });
});

describe("rangSuivant", () => {
  const client = { invoice: { findFirst: vi.fn() } };

  beforeEach(() => client.invoice.findFirst.mockReset());

  it("part de 1 quand l'annee n'a aucune facture", async () => {
    client.invoice.findFirst.mockResolvedValue(null);
    expect(await rangSuivant(client as never, 2026)).toBe(1);
  });

  it("suit le PLUS GRAND numero, pas le nombre de factures", async () => {
    // Le cas qui cassait : deux factures existent, mais la plus haute porte le
    // rang 9 parce qu'une commande a ete supprimee entre-temps. `count + 1`
    // aurait rendu 3, un numero deja attribue.
    client.invoice.findFirst.mockResolvedValue({ number: "FAC-2026-000009" });
    expect(await rangSuivant(client as never, 2026)).toBe(10);
  });

  it("interroge la base sur la seule annee visee", async () => {
    client.invoice.findFirst.mockResolvedValue(null);
    await rangSuivant(client as never, 2027);

    const appel = client.invoice.findFirst.mock.calls[0][0];
    expect(appel.where).toEqual({ number: { startsWith: "FAC-2027-" } });
    // Sans ce tri, la base rend une ligne arbitraire et le rang est faux.
    expect(appel.orderBy).toEqual({ number: "desc" });
  });

  it("repart a 1 au changement d'annee", async () => {
    // L'annee 2027 ne voit pas les factures de 2026 : le prefixe les exclut.
    client.invoice.findFirst.mockResolvedValue(null);
    expect(formaterNumeroFacture(2027, await rangSuivant(client as never, 2027)))
      .toBe("FAC-2027-000001");
  });

  it("franchit la centaine sans desordre alphabetique", async () => {
    // C'est le remplissage a six chiffres qui rend le tri alphabetique
    // identique au tri numerique : sans lui, « 99 » passerait apres « 100 ».
    client.invoice.findFirst.mockResolvedValue({ number: "FAC-2026-000099" });
    expect(await rangSuivant(client as never, 2026)).toBe(100);
  });
});

describe("chargerFacturesVendeur — cloisonnement", () => {
  it("restreint la liste, le comptage ET le total au vendeur", async () => {
    await chargerFacturesVendeur("s1", { page: 1, parPage: 20 });

    expect(prismaMock.invoice.findMany.mock.calls[0][0].where).toEqual({
      order: { sellerId: "s1" },
    });
    expect(prismaMock.invoice.count.mock.calls[0][0].where).toEqual({
      order: { sellerId: "s1" },
    });
    // Le total agrege doit porter le meme filtre : sinon le vendeur lit le
    // volume de toute la plateforme au-dessus de ses propres lignes.
    expect(prismaMock.payment.aggregate.mock.calls[0][0].where).toEqual({
      order: { sellerId: "s1", invoice: { isNot: null } },
    });
  });

  it("garde la portee AU-DESSUS de la recherche", async () => {
    await chargerFacturesVendeur("s1", {
      recherche: "Awa",
      page: 1,
      parPage: 20,
    });

    // Le point critique : portee et recherche doivent etre liees par un AND.
    // Posees au meme niveau, une recherche sur un nom courant ferait remonter
    // les factures de tous les vendeurs.
    const where = prismaMock.invoice.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ order: { sellerId: "s1" } });
    expect(where.AND[1].OR).toEqual([
      { number: { contains: "Awa" } },
      { order: { reference: { contains: "Awa" } } },
      { order: { buyerName: { contains: "Awa" } } },
    ]);
  });

  it("ignore une recherche vide plutot que de filtrer sur du vide", async () => {
    await chargerFacturesVendeur("s1", {
      recherche: "   ",
      page: 1,
      parPage: 20,
    });

    expect(prismaMock.invoice.findMany.mock.calls[0][0].where).toEqual({
      order: { sellerId: "s1" },
    });
  });

  it("affiche l'acheteur comme contrepartie", async () => {
    const res = await chargerFacturesVendeur("s1", { page: 1, parPage: 20 });
    expect(res.lignes[0].contrepartie).toBe("Awa Koné");
  });
});

describe("chargerFacturesClient — rattachement", () => {
  it("reunit le compte ET le telephone", async () => {
    await chargerFacturesClient(
      { customerId: "c1", telephone: "+2250505050505" },
      { page: 1, parPage: 20 }
    );

    // Le telephone est indispensable : une grande partie des achats se font en
    // mode invite, le compte n'etant cree qu'ensuite. Sans lui, ces recus
    // resteraient invisibles a la personne qui les a payes.
    expect(prismaMock.invoice.findMany.mock.calls[0][0].where).toEqual({
      order: {
        OR: [{ customerId: "c1" }, { buyerPhone: "+2250505050505" }],
      },
    });
  });

  it("fonctionne sans profil client, sur le seul telephone", async () => {
    await chargerFacturesClient(
      { customerId: null, telephone: "+2250505050505" },
      { page: 1, parPage: 20 }
    );

    expect(prismaMock.invoice.findMany.mock.calls[0][0].where).toEqual({
      order: { OR: [{ buyerPhone: "+2250505050505" }] },
    });
  });

  it("affiche le VENDEUR comme contrepartie", async () => {
    // Cote client, afficher l'acheteur donnerait une liste ou chaque ligne
    // porte son propre nom.
    const res = await chargerFacturesClient(
      { customerId: "c1", telephone: "+2250505050505" },
      { page: 1, parPage: 20 }
    );
    expect(res.lignes[0].contrepartie).toBe("Boutique Chic");
  });
});

describe("chargerFacturesVendeur — pagination", () => {
  it("saute les pages precedentes plutot que de tout charger", async () => {
    await chargerFacturesVendeur("s1", { page: 3, parPage: 20 });

    const appel = prismaMock.invoice.findMany.mock.calls[0][0];
    expect(appel.skip).toBe(40);
    expect(appel.take).toBe(20);
    // Tri sur le numero : le format a zeros completes rend l'ordre
    // alphabetique identique a l'ordre chronologique.
    expect(appel.orderBy).toEqual({ number: "desc" });
  });

  it("agrege le montant sans pagination", async () => {
    await chargerFacturesVendeur("s1", { page: 2, parPage: 1 });

    const agregat = prismaMock.payment.aggregate.mock.calls[0][0];
    expect(agregat.skip).toBeUndefined();
    expect(agregat.take).toBeUndefined();
  });
});
