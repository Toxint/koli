import { describe, it, expect } from "vitest";
import {
  generateOrderReference,
  isValidOrderReference,
} from "./reference";

describe("references de commande", () => {
  it("respecte le format KOLI-XXXXXXXX", () => {
    const reference = generateOrderReference();
    expect(reference).toMatch(/^KOLI-[0-9A-Z]{8}$/);
    expect(isValidOrderReference(reference)).toBe(true);
  });

  it("n'utilise aucun caractere ambigu (0, 1, I, L, O, U)", () => {
    for (let i = 0; i < 200; i++) {
      const suffixe = generateOrderReference().slice(5);
      expect(suffixe).not.toMatch(/[01ILOU]/);
    }
  });

  it("n'est pas sequentielle : aucune collision sur un large tirage", () => {
    const vues = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      vues.add(generateOrderReference());
    }
    expect(vues.size).toBe(5000);
  });

  it("rejette les formats invalides", () => {
    // L'ancien format sequentiel, precisement ce qu'on ne veut plus.
    expect(isValidOrderReference("KOLI-000125")).toBe(false);
    expect(isValidOrderReference("CMD-001")).toBe(false);
    expect(isValidOrderReference("KOLI-ABC")).toBe(false);
    expect(isValidOrderReference("")).toBe(false);
  });
});
