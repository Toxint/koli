import { describe, it, expect } from "vitest";
import { OrderStatus } from "@prisma/client";
import {
  ORDER_STATUS_TRANSITIONS,
  canTransition,
  assertTransition,
  isTerminalStatus,
  findTransitionPath,
  InvalidOrderTransitionError,
} from "./statusMachine";

describe("machine a etats des commandes", () => {
  it("couvre tous les statuts de l'enum Prisma", () => {
    const declares = Object.keys(ORDER_STATUS_TRANSITIONS).sort();
    const attendus = Object.values(OrderStatus).sort();
    expect(declares).toEqual(attendus);
  });

  it("ne cible que des statuts valides", () => {
    const valides = new Set<string>(Object.values(OrderStatus));
    for (const [from, cibles] of Object.entries(ORDER_STATUS_TRANSITIONS)) {
      for (const cible of cibles) {
        expect(valides.has(cible), `${from} -> ${cible}`).toBe(true);
      }
    }
  });

  it("autorise le parcours nominal complet", () => {
    const parcours: OrderStatus[] = [
      OrderStatus.DRAFT,
      OrderStatus.PAYMENT_PENDING,
      OrderStatus.PAYMENT_CONFIRMED,
      OrderStatus.FUNDS_SECURED,
      OrderStatus.SELLER_ACCEPTED,
      OrderStatus.PACKAGE_PREPARING,
      OrderStatus.READY_FOR_PICKUP,
      OrderStatus.PICKED_UP,
      OrderStatus.IN_TRANSIT,
      OrderStatus.ARRIVED,
      OrderStatus.DELIVERED,
      OrderStatus.CUSTOMER_CONFIRMED,
      OrderStatus.FUNDS_RELEASED,
      OrderStatus.COMPLETED,
    ];

    for (let i = 0; i < parcours.length - 1; i++) {
      expect(
        canTransition(parcours[i], parcours[i + 1]),
        `${parcours[i]} -> ${parcours[i + 1]}`
      ).toBe(true);
    }
  });

  it("refuse le raccourci FUNDS_SECURED -> FUNDS_RELEASED (§15)", () => {
    // L'exemple litteral du cahier des charges : les fonds ne peuvent pas
    // etre liberes sans passer par la livraison et la confirmation client.
    expect(
      canTransition(OrderStatus.FUNDS_SECURED, OrderStatus.FUNDS_RELEASED)
    ).toBe(false);
    expect(
      canTransition(OrderStatus.FUNDS_SECURED, OrderStatus.SELLER_ACCEPTED)
    ).toBe(true);
  });

  it("refuse de ressusciter une commande terminee", () => {
    for (const terminal of [
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
      OrderStatus.REFUNDED,
    ]) {
      expect(isTerminalStatus(terminal)).toBe(true);
      expect(canTransition(terminal, OrderStatus.FUNDS_SECURED)).toBe(false);
      expect(canTransition(terminal, OrderStatus.PAYMENT_PENDING)).toBe(false);
    }
  });

  it("refuse de reouvrir un paiement sur une commande deja livree", () => {
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.FUNDS_SECURED)).toBe(
      false
    );
    expect(
      canTransition(OrderStatus.FUNDS_RELEASED, OrderStatus.FUNDS_SECURED)
    ).toBe(false);
  });

  it("n'autorise la liberation des fonds qu'apres confirmation client ou decision de litige (§33)", () => {
    const sources = Object.values(OrderStatus).filter((from) =>
      canTransition(from, OrderStatus.FUNDS_RELEASED)
    );
    expect(sources.sort()).toEqual(
      [OrderStatus.CUSTOMER_CONFIRMED, OrderStatus.DISPUTE_OPEN].sort()
    );
  });

  it("permet de reessayer apres un paiement echoue (§23)", () => {
    expect(
      canTransition(OrderStatus.PAYMENT_FAILED, OrderStatus.PAYMENT_PENDING)
    ).toBe(true);
  });

  it("oriente un litige vers la liberation ou le remboursement (§32)", () => {
    expect(
      canTransition(OrderStatus.DISPUTE_OPEN, OrderStatus.FUNDS_RELEASED)
    ).toBe(true);
    expect(
      canTransition(OrderStatus.DISPUTE_OPEN, OrderStatus.REFUND_PENDING)
    ).toBe(true);
    expect(canTransition(OrderStatus.DISPUTE_OPEN, OrderStatus.COMPLETED)).toBe(
      false
    );
  });

  describe("findTransitionPath", () => {
    it("retourne un chemin vide pour un statut identique", () => {
      expect(
        findTransitionPath(OrderStatus.DELIVERED, OrderStatus.DELIVERED)
      ).toEqual([]);
    });

    it("trouve le saut direct quand il existe", () => {
      expect(
        findTransitionPath(OrderStatus.DRAFT, OrderStatus.PAYMENT_PENDING)
      ).toEqual([OrderStatus.PAYMENT_PENDING]);
    });

    it("traverse les jalons de livraison depuis FUNDS_SECURED", () => {
      const chemin = findTransitionPath(
        OrderStatus.FUNDS_SECURED,
        OrderStatus.DELIVERED
      );
      expect(chemin).toEqual([
        OrderStatus.SELLER_ACCEPTED,
        OrderStatus.PACKAGE_PREPARING,
        OrderStatus.READY_FOR_PICKUP,
        OrderStatus.PICKED_UP,
        OrderStatus.IN_TRANSIT,
        OrderStatus.ARRIVED,
        OrderStatus.DELIVERED,
      ]);
    });

    it("ne produit que des sauts legaux", () => {
      const chemin = findTransitionPath(
        OrderStatus.FUNDS_SECURED,
        OrderStatus.DELIVERED
      );
      let courant: OrderStatus = OrderStatus.FUNDS_SECURED;
      for (const etape of chemin ?? []) {
        expect(canTransition(courant, etape), `${courant} -> ${etape}`).toBe(
          true
        );
        courant = etape;
      }
    });

    it("retourne null quand aucun chemin n'existe", () => {
      expect(
        findTransitionPath(OrderStatus.COMPLETED, OrderStatus.FUNDS_SECURED)
      ).toBeNull();
    });
  });

  describe("assertTransition", () => {
    it("passe sans erreur sur une transition autorisee", () => {
      expect(() =>
        assertTransition(OrderStatus.DRAFT, OrderStatus.PAYMENT_PENDING)
      ).not.toThrow();
    });

    it("leve InvalidOrderTransitionError sur une transition interdite", () => {
      expect(() =>
        assertTransition(OrderStatus.FUNDS_SECURED, OrderStatus.FUNDS_RELEASED)
      ).toThrow(InvalidOrderTransitionError);
    });
  });
});
