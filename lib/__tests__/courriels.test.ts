import { describe, it, expect } from "vitest";
import { NotificationType } from "@prisma/client";
import {
  MESSAGES,
  SANS_COURRIEL,
  estFictive,
  motifDeNonEnvoi,
  type MontantsDeLaCommande,
} from "@/lib/notifications/textes";

/**
 * Ce que KOLI écrit à ses utilisateurs.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Ces phrases sont les premiers mots que KOLI adresse à un vendeur, et    │
 * │  elles partent d'un domaine qui porte son nom.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Un courriel ne se rattrape pas : il est parti, il est lu, il se transfère.
 * Les contrôles ci-dessous éprouvent trois choses qu'aucun autre test ne
 * regarde — la règle du §25, l'exactitude des montants, et le fait qu'une
 * phrase reste correcte quand le registre ne dit rien.
 */

const AUCUN: MontantsDeLaCommande = {
  paye: null,
  sequestre: null,
  libereNet: null,
  rembourse: null,
};

const PLEIN: MontantsDeLaCommande = {
  paye: "2 500 FC",
  sequestre: "2 000 FC",
  libereNet: "1 900 FC",
  rembourse: "2 500 FC",
};

const REF = "KOLI-ABCD1234";

describe("le courriel du livreur — §25", () => {
  /**
   * LE contrôle de ce fichier.
   *
   * Le §25 interdit au livreur de connaître la valeur de ce qu'il transporte.
   * La règle est déjà tenue à l'écran — `verif:courbes` la vérifie sur son
   * tableau de bord — mais un courriel est un écran de plus, et celui qui
   * voyage le mieux : il se montre, se transfère, se lit par-dessus l'épaule.
   *
   * Un livreur qui sait qu'il porte pour 400 000 FCFA ne fait pas le même
   * trajet.
   */
  it("ne porte AUCUN montant, même quand le registre en offre", () => {
    const texte = MESSAGES.ORDER_ACCEPTED!.corps(REF, PLEIN);

    for (const montant of Object.values(PLEIN)) {
      expect(texte).not.toContain(montant!);
    }
    // Et aucun chiffre suivi d'une unité, au cas où un montant arriverait par
    // un autre chemin que `PLEIN`.
    expect(texte).not.toMatch(/\d[\d\s ]*\s*(FC|FCFA|₦|KSh|GH₵)/);
  });

  it("dit quand même l'essentiel : quelle commande", () => {
    expect(MESSAGES.ORDER_ACCEPTED!.corps(REF, PLEIN)).toContain(REF);
  });
});

describe("les montants, quand le registre les porte", () => {
  it("le vendeur voit ce qui est séquestré pour lui", () => {
    const t = MESSAGES.FUNDS_SECURED!.corps(REF, PLEIN);
    expect(t).toContain("2 000 FC");
    // Pas le montant payé par le client : la livraison ne lui revient pas.
    expect(t).not.toContain("2 500 FC");
  });

  it("l'acheteur voit ce qu'il a réglé", () => {
    expect(MESSAGES.PAYMENT_CONFIRMED!.corps(REF, PLEIN)).toContain("2 500 FC");
  });

  it("le vendeur voit le NET à la libération", () => {
    const t = MESSAGES.FUNDS_RELEASED!.corps(REF, PLEIN);
    expect(t).toContain("1 900 FC");
  });

  /**
   * Décision de l'utilisateur, le 6 septembre 2026 : le mot ne figure pas.
   *
   * Le chiffre annoncé est celui que le vendeur touche — vrai sans réserve. Le
   * détail de ce qui a été retenu vit dans son solde (§40), où il peut le
   * regarder posément plutôt que de l'apprendre dans un courriel.
   */
  it("ne nomme jamais la commission", () => {
    for (const message of Object.values(MESSAGES)) {
      expect(message.corps(REF, PLEIN).toLowerCase()).not.toContain("commission");
    }
  });
});

describe("les montants, quand le registre se tait", () => {
  /**
   * Une phrase sans montant reste vraie. Une phrase avec un mauvais montant,
   * non — et c'est celle-là qu'on lirait dans la boîte d'un vendeur.
   */
  it("chaque texte reste une phrase correcte sans aucun montant", () => {
    for (const [type, message] of Object.entries(MESSAGES)) {
      const t = message.corps(REF, AUCUN);

      expect(t, type).toContain(REF);
      // Ni deux-points orphelin, ni espace avant un point, ni double espace :
      // les marques d'un gabarit dont un morceau a disparu.
      expect(t, type).not.toMatch(/:\s*\./);
      expect(t, type).not.toMatch(/\s\./);
      expect(t, type).not.toMatch(/ {2}/);
    }
  });
});

