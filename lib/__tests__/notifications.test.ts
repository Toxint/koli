import { describe, it, expect, vi } from "vitest";
import { notifier, partiesDeLaCommande } from "@/lib/notifications/envoi";
import {
  formulerNotification,
  lienNotification,
} from "@/lib/notifications/libelles";

/**
 * Notifications (§44-45).
 *
 * Ce qui est eprouve ici, c'est ce qui separe une boite utile d'une boite
 * qu'on cesse de lire : ne pas se notifier soi-meme, ne pas doubler, ne pas
 * ecrire dans le vide, et toujours mener quelque part.
 */

function faux() {
  const createMany = vi.fn();
  return { tx: { notification: { createMany } }, createMany };
}

describe("notifier", () => {
  it("ecrit UNE ligne par destinataire : l'etat « lu » appartient a chacun", async () => {
    const { tx, createMany } = faux();

    const n = await notifier(tx as never, {
      type: "DELIVERED",
      entite: "Order",
      entiteId: "KOLI-ABC",
      destinataires: ["u-client", "u-vendeur"],
    });

    expect(n).toBe(2);
    const lignes = createMany.mock.calls[0][0].data;
    expect(lignes.map((l: { userId: string }) => l.userId)).toEqual([
      "u-client",
      "u-vendeur",
    ]);
  });

  it("ne notifie JAMAIS l'auteur de sa propre action", async () => {
    // Une boite pleine de ses propres gestes cesse d'etre lue — et le jour ou
    // une vraie information y arrive, elle passe inapercue.
    const { tx, createMany } = faux();

    const n = await notifier(tx as never, {
      type: "ORDER_ACCEPTED",
      entite: "Order",
      entiteId: "KOLI-ABC",
      destinataires: ["u-vendeur", "u-client"],
      exclure: "u-vendeur",
    });

    expect(n).toBe(1);
    expect(createMany.mock.calls[0][0].data[0].userId).toBe("u-client");
  });

  it("ecarte les doublons", async () => {
    const { tx, createMany } = faux();

    const n = await notifier(tx as never, {
      type: "REFUND",
      entite: "Order",
      entiteId: "KOLI-ABC",
      destinataires: ["u1", "u1", "u1"],
    });

    expect(n).toBe(1);
    expect(createMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it("n'ecrit rien pour un acheteur sans compte", async () => {
    // Limite assumee : l'achat en mode invite n'a pas de compte a prevenir.
    // L'acheteur garde son lien de suivi, qui reste son moyen d'acces (§9).
    const { tx, createMany } = faux();

    const n = await notifier(tx as never, {
      type: "PAYMENT_CONFIRMED",
      entite: "Order",
      entiteId: "KOLI-ABC",
      destinataires: [null, undefined, ""],
    });

    expect(n).toBe(0);
    // Et surtout : pas d'appel a vide, qui ferait une ecriture inutile.
    expect(createMany).not.toHaveBeenCalled();
  });

  it("n'ecrit rien quand le seul destinataire est l'auteur", async () => {
    const { tx, createMany } = faux();

    const n = await notifier(tx as never, {
      type: "FUNDS_RELEASED",
      entite: "Order",
      entiteId: "KOLI-ABC",
      destinataires: ["u-seul"],
      exclure: "u-seul",
    });

    expect(n).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe("partiesDeLaCommande", () => {
  it("retrouve le client par son COMPTE quand il en a un", async () => {
    const tx = {
      order: {
        findUnique: vi.fn().mockResolvedValue({
          buyerPhone: "+2250505050505",
          seller: { userId: "u-vendeur" },
          customer: { userId: "u-client" },
        }),
      },
      user: { findFirst: vi.fn() },
    };

    const parties = await partiesDeLaCommande(tx as never, "o1");

    expect(parties).toEqual({ vendeur: "u-vendeur", client: "u-client" });
    // Le compte etant deja rattache, inutile de chercher par telephone.
    expect(tx.user.findFirst).not.toHaveBeenCalled();
  });

  it("retrouve le client par son TELEPHONE a defaut de rattachement", async () => {
    // Une commande passee en mode invite, puis revendiquee par un compte cree
    // plus tard avec le meme numero : la bonne personne doit etre prevenue.
    const tx = {
      order: {
        findUnique: vi.fn().mockResolvedValue({
          buyerPhone: "+2250505050505",
          seller: { userId: "u-vendeur" },
          customer: null,
        }),
      },
      user: { findFirst: vi.fn().mockResolvedValue({ id: "u-tardif" }) },
    };

    const parties = await partiesDeLaCommande(tx as never, "o1");

    expect(parties.client).toBe("u-tardif");
  });

  it("rend des valeurs nulles pour un acheteur qui n'a aucun compte", async () => {
    const tx = {
      order: {
        findUnique: vi.fn().mockResolvedValue({
          buyerPhone: "+2250505050505",
          seller: { userId: "u-vendeur" },
          customer: null,
        }),
      },
      user: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    const parties = await partiesDeLaCommande(tx as never, "o1");

    expect(parties).toEqual({ vendeur: "u-vendeur", client: null });
  });

  it("ne casse pas sur une commande introuvable", async () => {
    const tx = {
      order: { findUnique: vi.fn().mockResolvedValue(null) },
      user: { findFirst: vi.fn() },
    };

    await expect(partiesDeLaCommande(tx as never, "inconnu")).resolves.toEqual({
      vendeur: null,
      client: null,
    });
  });
});

describe("formulerNotification", () => {
  it("raconte le MEME evenement differemment selon le destinataire", () => {
    // « Votre paiement est confirme » pour le client, « un client vient de
    // payer » pour le vendeur : un texte unique aurait menti a l'un des deux.
    const client = formulerNotification("PAYMENT_CONFIRMED", "CLIENT");
    const vendeur = formulerNotification("FUNDS_SECURED", "SELLER");

    expect(client.titre).toMatch(/votre paiement/i);
    expect(vendeur.titre).toMatch(/client vient de payer/i);
  });

  it("retombe sur une formulation par defaut pour un role sans texte dedie", () => {
    const livreur = formulerNotification("REFUND", "DRIVER");
    expect(livreur.titre).toBeTruthy();
    expect(livreur.detail).toBeTruthy();
  });

  it("couvre TOUS les types : aucune notification muette", () => {
    // Un type ajoute sans formulation produirait une notification vide — donc
    // un avis qui n'apprend rien. Ce test force a faire les deux.
    const types = [
      "PAYMENT_CONFIRMED", "FUNDS_SECURED", "ORDER_ACCEPTED", "PACKAGE_READY",
      "PICKED_UP", "IN_TRANSIT", "DELIVERED", "CUSTOMER_CONFIRMED",
      "FUNDS_RELEASED", "DISPUTE_OPEN", "REFUND",
    ] as const;

    for (const type of types) {
      for (const role of ["CLIENT", "SELLER", "DRIVER", "ADMIN"] as const) {
        const f = formulerNotification(type, role);
        expect(f.titre.length, `${type}/${role}`).toBeGreaterThan(3);
        expect(f.detail.length, `${type}/${role}`).toBeGreaterThan(3);
      }
    }
  });
});

describe("lienNotification", () => {
  it("mene chacun vers SA page (§45)", () => {
    // Renvoyer les deux au meme endroit enverrait forcement l'un des deux sur
    // une page a laquelle il n'a pas acces.
    expect(lienNotification("Order", "KOLI-ABC", "CLIENT")).toBe("/pay/KOLI-ABC");
    expect(lienNotification("Order", "KOLI-ABC", "SELLER")).toBe(
      "/vendeur/commandes?q=KOLI-ABC"
    );
    expect(lienNotification("Order", "KOLI-ABC", "ADMIN")).toBe(
      "/admin/litiges?q=KOLI-ABC"
    );
    expect(lienNotification("Order", "KOLI-ABC", "DRIVER")).toBe(
      "/livreur/dashboard"
    );
  });

  it("echappe la reference : elle finit dans une URL", () => {
    expect(lienNotification("Order", "A B&C", "SELLER")).toContain("A%20B%26C");
  });

  it("ne fabrique pas de lien sans objet", () => {
    expect(lienNotification(null, null, "CLIENT")).toBeNull();
    expect(lienNotification("Order", null, "CLIENT")).toBeNull();
    expect(lienNotification("Autre", "x", "CLIENT")).toBeNull();
  });
});
