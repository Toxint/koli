import { describe, it, expect } from "vitest";
import { pluriel } from "@/lib/format";

/**
 * Accord en nombre.
 *
 * Le francais ne met la marque du pluriel qu'a partir de 2 : « 0 commande »
 * s'ecrit au singulier, contrairement a l'anglais. C'est la regle que ce test
 * protege, parce qu'elle se perd facilement en recopiant un composant.
 */
describe("pluriel", () => {
  it("laisse zero au singulier", () => {
    expect(pluriel(0, "commande")).toBe("0 commande");
  });

  it("laisse un au singulier", () => {
    expect(pluriel(1, "vendeur")).toBe("1 vendeur");
  });

  it("accorde a partir de deux", () => {
    expect(pluriel(2, "produit")).toBe("2 produits");
    expect(pluriel(17, "livreur")).toBe("17 livreurs");
  });

  it("accepte une forme plurielle irreguliere", () => {
    expect(pluriel(3, "commande générée", "commandes générées")).toBe(
      "3 commandes générées"
    );
    expect(pluriel(1, "commande générée", "commandes générées")).toBe(
      "1 commande générée"
    );
  });
});
