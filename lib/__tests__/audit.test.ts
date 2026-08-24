import { describe, it, expect, vi } from "vitest";
import {
  ACTIONS_AUDIT,
  consigner,
  libelleAction,
  resumerDetails,
} from "@/lib/audit/journal";

/**
 * Journal d'audit (§48).
 *
 * Ce qui est éprouvé ici, c'est ce qui rend le journal utile ou inutile :
 * l'auteur doit survivre à la suppression de son compte, le avant → après doit
 * rester lisible, et une ligne corrompue ne doit pas casser la page.
 */

function clientFictif() {
  const create = vi.fn().mockResolvedValue({ id: "ligne" });
  return { client: { auditLog: { create } }, create };
}

describe("consigner", () => {
  it("recopie le nom et le role de l'acteur, pas seulement son identifiant", async () => {
    // C'est le point central : `actorUserId` est en `SetNull`. Supprimer un
    // compte rendrait la ligne anonyme, et un journal qui ne peut plus nommer
    // l'auteur d'une decision ne remplit plus sa fonction.
    const { client, create } = clientFictif();

    await consigner(client as never, {
      acteur: { id: "u1", name: "Awa Koné", role: "ADMIN" },
      action: ACTIONS_AUDIT.COMMISSION_RATE_SET,
      entite: "Commission",
      entiteId: "c1",
      details: { avant: "5 %", apres: "8 %" },
    });

    const ecrit = create.mock.calls[0][0].data;
    expect(ecrit.actorUserId).toBe("u1");
    expect(ecrit.actorName).toBe("Awa Koné");
    expect(ecrit.actorRole).toBe("ADMIN");
  });

  it("accepte l'absence d'acteur sans se plaindre", async () => {
    // Un acte automatique n'a pas d'auteur humain. Refuser l'ecriture ferait
    // perdre la trace plutot que de la rendre imprecise.
    const { client, create } = clientFictif();

    await consigner(client as never, {
      acteur: null,
      action: ACTIONS_AUDIT.FUNDS_RELEASE_TEST,
      entite: "Order",
      entiteId: "KOLI-ABC",
    });

    const ecrit = create.mock.calls[0][0].data;
    expect(ecrit.actorUserId).toBeNull();
    expect(ecrit.actorName).toBeNull();
    expect(ecrit.metadata).toBeNull();
  });

  it("serialise les details en JSON", async () => {
    const { client, create } = clientFictif();

    await consigner(client as never, {
      acteur: { id: "u1", name: "Admin", role: "ADMIN" },
      action: ACTIONS_AUDIT.REFUND_PROCESSED,
      entite: "Order",
      entiteId: "KOLI-XYZ",
      details: { montant: "20500 FCFA", stockRestitue: "non" },
    });

    const ecrit = create.mock.calls[0][0].data;
    expect(JSON.parse(ecrit.metadata)).toEqual({
      montant: "20500 FCFA",
      stockRestitue: "non",
    });
  });

  it("enregistre la reference lisible plutot que l'identifiant technique", async () => {
    // Le §48 le montre ainsi : « ORDER: KOLI-000124 ». « cmt5ih… » ne parle a
    // personne, et un journal qu'il faut dechiffrer n'est pas consulte.
    const { client, create } = clientFictif();

    await consigner(client as never, {
      acteur: { id: "u1", name: "Admin", role: "ADMIN" },
      action: ACTIONS_AUDIT.DISPUTE_RESOLVED,
      entite: "Order",
      entiteId: "KOLI-P9KAAP9Y",
    });

    expect(create.mock.calls[0][0].data.entityId).toBe("KOLI-P9KAAP9Y");
  });
});

describe("resumerDetails", () => {
  it("met le avant → apres en tete : c'est la seule forme vraiment utile", () => {
    const resume = resumerDetails(
      JSON.stringify({ avant: "5 %", apres: "8 %", compte: "Boutique Chic" })
    );
    expect(resume.startsWith("5 % → 8 %")).toBe(true);
    expect(resume).toContain("Boutique Chic");
  });

  it("supporte un avant ou un apres manquant", () => {
    expect(resumerDetails(JSON.stringify({ apres: "suspendue" }))).toContain(
      "— → suspendue"
    );
  });

  it("ne casse pas sur un JSON illisible", () => {
    // Une ligne corrompue — reprise de donnees, ecriture partielle — ne doit
    // pas faire tomber toute la page de consultation.
    expect(() => resumerDetails("{ceci n'est pas du JSON")).not.toThrow();
    expect(resumerDetails("{ceci n'est pas du JSON")).toContain("ceci");
  });

  it("rend une chaine vide quand il n'y a rien a dire", () => {
    expect(resumerDetails(null)).toBe("");
  });

  it("ignore les valeurs vides plutot que d'afficher « : »", () => {
    const resume = resumerDetails(
      JSON.stringify({ motif: "", note: null, issue: "client" })
    );
    expect(resume).toBe("issue : client");
  });
});

describe("libelleAction", () => {
  it("traduit les actions connues", () => {
    expect(libelleAction("COMMISSION_RATE_SET")).toBe(
      "Taux de commission modifié"
    );
  });

  it("retombe sur le code brut pour une action inconnue", () => {
    // Mieux vaut un code technique affiche qu'une ligne vide : on comprend
    // quand meme qu'il s'est passe quelque chose.
    expect(libelleAction("ACTION_FUTURE")).toBe("ACTION_FUTURE");
  });

  it("couvre toutes les actions du vocabulaire", () => {
    // Ajouter une action sans son libelle produirait un code technique a
    // l'ecran : ce test force a faire les deux.
    for (const action of Object.values(ACTIONS_AUDIT)) {
      expect(libelleAction(action)).not.toBe(action);
    }
  });
});
