import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Les courbes des tableaux de bord (vendeur et livreur).
 *
 * Trois choses se déferaient en silence, et aucune ne se verrait à l'écran —
 * une courbe fausse a exactement l'allure d'une courbe juste :
 *
 * 1. **Les jours vides.** S'ils disparaissaient de la série, l'axe du temps se
 *    resserrerait sans le dire : deux points voisins pourraient être séparés
 *    d'une semaine, et la pente entre eux serait un mensonge.
 *
 * 2. **La commission.** La courbe du vendeur est nette ; le même écran annonce
 *    un solde net juste au-dessus. Si la commission cessait d'être retranchée,
 *    la courbe culminerait au-dessus du solde, et c'est le vendeur qui
 *    découvrirait l'écart.
 *
 * 3. **Le cloisonnement.** Le livreur ne doit voir QUE ses frais de livraison
 *    (§25) : ni la marchandise qu'il transporte, ni les courses des autres.
 */

const prismaMock = {
  transaction: {
    findMany: vi.fn(),
  },
};

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

const { chargerCourbeVendeur, chargerCourbeLivreur } = await import(
  "@/lib/finance/courbes"
);
const { mettreEnForme } = await import("@/lib/finance/jours");

/** Un jeudi, à une heure qui ne risque pas de basculer de jour. */
const MAINTENANT = new Date(2026, 7, 27, 14, 30, 0);

/** Minuit, il y a `recul` jours — la même règle que le module éprouvé. */
function minuitMoins(recul: number): Date {
  const d = new Date(MAINTENANT);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - recul);
  return d;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("la série quotidienne du vendeur", () => {
  it("porte un point par jour, du plus ancien au plus récent, jours vides compris", async () => {
    // Une seule libération, avant-hier. Les treize autres journées n'ont rien.
    prismaMock.transaction.findMany.mockResolvedValue([
      { amount: 10_000, createdAt: minuitMoins(2), type: "FUNDS_RELEASED" },
    ]);

    const serie = await chargerCourbeVendeur("v1");

    expect(serie).toHaveLength(14);

    // Chronologique : chaque jour est postérieur au précédent.
    for (let i = 1; i < serie.length; i++) {
      expect(serie[i].jour.getTime()).toBeGreaterThan(serie[i - 1].jour.getTime());
    }

    // Le dernier point est AUJOURD'HUI : une courbe qui s'arrête hier laisse
    // croire à un service en panne le jour où on la regarde.
    expect(serie[13].jour.getTime()).toBe(minuitMoins(0).getTime());

    // Le jour porteur, et lui seul.
    expect(serie[11].montant).toBe(10_000);
    expect(serie.filter((p) => p.montant !== 0)).toHaveLength(1);
  });

  it("retranche la commission du jour", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([
      { amount: 10_000, createdAt: minuitMoins(1), type: "FUNDS_RELEASED" },
      { amount: -500, createdAt: minuitMoins(1), type: "COMMISSION" },
    ]);

    const serie = await chargerCourbeVendeur("v1");

    expect(serie[12].montant).toBe(9_500);
  });

  it("la retranche même si l'écriture est enregistrée en positif", async () => {
    // `preleverCommission` écrit un montant négatif. Ce contrôle porte sur une
    // donnée ancienne, écrite avant cette convention : sans la protection,
    // la commission s'AJOUTERAIT — 10 500 au lieu de 9 500 — et la courbe
    // dépasserait le solde affiché sur le même écran.
    prismaMock.transaction.findMany.mockResolvedValue([
      { amount: 10_000, createdAt: minuitMoins(1), type: "FUNDS_RELEASED" },
      { amount: 500, createdAt: minuitMoins(1), type: "COMMISSION" },
    ]);

    const serie = await chargerCourbeVendeur("v1");

    expect(serie[12].montant).toBe(9_500);
  });

  it("ne descend jamais sous zéro", async () => {
    // Une commission sans sa libération — un remboursement partiel, une reprise
    // manuelle. La ligne passerait SOUS sa propre base, hors du cadre.
    prismaMock.transaction.findMany.mockResolvedValue([
      { amount: -500, createdAt: minuitMoins(3), type: "COMMISSION" },
    ]);

    const serie = await chargerCourbeVendeur("v1");

    expect(serie.every((p) => p.montant >= 0)).toBe(true);
  });

  it("ne lit que les écritures de CE vendeur", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([]);

    await chargerCourbeVendeur("vendeur-attendu");

    const { where } = prismaMock.transaction.findMany.mock.calls[0][0];
    expect(where.order).toEqual({ sellerId: "vendeur-attendu" });
  });
});

describe("la série quotidienne du livreur", () => {
  it("ne lit que SES frais de livraison, jamais la marchandise (§25)", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([]);

    await chargerCourbeLivreur("livreur-attendu");

    const { where } = prismaMock.transaction.findMany.mock.calls[0][0];

    // Le seul type qui le concerne. `FUNDS_RELEASED` lui apprendrait la valeur
    // des colis qu'il transporte.
    expect(where.type).toBe("DRIVER_PAYOUT");
    expect(where.order).toEqual({ delivery: { driverId: "livreur-attendu" } });
  });

  it("additionne les courses d'une même journée", async () => {
    prismaMock.transaction.findMany.mockResolvedValue([
      { amount: 1_000, createdAt: minuitMoins(0), type: "DRIVER_PAYOUT" },
      { amount: 1_500, createdAt: minuitMoins(0), type: "DRIVER_PAYOUT" },
    ]);

    const serie = await chargerCourbeLivreur("l1");

    expect(serie[13].montant).toBe(2_500);
  });
});

describe("la mise en forme des jours", () => {
  it("nomme chaque jour côté serveur, court et long", () => {
    const [point] = mettreEnForme([
      { jour: new Date(2026, 7, 27), montant: 4_200 },
    ]);

    // Mise en forme ici, et non dans le composant : une date rendue par le
    // serveur puis reformatée par le navigateur produit deux textes pour la
    // même donnée, et React signale un désaccord d'hydratation.
    expect(point.valeur).toBe(4_200);
    expect(point.etiquette).toMatch(/27/);
    expect(point.etiquetteLongue).toMatch(/27/);

    // La forme longue est celle de l'infobulle et du tableau : elle porte le
    // mois, sans quoi « jeu. 27 » seul ne situe rien sur quatorze jours.
    expect(point.etiquetteLongue).toMatch(/août/i);
    expect(point.etiquetteLongue.length).toBeGreaterThan(point.etiquette.length);
  });
});
