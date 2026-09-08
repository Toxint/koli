import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifierSignatureResend,
  TOLERANCE_HORAIRE_S,
} from "@/lib/notifications/signature-resend";

/**
 * La porte des rappels Resend.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Un rappel accepté sans preuve d'origine permettrait à quiconque de      │
 * │  FERMER l'adresse courriel de n'importe quel compte : il suffirait de    │
 * │  poster un faux rebond.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * C'est une porte de désabonnement forcé pour toute la plateforme — un vendeur
 * qu'on empêche d'apprendre ses ventes. D'où ces contrôles, et d'où le fait
 * qu'ils éprouvent les REFUS bien plus que les acceptations.
 */

const SECRET = "whsec_" + Buffer.from("un secret de rappel, en clair").toString("base64");
const CORPS = JSON.stringify({ type: "email.bounced", data: { email_id: "abc" } });

/** Fabrique les en-têtes qu'enverrait Svix pour ce corps. */
function signer(corps: string, secondes: number, secret = SECRET, id = "msg_1") {
  const clef = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", clef)
    .update(`${id}.${secondes}.${corps}`)
    .digest("base64");
  return { id, horodatage: String(secondes), signature: `v1,${signature}` };
}

const MAINTENANT = 1_800_000_000_000; // un instant fixe : les tests ne dépendent pas de l'heure
const SECONDES = Math.floor(MAINTENANT / 1000);

describe("un rappel authentique", () => {
  it("est accepté", () => {
    const r = verifierSignatureResend(CORPS, signer(CORPS, SECONDES), SECRET, MAINTENANT);
    expect(r.valide).toBe(true);
  });

  /**
   * Svix envoie l'ancienne ET la nouvelle signature pendant qu'il fait tourner
   * ses clefs. N'en lire qu'une ferait échouer TOUS les rappels le jour où ils
   * changent de clef — une panne totale, à une date qu'on ne choisit pas.
   */
  it("est accepté même quand plusieurs signatures accompagnent le message", () => {
    const bonne = signer(CORPS, SECONDES);
    const entetes = {
      ...bonne,
      signature: `v1,dGVsbGVtZW50RmF1eA== ${bonne.signature}`,
    };
    expect(verifierSignatureResend(CORPS, entetes, SECRET, MAINTENANT).valide).toBe(true);
  });
});

describe("ce qui doit être refusé", () => {
  const refus = (r: ReturnType<typeof verifierSignatureResend>) =>
    r.valide ? "ACCEPTE" : r.motif;

  it("un corps MODIFIÉ après signature", () => {
    const entetes = signer(CORPS, SECONDES);
    const falsifie = JSON.stringify({
      type: "email.bounced",
      data: { email_id: "un-autre" },
    });
    expect(refus(verifierSignatureResend(falsifie, entetes, SECRET, MAINTENANT))).toBe(
      "aucune signature ne correspond"
    );
  });

  it("une signature forgée", () => {
    const entetes = { ...signer(CORPS, SECONDES), signature: "v1,bGFsYWxh" };
    expect(refus(verifierSignatureResend(CORPS, entetes, SECRET, MAINTENANT))).toBe(
      "aucune signature ne correspond"
    );
  });

  it("un autre secret", () => {
    const autre = "whsec_" + Buffer.from("pas le bon secret").toString("base64");
    const entetes = signer(CORPS, SECONDES, autre);
    expect(refus(verifierSignatureResend(CORPS, entetes, SECRET, MAINTENANT))).toBe(
      "aucune signature ne correspond"
    );
  });

  /**
   * LE contrôle du rejeu.
   *
   * Une signature reste valable éternellement : sans cette borne, un rappel
   * capté une fois pourrait être rejoué des mois plus tard, avec sa signature
   * authentique. C'est la seule chose qui distingue « ce message vient d'eux »
   * de « ce message vient d'eux, MAINTENANT ».
   */
  it("un rappel REJOUÉ plus tard, avec sa vraie signature", () => {
    const vieux = SECONDES - TOLERANCE_HORAIRE_S - 60;
    const entetes = signer(CORPS, vieux);
    const r = verifierSignatureResend(CORPS, entetes, SECRET, MAINTENANT);
    expect(r.valide).toBe(false);
    expect(refus(r)).toMatch(/hors fenetre/);
  });

  it("un rappel daté du futur lointain, symétriquement", () => {
    const entetes = signer(CORPS, SECONDES + TOLERANCE_HORAIRE_S + 60);
    expect(refus(verifierSignatureResend(CORPS, entetes, SECRET, MAINTENANT))).toMatch(
      /hors fenetre/
    );
  });

  it("juste dans la fenêtre : accepté", () => {
    const entetes = signer(CORPS, SECONDES - TOLERANCE_HORAIRE_S + 5);
    expect(verifierSignatureResend(CORPS, entetes, SECRET, MAINTENANT).valide).toBe(true);
  });

  it("des en-têtes incomplets", () => {
    const bonne = signer(CORPS, SECONDES);
    expect(
      refus(verifierSignatureResend(CORPS, { ...bonne, id: null }, SECRET, MAINTENANT))
    ).toBe("en-tetes svix incomplets");
    expect(
      refus(
        verifierSignatureResend(CORPS, { ...bonne, signature: null }, SECRET, MAINTENANT)
      )
    ).toBe("en-tetes svix incomplets");
  });

  it("un horodatage illisible", () => {
    const entetes = { ...signer(CORPS, SECONDES), horodatage: "hier" };
    expect(refus(verifierSignatureResend(CORPS, entetes, SECRET, MAINTENANT))).toBe(
      "horodatage illisible"
    );
  });

  /**
   * Sans secret configuré, on REFUSE — on ne fait pas confiance « en
   * attendant ». Accepter un corps non vérifié laisserait n'importe qui fermer
   * l'adresse d'un compte.
   */
  it("aucun secret configuré", () => {
    expect(refus(verifierSignatureResend(CORPS, signer(CORPS, SECONDES), "", MAINTENANT))).toBe(
      "aucun secret configure"
    );
  });

  /**
   * Une signature d'un autre schéma — `v2` un jour, ou un préfixe inconnu — ne
   * doit pas être crue sur parole parce qu'elle « ressemble » à une signature.
   */
  it("une version de signature inconnue", () => {
    const bonne = signer(CORPS, SECONDES);
    const entetes = { ...bonne, signature: bonne.signature.replace("v1,", "v9,") };
    expect(refus(verifierSignatureResend(CORPS, entetes, SECRET, MAINTENANT))).toBe(
      "aucune signature ne correspond"
    );
  });
});
