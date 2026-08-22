import { describe, it, expect } from "vitest";
import {
  formaterNumeroFacture,
  prefixeAnnee,
  estNumeroFacture,
} from "@/lib/invoices/numero";

/**
 * Numerotation des factures (§38).
 *
 * Contrairement a la reference de commande — deliberement NON devinable,
 * puisqu'elle fait office de capacite d'acces — un numero de facture doit
 * etre sequentiel et sans trou : c'est ce qui permet de constater qu'aucune
 * piece ne manque. Ces deux regles opposees se confondent facilement lors
 * d'une reprise, d'ou ces tests.
 */
describe("numerotation des factures", () => {
  it("complete le rang sur six chiffres", () => {
    expect(formaterNumeroFacture(2026, 1)).toBe("FAC-2026-000001");
    expect(formaterNumeroFacture(2026, 42)).toBe("FAC-2026-000042");
    expect(formaterNumeroFacture(2026, 123456)).toBe("FAC-2026-123456");
  });

  it("reste ordonnable alphabetiquement, donc chronologiquement", () => {
    // Sans le remplissage a six chiffres, « FAC-2026-10 » se classerait avant
    // « FAC-2026-9 » dans tout tri texte, y compris celui de la base.
    const numeros = [
      formaterNumeroFacture(2026, 10),
      formaterNumeroFacture(2026, 9),
      formaterNumeroFacture(2026, 100),
    ];
    expect([...numeros].sort()).toEqual([
      "FAC-2026-000009",
      "FAC-2026-000010",
      "FAC-2026-000100",
    ]);
  });

  it("repart de 1 chaque annee, sans collision entre annees", () => {
    expect(formaterNumeroFacture(2026, 1)).not.toBe(
      formaterNumeroFacture(2027, 1)
    );
  });

  it("le prefixe d'annee ne capture que l'annee visee", () => {
    expect(formaterNumeroFacture(2026, 7).startsWith(prefixeAnnee(2026))).toBe(
      true
    );
    expect(formaterNumeroFacture(2027, 7).startsWith(prefixeAnnee(2026))).toBe(
      false
    );
  });

  it("reconnait un numero valide et rejette le reste", () => {
    expect(estNumeroFacture("FAC-2026-000001")).toBe(true);
    expect(estNumeroFacture("FAC-2026-1")).toBe(false);
    expect(estNumeroFacture("KOLI-A4B9K2CK")).toBe(false);
    expect(estNumeroFacture("")).toBe(false);
  });
});
