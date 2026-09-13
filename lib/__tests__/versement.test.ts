import { describe, it, expect } from "vitest";
import {
  refusDeVersement,
  VERSEMENT_MINIMUM,
  type DemandeDeVersement,
} from "../finance/versement";

/**
 * Les règles du versement au vendeur (§43).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  C'est le seul acte de KOLI qui fait SORTIR de l'argent. Il ne se       │
 * │  rejoue pas et ne s'annule pas.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ces contrôles tournent **sans base et sans réseau** : `refusDeVersement` est
 * pure, et c'est précisément pour cela qu'elle a été séparée de l'action. Un
 * contrôle qu'on ne peut pas lancer est un contrôle qu'on ne lance pas.
 */

const BASE: DemandeDeVersement = {
  versable: 50_000,
  montant: 20_000,
  devise: "XOF",
  demandeEnCours: false,
  telephone: "+2250701020304",
};

const avec = (p: Partial<DemandeDeVersement>) => ({ ...BASE, ...p });

describe("refusDeVersement", () => {
  it("laisse passer une demande normale", () => {
    expect(refusDeVersement(BASE)).toBeNull();
  });

  it("accepte exactement le minimum", () => {
    // La borne est INCLUSIVE : refuser 4 000 quand le minimum est 4 000
    // donnerait un message qui se contredit lui-meme.
    expect(
      refusDeVersement(avec({ montant: VERSEMENT_MINIMUM }))
    ).toBeNull();
  });

  it("refuse un franc sous le minimum", () => {
    expect(refusDeVersement(avec({ montant: VERSEMENT_MINIMUM - 1 }))).toMatch(
      /minimum/i
    );
  });

  it("refuse un montant qui depasse le VERSABLE", () => {
    expect(refusDeVersement(avec({ montant: 50_001 }))).toMatch(/dépasse/i);
  });

  it("accepte exactement le versable : on peut tout retirer", () => {
    // Laisser un reliquat obligatoire serait de l'argent que le vendeur a
    // gagne et ne peut pas toucher.
    expect(refusDeVersement(avec({ montant: 50_000 }))).toBeNull();
  });

  it("refuse une seconde demande quand une est deja en cours", () => {
    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │  Sans cette garde, deux demandes successives videraient le meme     │
     * │  solde deux fois : la seconde serait acceptee avant que la premiere │
     * │  ne soit executee, et le solde ne verrait ni l'une ni l'autre.      │
     * └──────────────────────────────────────────────────────────────────────┘
     */
    expect(refusDeVersement(avec({ demandeEnCours: true }))).toMatch(
      /déjà en cours/i
    );
  });

  it("annonce la demande en cours AVANT le montant, pas l'inverse", () => {
    /*
     * L'ORDRE des motifs n'est pas arbitraire.
     *
     * Un vendeur qui a une demande en cours ET un montant trop faible doit
     * lire « une demande est deja en cours » : c'est le fait qui explique le
     * reste, et corriger le montant ne lui servirait a rien. Un motif qui
     * change selon un detail sans rapport rend l'ecran incomprehensible.
     *
     * C'est la meme lecon que `motifDeNonEnvoi`, ou l'inversion de deux tests
     * avait suffi a rendre le registre illisible.
     */
    const motif = refusDeVersement(
      avec({ demandeEnCours: true, montant: 10 })
    );
    expect(motif).toMatch(/déjà en cours/i);
    expect(motif).not.toMatch(/minimum/i);
  });

  it("refuse un montant nul, negatif, ou a virgule", () => {
    // Un centime de franc CFA n'existe pas : les montants sont des entiers
    // partout dans le schema.
    expect(refusDeVersement(avec({ montant: 0 }))).toMatch(/montant/i);
    expect(refusDeVersement(avec({ montant: -20_000 }))).toMatch(/montant/i);
    expect(refusDeVersement(avec({ montant: 20_000.5 }))).toMatch(/montant/i);
  });

  it("exige un numero plausible — c'est la DESTINATION de l'argent", () => {
    expect(refusDeVersement(avec({ telephone: "" }))).toMatch(/numéro/i);
    expect(refusDeVersement(avec({ telephone: "06" }))).toMatch(/numéro/i);
    // Mais on ne juge pas la FORME au-dela de ca : les indicatifs et les
    // longueurs varient d'un operateur a l'autre, et refuser un numero valide
    // bloquerait un vendeur sans recours.
    expect(refusDeVersement(avec({ telephone: "07 01 02 03 04" }))).toBeNull();
    expect(refusDeVersement(avec({ telephone: "+237 6 99 88 77 66" }))).toBeNull();
  });

  it("ouvre le franc CFA de l'Ouest ET celui du Centre", () => {
    expect(refusDeVersement(avec({ devise: "XOF" }))).toBeNull();
    expect(refusDeVersement(avec({ devise: "XAF" }))).toBeNull();
  });

  it("REFUSE une monnaie hors de la zone ouverte", () => {
    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │  Le seuil est UN nombre pour DEUX monnaies, et cela ne tient que    │
     * │  parce que XOF et XAF sont arrimes a l'euro au meme taux.           │
     * └──────────────────────────────────────────────────────────────────────┘
     *
     * 4 000 CDF valent environ 1 000 XOF — le quart de l'intention. Le jour ou
     * une autre monnaie s'ouvrira sans que `versement.ts` soit revu, ce seuil
     * deviendra faux, et faux SILENCIEUSEMENT. Cette garde refuse plutot que
     * de laisser passer.
     */
    expect(refusDeVersement(avec({ devise: "CDF" }))).toMatch(/monnaie/i);
    expect(refusDeVersement(avec({ devise: "NGN" }))).toMatch(/monnaie/i);
    expect(refusDeVersement(avec({ devise: "USD" }))).toMatch(/monnaie/i);
  });

  it("annonce la monnaie AVANT tout le reste", () => {
    // Une monnaie fermee rend les autres motifs sans objet : inutile de parler
    // d'un minimum qui ne veut rien dire dans cette unite.
    expect(
      refusDeVersement(
        avec({ devise: "CDF", montant: 10, demandeEnCours: true })
      )
    ).toMatch(/monnaie/i);
  });

  it("le minimum vaut 4 000 — la valeur decidee, pas une approximation", () => {
    // Ce test existe pour qu'un changement de seuil soit un acte deliberé et
    // non un effet de bord : il faut venir ici pour le modifier.
    expect(VERSEMENT_MINIMUM).toBe(4000);
  });
});
