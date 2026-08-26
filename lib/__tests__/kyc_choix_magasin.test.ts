import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * Quel magasin de pièces KYC est choisi, et surtout : quand refuse-t-on ?
 *
 * Ce test protège la garantie la plus importante du module. Sur un hébergement
 * sans serveur, le disque est éphémère : une pièce d'identité déposée
 * disparaîtrait au déploiement suivant, sans erreur et sans trace. Le défaut ne
 * se découvrirait qu'au moment d'examiner un dossier — c'est-à-dire trop tard,
 * et pour le vendeur qui attend sa vérification.
 *
 * Un repli silencieux sur le disque local est donc INTERDIT en production. Le
 * refus doit être net, au premier dépôt, avec ce qu'il faut faire.
 */

const ENV = { ...process.env };

/** Le module retient son magasin au premier usage : on le recharge à chaque cas. */
async function chargerStockage() {
  vi.resetModules();
  return import("../kyc/stockage");
}

beforeEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.KYC_STORAGE_DIR;
  delete process.env.KYC_BUCKET;
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("le choix du magasin KYC", () => {
  it("prend Supabase Storage dès que le projet et la clef sont là", async () => {
    process.env.SUPABASE_URL = "https://exemple.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clef-de-service";

    const { nomDuMagasin } = await chargerStockage();
    expect(nomDuMagasin()).toContain("Supabase Storage");
    expect(nomDuMagasin()).toContain("kyc");
  });

  it("respecte le seau demandé", async () => {
    process.env.SUPABASE_URL = "https://exemple.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clef-de-service";
    process.env.KYC_BUCKET = "pieces-justificatives";

    const { nomDuMagasin } = await chargerStockage();
    expect(nomDuMagasin()).toContain("pieces-justificatives");
  });

  it("prend le disque quand un emplacement est DÉLIBÉRÉMENT indiqué", async () => {
    process.env.KYC_STORAGE_DIR = "/var/koli/kyc";

    const { nomDuMagasin } = await chargerStockage();
    expect(nomDuMagasin()).toContain("disque");
    expect(nomDuMagasin()).toContain("/var/koli/kyc");
  });

  it("fait primer le disque explicite sur Supabase", async () => {
    // Le cas réel du poste de développement : `.env` porte les identifiants
    // Supabase — `supabase:stockage` en a besoin — et le serveur local lit
    // `.env` en plus de `.env.local`. Sans cette priorité, développer
    // écrirait dans le vrai seau.
    process.env.SUPABASE_URL = "https://exemple.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "clef-de-service";
    process.env.KYC_STORAGE_DIR = ".donnees/kyc";

    const { nomDuMagasin } = await chargerStockage();
    expect(nomDuMagasin()).toContain("disque");
  });

  it("REFUSE de se rabattre sur le disque local en production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { rangerFichier } = await chargerStockage();
    await expect(
      rangerFichier(new Uint8Array([0xff, 0xd8, 0xff]), {
        mime: "image/jpeg",
        extension: "jpg",
      })
    ).rejects.toThrow(/stockage durable/i);

    vi.unstubAllEnvs();
  });

  it("dit quoi faire quand il refuse", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { lireFichier } = await chargerStockage();
    await expect(lireFichier("2026-01/x.jpg")).rejects.toThrow(
      /SUPABASE_SERVICE_ROLE_KEY|KYC_STORAGE_DIR/
    );

    vi.unstubAllEnvs();
  });

  it("se rabat sur le disque local hors production, sans rien exiger", async () => {
    const { nomDuMagasin } = await chargerStockage();
    expect(nomDuMagasin()).toContain("disque");
    expect(nomDuMagasin()).toContain("kyc");
  });
});

describe("la forme des chemins", () => {
  it("n'accepte que ce que le magasin a lui-même produit", async () => {
    const { cheminValide, nouveauChemin } = await import("../kyc/magasin");

    expect(cheminValide(nouveauChemin("jpg"))).toBe(true);

    for (const refuse of [
      "../../package.json",
      "2026-01/../../etc/passwd",
      "2026-01/piece.jpg",
      "/etc/passwd",
      "2026-1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg",
      "",
    ]) {
      expect(cheminValide(refuse), refuse).toBe(false);
    }
  });
});
