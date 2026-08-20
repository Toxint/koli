import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Catalogue produits (§16-17).
 *
 * Deux choses sont verifiees ici et rien d'autre : la PROPRIETE (un vendeur ne
 * touche que son catalogue, meme en devinant un identifiant) et le
 * RATTACHEMENT DU PRIX (une commande ne part jamais a un montant fabrique cote
 * client quand le produit vient du catalogue).
 *
 * Prisma est mocke : on teste la logique de decision, pas la base.
 */

const prismaMock = {
  product: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  customerProfile: { findFirst: vi.fn() },
  order: { create: vi.fn() },
};

const getCurrentUserMock = vi.fn();

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/actions", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  creerProduitAction,
  modifierProduitAction,
  basculerStatutProduitAction,
} = await import("@/lib/products/actions");
const { createOrderAction } = await import("@/lib/orders/actions");

const VENDEUR = {
  id: "u1",
  role: "SELLER",
  name: "Awa",
  phone: "+2250700000001",
  sellerProfile: { id: "s1", businessName: "Boutique Awa" },
};

function formulaireProduit(champs: Record<string, string> = {}) {
  const fd = new FormData();
  const valeurs = {
    name: "Robe wax",
    description: "",
    category: "",
    price: "15000",
    quantity: "3",
    weightKg: "",
    imageUrl: "",
    ...champs,
  };
  for (const [cle, valeur] of Object.entries(valeurs)) fd.append(cle, valeur);
  return fd;
}

function formulaireCommande(champs: Record<string, string> = {}) {
  const fd = new FormData();
  const valeurs = {
    buyerName: "Koffi Yao",
    buyerPhone: "+2250500000009",
    buyerCountry: "Côte d'Ivoire",
    buyerCity: "Abidjan",
    buyerAddress: "Cocody Angré",
    deliveryFee: "2000",
    productName: "Robe wax",
    unitPrice: "15000",
    quantity: "1",
    ...champs,
  };
  for (const [cle, valeur] of Object.entries(valeurs)) fd.append(cle, valeur);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(VENDEUR);
});

describe("creerProduitAction", () => {
  it("refuse un utilisateur non vendeur", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u2", role: "CUSTOMER" });

    const res = await creerProduitAction(formulaireProduit());

    expect(res.success).toBe(false);
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it("refuse un prix en dessous du minimum", async () => {
    const res = await creerProduitAction(formulaireProduit({ price: "50" }));

    expect(res.success).toBe(false);
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it("refuse un doublon de nom dans le meme catalogue", async () => {
    prismaMock.product.findFirst.mockResolvedValue({ id: "p-existant" });

    const res = await creerProduitAction(formulaireProduit());

    expect(res.success).toBe(false);
    expect(prismaMock.product.create).not.toHaveBeenCalled();
  });

  it("cree le produit rattache au vendeur connecte", async () => {
    prismaMock.product.findFirst.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue({ id: "p1" });

    const res = await creerProduitAction(formulaireProduit());

    expect(res.success).toBe(true);
    const arg = prismaMock.product.create.mock.calls[0][0];
    expect(arg.data.sellerId).toBe("s1");
    expect(arg.data.price).toBe(15000);
  });
});

describe("modifierProduitAction", () => {
  it("refuse de modifier le produit d'un autre vendeur", async () => {
    prismaMock.product.findUnique.mockResolvedValue({
      id: "p9",
      sellerId: "AUTRE-VENDEUR",
    });

    const res = await modifierProduitAction("p9", formulaireProduit());

    expect(res.success).toBe(false);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });
});

describe("basculerStatutProduitAction", () => {
  it("refuse de retirer le produit d'un autre vendeur", async () => {
    prismaMock.product.findUnique.mockResolvedValue({
      id: "p9",
      sellerId: "AUTRE-VENDEUR",
      status: "ACTIVE",
      name: "Sac",
    });

    const res = await basculerStatutProduitAction("p9");

    expect(res.success).toBe(false);
    expect(prismaMock.product.update).not.toHaveBeenCalled();
  });

  it("archive au lieu de supprimer : l'historique des commandes reste lisible", async () => {
    prismaMock.product.findUnique.mockResolvedValue({
      id: "p1",
      sellerId: "s1",
      status: "ACTIVE",
      name: "Robe wax",
    });
    prismaMock.product.update.mockResolvedValue({});

    const res = await basculerStatutProduitAction("p1");

    expect(res.success).toBe(true);
    expect(prismaMock.product.update.mock.calls[0][0].data.status).toBe(
      "ARCHIVED"
    );
  });
});

describe("createOrderAction et le catalogue", () => {
  it("refuse un produit qui n'appartient pas au vendeur", async () => {
    // Le `findFirst` filtre sur sellerId : un identifiant etranger ne remonte rien.
    prismaMock.product.findFirst.mockResolvedValue(null);

    const res = await createOrderAction(
      formulaireCommande({ productId: "p-autre-vendeur" })
    );

    expect(res.success).toBe(false);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it("refuse un produit retire du catalogue", async () => {
    prismaMock.product.findFirst.mockResolvedValue({
      id: "p1",
      sellerId: "s1",
      name: "Robe wax",
      price: 15000,
      quantity: 5,
      status: "ARCHIVED",
    });

    const res = await createOrderAction(formulaireCommande({ productId: "p1" }));

    expect(res.success).toBe(false);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it("refuse une quantite superieure au stock", async () => {
    prismaMock.product.findFirst.mockResolvedValue({
      id: "p1",
      sellerId: "s1",
      name: "Robe wax",
      price: 15000,
      quantity: 2,
      status: "ACTIVE",
    });

    const res = await createOrderAction(
      formulaireCommande({ productId: "p1", quantity: "3" })
    );

    expect(res.success).toBe(false);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it("applique le prix du catalogue et non celui envoye par le formulaire", async () => {
    prismaMock.product.findFirst.mockResolvedValue({
      id: "p1",
      sellerId: "s1",
      name: "Robe wax",
      price: 15000,
      quantity: 5,
      status: "ACTIVE",
    });
    prismaMock.customerProfile.findFirst.mockResolvedValue(null);
    prismaMock.order.create.mockResolvedValue({ reference: "KOLI-ABCDEFGH" });

    // Prix falsifie cote client : 100 FCFA au lieu des 15 000 du catalogue.
    const res = await createOrderAction(
      formulaireCommande({ productId: "p1", unitPrice: "100", quantity: "2" })
    );

    expect(res.success).toBe(true);
    const data = prismaMock.order.create.mock.calls[0][0].data;
    expect(data.items.create[0].unitPrice).toBe(15000);
    // Fonds sequestres = articles seuls, hors livraison.
    expect(data.fund.create.amount).toBe(30000);
    // Paiement = articles + livraison.
    expect(data.payment.create.amount).toBe(32000);
  });

  it("en saisie libre, cree une fiche a stock nul plutot qu'un inventaire invente", async () => {
    prismaMock.product.findFirst.mockResolvedValue(null);
    prismaMock.product.create.mockResolvedValue({ id: "p-nouveau" });
    prismaMock.customerProfile.findFirst.mockResolvedValue(null);
    prismaMock.order.create.mockResolvedValue({ reference: "KOLI-ABCDEFGH" });

    const res = await createOrderAction(formulaireCommande());

    expect(res.success).toBe(true);
    expect(prismaMock.product.create.mock.calls[0][0].data.quantity).toBe(0);
  });
});
