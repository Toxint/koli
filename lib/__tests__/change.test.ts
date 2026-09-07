import { describe, it, expect, vi, afterEach } from "vitest";
import { convertir, equivalentPourLAcheteur } from "@/lib/finance/change";

/**
 * La conversion vue par l'acheteur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Un vendeur ivoirien affiche 2 000 FCFA ; un acheteur de Kinshasa doit   │
 * │  lire ce que cela vaut chez lui. C'est la demande d'origine, et c'est    │
 * │  aussi l'endroit du produit où un chiffre faux coûte le plus cher.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce module n'avait aucun contrôle. Il dépend d'une API tierce, il fait de
 * l'arithmétique sur de l'argent, et il s'affiche sur l'écran de paiement —
 * les trois raisons d'en écrire.
 *
 * Tout est éprouvé SANS RÉSEAU : `fetch` est remplacé. Un test qui interroge
 * vraiment `open.er-api.com` échouerait un jour parce qu'ils sont en panne,
 * et on chercherait le défaut chez nous.
 */

const reponse = (corps: unknown, ok = true) =>
  ({ ok, json: async () => corps }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("les parités FIXES, connues sans réseau", () => {
  /**
   * XOF et XAF sont arrimés à l'euro au même taux : un franc CFA de l'Ouest
   * vaut exactement un franc CFA d'Afrique centrale. Ce n'est pas une
   * approximation qu'on rafraîchit, c'est une décision monétaire.
   *
   * Le contrôle qui compte n'est pas le résultat — c'est que **`fetch` n'est
   * jamais appelé**. Aller demander à une API que 1 = 1, ce serait payer un
   * aller-retour réseau, sur un écran de paiement vu sur réseau lent (§70), et
   * s'ouvrir une panne là où il n'y en avait aucune.
   */
  it("XOF vers XAF ne touche PAS le réseau", async () => {
    const appel = vi.fn();
    vi.stubGlobal("fetch", appel);

    const c = await convertir(2000, "XOF", "XAF");

    expect(appel).not.toHaveBeenCalled();
    expect(c).toEqual({ montant: 2000, taux: 1, de: "XOF", vers: "XAF", exact: true });
  });

  it("une devise vers elle-même vaut 1, sans réseau non plus", async () => {
    const appel = vi.fn();
    vi.stubGlobal("fetch", appel);

    expect(await convertir(2000, "CDF", "CDF")).toMatchObject({ montant: 2000, exact: true });
    expect(appel).not.toHaveBeenCalled();
  });
});

describe("la conversion par le réseau", () => {
  it("convertit et ARRONDIT — un montant d'argent n'a pas de décimale ici", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reponse({ result: "success", rates: { CDF: 4.0506 } }))
    );

    const c = await convertir(2000, "XOF", "CDF");

    // 2000 × 4,0506 = 8101,2
    expect(c).toMatchObject({ montant: 8101, taux: 4.0506, exact: false });
  });

  /**
   * `exact: false` n'est pas un détail d'implémentation : c'est lui qui décide
   * si l'écran affiche « ≈ ». Leur taux n'est pas le nôtre — 2 % d'écart
   * mesuré le 6 septembre 2026 — et annoncer notre chiffre comme définitif
   * ferait mentir l'écran d'un acheteur sur deux.
   */
  it("un taux du réseau n'est JAMAIS annoncé comme exact", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reponse({ result: "success", rates: { CDF: 4.05 } }))
    );

    expect((await convertir(1000, "XOF", "CDF"))?.exact).toBe(false);
  });
});

describe("quand le taux manque, on n'invente pas", () => {
  /**
   * Chaque cas rend `null`, et l'écran n'affiche alors RIEN de plus : pas de
   * taux périmé, pas de « — ». Un montant absent se remarque ; un montant faux
   * se croit.
   */
  it("réponse HTTP en échec", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse({}, false)));
    expect(await convertir(2000, "XOF", "CDF")).toBeNull();
  });

  it("le fournisseur dit lui-même que ça n'a pas marché", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse({ result: "error" })));
    expect(await convertir(2000, "XOF", "CDF")).toBeNull();
  });

  it("la devise demandée n'est pas dans la table", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reponse({ result: "success", rates: { GHS: 0.12 } }))
    );
    expect(await convertir(2000, "XOF", "CDF")).toBeNull();
  });

  /**
   * LE cas qui justifie `> 0` plutôt que `!= null`.
   *
   * Un taux à zéro passerait toutes les vérifications d'existence et rendrait
   * un montant nul — c'est-à-dire « 0 FC » affiché sur un écran de paiement,
   * qui se lit « gratuit ».
   */
  it("un taux à ZÉRO est refusé, pas multiplié", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reponse({ result: "success", rates: { CDF: 0 } }))
    );
    expect(await convertir(2000, "XOF", "CDF")).toBeNull();
  });

  it("un taux négatif aussi", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reponse({ result: "success", rates: { CDF: -4 } }))
    );
    expect(await convertir(2000, "XOF", "CDF")).toBeNull();
  });

  /**
   * Réseau coupé, délai dépassé, réponse illisible. La page de paiement reste
   * juste, simplement moins bavarde — elle ne doit jamais tomber parce qu'une
   * API tierce ne répond pas.
   */
  it("le réseau tombe : on ne convertit pas, on ne lève pas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      })
    );
    await expect(convertir(2000, "XOF", "CDF")).resolves.toBeNull();
  });
});

describe("la phrase affichée sous le prix", () => {
  /**
   * Répéter « 2 000 FCFA ≈ 2 000 FCFA » n'aide personne, et donne à l'écran
   * l'air de calculer quelque chose alors qu'il ne fait rien.
   */
  it("ne dit rien quand les deux parties comptent dans la même monnaie", async () => {
    const appel = vi.fn();
    vi.stubGlobal("fetch", appel);

    expect(await equivalentPourLAcheteur(2000, "XOF", "XOF")).toBeNull();
    expect(appel).not.toHaveBeenCalled();
  });

  it("porte le « ≈ » quand le taux vient du réseau", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reponse({ result: "success", rates: { CDF: 4.05 } }))
    );

    const e = await equivalentPourLAcheteur(2000, "XOF", "CDF");

    expect(e?.exact).toBe(false);
    expect(e?.texte.startsWith("≈")).toBe(true);
    expect(e?.texte).toContain("FC");
  });

  /**
   * Entre francs CFA le montant est EXACT, et un « environ » y serait une
   * fausse modestie : elle ferait douter d'un chiffre qui ne le mérite pas.
   */
  it("pas de « ≈ » entre deux francs CFA", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const e = await equivalentPourLAcheteur(2000, "XOF", "XAF");

    expect(e?.exact).toBe(true);
    expect(e?.texte).not.toContain("≈");
  });

  it("ne dit rien plutôt que d'afficher un chiffre faux", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponse({}, false)));
    expect(await equivalentPourLAcheteur(2000, "XOF", "CDF")).toBeNull();
  });
});
