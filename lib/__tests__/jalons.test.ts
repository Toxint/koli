import { describe, it, expect } from "vitest";
import {
  JALONS,
  JALONS_LIVREUR,
  indiceJalon,
  jalonParCode,
  prochainJalonLivreur,
} from "@/lib/deliveries/jalons";
import { ORDER_STATUS_TRANSITIONS } from "@/lib/orders/statusMachine";

/**
 * Jalons de la livraison (§26).
 *
 * Cette table est la source unique : le livreur y lit quel bouton proposer, le
 * client y lit sa frise, et la page de suivi en deduit si la commande est
 * payee. Une incoherence ici se propage donc partout a la fois — d'ou ces
 * controles sur la table elle-meme, avant tout comportement.
 */

describe("la table des jalons", () => {
  it("suit exactement l'ordre du §26", () => {
    expect(JALONS.map((j) => j.code)).toEqual([
      "PAYE",
      "ASSIGNE",
      "PRET",
      "RECUPERE",
      "EN_ROUTE",
      "ARRIVE",
      "REMIS",
    ]);
  });

  it("chaque jalon est atteignable depuis le precedent", () => {
    // Sans ce controle, on pourrait declarer une etape que la machine a etats
    // n'autorise pas : le bouton s'afficherait et echouerait a chaque appui.
    for (let i = 1; i < JALONS.length; i++) {
      const depuis = JALONS[i - 1].statutCommande;
      const vers = JALONS[i].statutCommande;
      const atteignable = cheminExiste(depuis, vers);
      expect(atteignable, `${depuis} → ${vers}`).toBe(true);
    }
  });

  it("n'attribue aucun libelle vide au client", () => {
    // La frise affiche `libelleClient` pour TOUS les jalons : un vide y
    // laisserait une puce muette.
    for (const j of JALONS) {
      expect(j.libelleClient.length, j.code).toBeGreaterThan(3);
    }
  });

  it("les trois etapes du livreur portent une action a la premiere personne", () => {
    expect(JALONS_LIVREUR.map((j) => j.code)).toEqual([
      "RECUPERE",
      "EN_ROUTE",
      "ARRIVE",
    ]);
    for (const j of JALONS_LIVREUR) {
      expect(j.actionLivreur, j.code).toMatch(/^(J'ai|Je)/);
    }
  });
});

describe("indiceJalon", () => {
  it("situe chaque etat du parcours", () => {
    expect(indiceJalon("FUNDS_SECURED")).toBe(0);
    expect(indiceJalon("SELLER_ACCEPTED")).toBe(1);
    expect(indiceJalon("READY_FOR_PICKUP")).toBe(2);
    expect(indiceJalon("PICKED_UP")).toBe(3);
    expect(indiceJalon("IN_TRANSIT")).toBe(4);
    expect(indiceJalon("ARRIVED")).toBe(5);
    expect(indiceJalon("DELIVERED")).toBe(6);
  });

  it("considere la frise entierement parcourue apres la remise", () => {
    for (const s of ["CUSTOMER_CONFIRMED", "FUNDS_RELEASED", "COMPLETED"] as const) {
      expect(indiceJalon(s), s).toBe(JALONS.length - 1);
    }
  });

  it("place l'etat de passage PACKAGE_PREPARING au jalon precedent", () => {
    // La machine y transite pour atteindre READY_FOR_PICKUP. Le client doit
    // lire « livreur designe », pas une etape qui n'existe pas pour lui.
    expect(indiceJalon("PACKAGE_PREPARING")).toBe(1);
  });

  it("REFUSE les etats hors parcours : la frise n'a pas a s'afficher", () => {
    // Montrer un colis « en route » a quelqu'un dont la commande est en
    // litige ou remboursee serait faux.
    for (const s of [
      "PAYMENT_PENDING",
      "DISPUTE_OPEN",
      "REFUND_PENDING",
      "REFUNDED",
      "CANCELLED",
      "PAYMENT_FAILED",
    ] as const) {
      expect(indiceJalon(s), s).toBe(-1);
    }
  });

  it("c'est ce qui distingue « paye » de « a payer »", () => {
    // La page de suivi en deduit `estPaye`. Une commande non reglee doit
    // rendre -1, sans quoi l'ecran de paiement disparaitrait avant le paiement.
    expect(indiceJalon("PAYMENT_PENDING")).toBe(-1);
    expect(indiceJalon("FUNDS_SECURED")).toBeGreaterThanOrEqual(0);
  });
});

describe("prochainJalonLivreur", () => {
  it("propose la recuperation tant que le colis n'est pas pris", () => {
    for (const s of ["UNASSIGNED", "ASSIGNED", "TO_PICK_UP"] as const) {
      expect(prochainJalonLivreur(s)?.code, s).toBe("RECUPERE");
    }
  });

  it("enchaine dans l'ordre", () => {
    expect(prochainJalonLivreur("PICKED_UP")?.code).toBe("EN_ROUTE");
    expect(prochainJalonLivreur("IN_TRANSIT")?.code).toBe("ARRIVE");
  });

  it("ne propose plus rien une fois arrive", () => {
    // Il ne reste que le code de reception, qui n'est pas un jalon mais la
    // remise elle-meme.
    expect(prochainJalonLivreur("ARRIVED")).toBeNull();
    expect(prochainJalonLivreur("CONFIRMED")).toBeNull();
  });
});

describe("jalonParCode", () => {
  it("reconnait les codes connus", () => {
    expect(jalonParCode("RECUPERE")?.statutCommande).toBe("PICKED_UP");
  });

  it("rejette tout le reste : la valeur vient d'un formulaire", () => {
    for (const v of ["", "INCONNU", null, undefined, 42, {}]) {
      expect(jalonParCode(v), String(v)).toBeNull();
    }
  });
});

/** Existe-t-il un chemin legal, meme indirect, entre deux etats ? */
function cheminExiste(depuis: string, vers: string): boolean {
  const vus = new Set<string>([depuis]);
  const file = [depuis];

  while (file.length > 0) {
    const courant = file.shift()!;
    if (courant === vers) return true;

    for (const suivant of ORDER_STATUS_TRANSITIONS[
      courant as keyof typeof ORDER_STATUS_TRANSITIONS
    ] ?? []) {
      if (!vus.has(suivant)) {
        vus.add(suivant);
        file.push(suivant);
      }
    }
  }

  return false;
}
