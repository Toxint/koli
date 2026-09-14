import { describe, expect, it } from "vitest";
import {
  COMPTES_RETRAIT_MAX,
  chiffresDe,
  libelleDuCompte,
  memeNumero,
  refusDeCompteRetrait,
} from "@/lib/finance/comptes-retrait";

/**
 * La règle des numéros de retrait, éprouvée sans base ni réseau.
 *
 * C'est la donnée qui décide OÙ part l'argent : chaque refus doit tomber pour
 * la bonne raison, et l'ordre des refus compte autant que les refus eux-mêmes.
 */

const OPERATEURS = ["Wave", "Orange Money", "MTN Money"];

function saisie(over: Partial<Parameters<typeof refusDeCompteRetrait>[0]> = {}) {
  return refusDeCompteRetrait({
    telephone: "+225 07 01 02 03 04",
    operateur: "Wave",
    titulaire: "Awa Kone",
    operateursAutorises: OPERATEURS,
    numerosDejaEnregistres: [],
    comptesExistants: 0,
    ...over,
  });
}

describe("refusDeCompteRetrait", () => {
  it("accepte un numéro complet", () => {
    expect(saisie()).toBeNull();
  });

  it("refuse un numéro trop court", () => {
    expect(saisie({ telephone: "0701" })).toMatch(/numéro Mobile Money/);
  });

  it("refuse un numéro vide", () => {
    expect(saisie({ telephone: "   " })).toMatch(/numéro Mobile Money/);
  });

  it("refuse un opérateur absent", () => {
    expect(saisie({ operateur: "" })).toMatch(/Choisissez l'opérateur/);
  });

  it("refuse un opérateur qui n'est pas desservi dans le pays", () => {
    // Celui d'un pays voisin : le versement serait inexécutable, et on ne le
    // découvrirait qu'au moment d'envoyer.
    expect(saisie({ operateur: "M-Pesa" })).toMatch(/pas desservi/);
  });

  it("accepte n'importe quel opérateur quand la liste du pays est inconnue", () => {
    // Un pays sans liste ne doit pas bloquer un vendeur : le défaut penche du
    // côté qui laisse travailler, la saisie restant visible à l'écran.
    expect(saisie({ operateur: "Coopérative locale", operateursAutorises: [] })).toBeNull();
  });

  it("refuse un titulaire vide ou trop court", () => {
    expect(saisie({ titulaire: "" })).toMatch(/titulaire/);
    expect(saisie({ titulaire: "A." })).toMatch(/titulaire/);
  });

  it("refuse un numéro déjà enregistré", () => {
    expect(
      saisie({ numerosDejaEnregistres: ["+225 07 01 02 03 04"] })
    ).toMatch(/déjà enregistré/);
  });

  it("reconnaît le même numéro écrit autrement", () => {
    // Avec et sans indicatif : c'est la même ligne, et deux entrées identiques
    // dans la liste de choix sont exactement la confusion à éviter.
    expect(saisie({ numerosDejaEnregistres: ["0701020304"] })).toMatch(
      /déjà enregistré/
    );
  });

  it("refuse au-delà du nombre maximum de comptes", () => {
    expect(saisie({ comptesExistants: COMPTES_RETRAIT_MAX })).toMatch(
      /Supprimez-en un/
    );
  });

  it("signale le NUMÉRO avant l'opérateur, et l'opérateur avant le titulaire", () => {
    /*
     * L'ordre suit le formulaire. Un message qui saute au troisième champ
     * pendant que le premier est vide fait corriger ce qui n'était pas en
     * cause. Ce test tombe si quelqu'un réordonne les gardes.
     */
    expect(saisie({ telephone: "07", operateur: "", titulaire: "" })).toMatch(
      /numéro Mobile Money/
    );
    expect(saisie({ operateur: "", titulaire: "" })).toMatch(
      /Choisissez l'opérateur/
    );
    expect(saisie({ titulaire: "" })).toMatch(/titulaire/);
  });

  it("ne refuse pas pour doublon un numéro qui n'en est pas un", () => {
    // « Déjà enregistré » n'a aucun sens tant qu'on ne sait pas si c'est un
    // numéro : la forme passe avant la comparaison.
    expect(saisie({ telephone: "07", numerosDejaEnregistres: ["07"] })).toMatch(
      /numéro Mobile Money/
    );
  });
});

describe("memeNumero", () => {
  it("reconnaît deux écritures d'un même numéro", () => {
    expect(memeNumero("+225 07 01 02 03 04", "0701020304")).toBe(true);
    expect(memeNumero("00225 0701020304", "+2250701020304")).toBe(true);
  });

  it("distingue deux numéros différents", () => {
    expect(memeNumero("0701020304", "0701020305")).toBe(false);
  });

  it("refuse de conclure sur des fragments trop courts", () => {
    // Sans ce plancher, « 0304 » et « 020304 » se confondraient, et l'on
    // empêcherait d'enregistrer un numéro parfaitement distinct.
    expect(memeNumero("0304", "020304")).toBe(false);
  });

  it("ne garde que les chiffres", () => {
    expect(chiffresDe("+225 (07) 01-02-03-04")).toBe("2250701020304");
  });
});

describe("libelleDuCompte", () => {
  it("met le numéro en tête, puis le titulaire", () => {
    const libelle = libelleDuCompte({
      phone: "+2250701020304",
      holderName: "Awa Kone",
      operator: "Wave",
      label: "boutique",
    });
    expect(libelle.indexOf("+2250701020304")).toBe(0);
    expect(libelle.indexOf("Awa Kone")).toBeLessThan(libelle.indexOf("Wave"));
    expect(libelle).toContain("« boutique »");
  });

  it("se passe du surnom quand il n'y en a pas", () => {
    const libelle = libelleDuCompte({
      phone: "+2250701020304",
      holderName: "Awa Kone",
      operator: "Wave",
      label: null,
    });
    expect(libelle).toBe("+2250701020304 · Awa Kone · Wave");
    // Pas de séparateur orphelin : la marque d'un gabarit dont un morceau a
    // disparu, comme dans les textes de courriel.
    expect(libelle.endsWith("·")).toBe(false);
  });
});