describe("chaque type est TRANCHÉ", () => {
  /**
   * Un type de notification est soit écrit, soit délibérément muet — jamais
   * ni l'un ni l'autre.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │  Sans ce contrôle, ajouter un type au schéma suffit à créer une      │
   * │  notification que personne ne reçoit, sans que rien ne le dise.      │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * L'expédition marque alors la ligne « aucun texte pour ce type » et passe à
   * la suivante — c'est le bon comportement, sinon la file se bloquerait —,
   * mais le vendeur, lui, n'apprend rien. Le défaut serait parfaitement muet,
   * et c'est exactement ainsi que les deux paiements du 6 septembre 2026 ont
   * été perdus.
   */
  it("aucun type n'est ni écrit ni écarté", () => {
    const orphelins = Object.values(NotificationType).filter(
      (type) => !MESSAGES[type] && !SANS_COURRIEL.includes(type)
    );

    expect(
      orphelins,
      `${orphelins.join(", ")} — écrire le texte, ou l'ajouter à SANS_COURRIEL`
    ).toEqual([]);
  });

  /**
   * L'inverse compte autant : un type écarté ET écrit dit deux choses
   * contraires, et c'est la liste qui gagnerait — le texte serait là, jamais
   * envoyé, et sa présence donnerait à croire qu'il part.
   */
  it("aucun type n'est à la fois écrit et écarté", () => {
    for (const type of SANS_COURRIEL) {
      expect(MESSAGES[type], type).toBeUndefined();
    }
  });
});

describe("ce qui empêche d'écrire", () => {
  const bon = {
    adresse: "vendeur@premiummarketafrica.com",
    type: NotificationType.FUNDS_SECURED,
    reference: REF,
  };

  it("rien ne s'oppose à une notification complète", () => {
    expect(motifDeNonEnvoi(bon)).toBeNull();
  });

  /**
   * La plupart des acheteurs de KOLI n'ont donné qu'un téléphone. Ce n'est pas
   * une panne, et le motif doit le dire — sinon on cherchera une panne.
   */
  it("pas d'adresse : on le dit, on ne s'en alarme pas", () => {
    expect(motifDeNonEnvoi({ ...bon, adresse: null })).toBe("aucune adresse");
    expect(motifDeNonEnvoi({ ...bon, adresse: "   " })).toBe("aucune adresse");
  });

  /**
   * Le §25 du registre : « pas de courriel pour ce type » est un CHOIX,
   * « aucun texte » un OUBLI. Les confondre ferait réparer l'un en croyant
   * réparer l'autre.
   */
  it("distingue le type délibérément muet du type oublié", () => {
    expect(motifDeNonEnvoi({ ...bon, type: NotificationType.IN_TRANSIT })).toBe(
      "pas de courriel pour ce type (choix)"
    );
  });

  /**
   * `entityId` est nullable. Le repli sur une chaîne vide produisait « Vous
   * avez une vente — » et « la commande . », adressé à un vrai vendeur.
   */
  it("pas de référence : on n'envoie rien plutôt qu'une phrase cassée", () => {
    expect(motifDeNonEnvoi({ ...bon, reference: null })).toBe(
      "aucune reference de commande"
    );
    expect(motifDeNonEnvoi({ ...bon, reference: "  " })).toBe(
      "aucune reference de commande"
    );
  });

  it("écarte les adresses du jeu de démonstration", () => {
    expect(motifDeNonEnvoi({ ...bon, adresse: "vendeur@koli.ci" })).toBe(
      "adresse de demonstration"
    );
  });

  /**
   * L'ORDRE compte, et il n'est pas arbitraire.
   *
   * Une notification sans adresse ET sans référence doit dire « aucune
   * adresse » : c'est le fait le plus général, celui qui explique tout le
   * reste. Un motif qui change selon un détail sans rapport rend le registre
   * illisible — et c'est le registre qu'on lira pour comprendre.
   */
  it("nomme le premier obstacle, pas le dernier", () => {
    expect(motifDeNonEnvoi({ ...bon, adresse: null, reference: null })).toBe(
      "aucune adresse"
    );
  });
});

describe("les adresses de démonstration", () => {
  /**
   * Chaque campagne crée des ventes, donc des notifications. Sans ce garde,
   * elle expédierait une dizaine de courriels vers des boîtes inexistantes à
   * chaque passage — et chaque rebond abîme la réputation d'envoi, celle qui
   * décide si un vrai vendeur trouve le message dans sa boîte.
   */
  it("écarte le domaine du jeu de démonstration", () => {
    expect(estFictive("vendeur@koli.ci")).toBe(true);
    expect(estFictive("client@koli.ci")).toBe(true);
    expect(estFictive("quelqu-un@example.com")).toBe(true);
  });

  it("laisse passer une vraie adresse", () => {
    expect(estFictive("toxint17@gmail.com")).toBe(false);
    expect(estFictive("vendeur@premiummarketafrica.com")).toBe(false);
  });

  /**
   * La liste est explicite, et ce test dit pourquoi. Un filtre malin — « les
   * adresses contenant *test* » — écarterait un jour le courriel d'un vrai
   * commerçant qui s'appelle Testa.
   */
  it("ne devine pas : un nom qui ressemble à un test passe quand même", () => {
    expect(estFictive("testa@gmail.com")).toBe(false);
    expect(estFictive("boutique-test@premiummarketafrica.com")).toBe(false);
  });
});
