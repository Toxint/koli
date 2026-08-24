import { describe, it, expect, afterAll } from "vitest";
import { rm, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

/**
 * Magasin de pièces justificatives (§37, §47).
 *
 * Ce fichier manipule des documents d'identité. Ce qui est éprouvé ici, c'est
 * exactement ce qui, mal fait, transforme un dépôt de pièces en faille :
 * accepter un fichier d'après ce que le client annonce, et laisser un chemin
 * fourni de l'extérieur désigner n'importe quoi sur le disque.
 */

const RACINE = path.join(os.tmpdir(), `koli-kyc-test-${process.pid}`);
process.env.KYC_STORAGE_DIR = RACINE;

const { reconnaitreType, rangerFichier, lireFichier, supprimerFichier } =
  await import("@/lib/kyc/stockage");

afterAll(async () => {
  await rm(RACINE, { recursive: true, force: true });
});

const octets = (...valeurs: number[]) => new Uint8Array(valeurs);

describe("reconnaitreType", () => {
  it("reconnait un JPEG a sa signature", () => {
    expect(reconnaitreType(octets(0xff, 0xd8, 0xff, 0xe0, 0x00))).toEqual({
      mime: "image/jpeg",
      extension: "jpg",
    });
  });

  it("reconnait un PNG", () => {
    expect(
      reconnaitreType(octets(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))
    ).toEqual({ mime: "image/png", extension: "png" });
  });

  it("reconnait un PDF", () => {
    expect(reconnaitreType(octets(0x25, 0x50, 0x44, 0x46, 0x2d))).toEqual({
      mime: "application/pdf",
      extension: "pdf",
    });
  });

  it("reconnait un WebP, dont la signature n'est pas contigue", () => {
    const donnees = new Uint8Array(16);
    donnees.set([...Buffer.from("RIFF")], 0);
    donnees.set([...Buffer.from("WEBP")], 8);
    expect(reconnaitreType(donnees)).toEqual({
      mime: "image/webp",
      extension: "webp",
    });
  });

  it("REFUSE du HTML, meme deguise en image", () => {
    // Le coeur du controle. Un fichier HTML accepte comme image, puis restitue
    // comme telle, s'executerait dans NOTRE domaine — donc avec acces aux
    // cookies de session. Le type annonce par le navigateur ne vaut rien.
    const html = new Uint8Array([...Buffer.from("<html><script>alert(1)")]);
    expect(reconnaitreType(html)).toBeNull();
  });

  it("REFUSE un SVG : c'est du XML, il peut porter du script", () => {
    const svg = new Uint8Array([...Buffer.from('<svg xmlns="http://')]);
    expect(reconnaitreType(svg)).toBeNull();
  });

  it("refuse un fichier vide ou trop court sans se plaindre", () => {
    expect(reconnaitreType(new Uint8Array(0))).toBeNull();
    expect(reconnaitreType(octets(0xff))).toBeNull();
  });
});

describe("rangerFichier", () => {
  it("ecrit sous un nom TIRE AU SORT, jamais celui fourni", async () => {
    const donnees = octets(0xff, 0xd8, 0xff, 1, 2, 3);
    const a = await rangerFichier(donnees, { mime: "image/jpeg", extension: "jpg" });
    const b = await rangerFichier(donnees, { mime: "image/jpeg", extension: "jpg" });

    expect(a.chemin).not.toBe(b.chemin);
    // Un nom venu du client peut contenir « ../ », un caractere interdit, ou
    // simplement le nom de son proprietaire.
    expect(path.basename(a.chemin)).toMatch(/^[0-9a-f]{48}\.jpg$/);
  });

  it("range hors de public/ : rien n'est servi directement", async () => {
    const r = await rangerFichier(octets(0xff, 0xd8, 0xff), {
      mime: "image/jpeg",
      extension: "jpg",
    });
    expect(r.chemin).not.toContain("public");
    expect(path.resolve(RACINE, r.chemin).startsWith(path.resolve(RACINE))).toBe(
      true
    );
  });

  it("classe par annee-mois : un dossier unique deviendrait ingerable", async () => {
    await rangerFichier(octets(0xff, 0xd8, 0xff), {
      mime: "image/jpeg",
      extension: "jpg",
    });
    const dossiers = await readdir(RACINE);
    expect(dossiers.some((d) => /^\d{4}-\d{2}$/.test(d))).toBe(true);
  });

  it("rend la taille exacte", async () => {
    const donnees = octets(0xff, 0xd8, 0xff, 1, 2, 3, 4);
    const r = await rangerFichier(donnees, { mime: "image/jpeg", extension: "jpg" });
    expect(r.taille).toBe(7);
  });
});

describe("lireFichier", () => {
  it("relit exactement ce qui a ete ecrit", async () => {
    const donnees = octets(0xff, 0xd8, 0xff, 9, 8, 7);
    const r = await rangerFichier(donnees, { mime: "image/jpeg", extension: "jpg" });
    expect([...(await lireFichier(r.chemin))!]).toEqual([...donnees]);
  });

  it("REFUSE de sortir du magasin", async () => {
    // Meme si la valeur vient de notre propre base : une reprise de donnees,
    // une migration batclee, et un chemin remontant permettrait de lire
    // n'importe quel fichier du serveur — dont le fichier d'environnement.
    for (const chemin of [
      "../../.env",
      "..\\..\\.env",
      "../../../etc/passwd",
      "2026-01/../../../secret",
    ]) {
      expect(await lireFichier(chemin), chemin).toBeNull();
    }
  });

  it("rend null sur un fichier absent, sans lever", async () => {
    expect(await lireFichier("2026-01/inexistant.jpg")).toBeNull();
  });
});

describe("supprimerFichier", () => {
  it("supprime ce qu'il doit", async () => {
    const r = await rangerFichier(octets(0xff, 0xd8, 0xff), {
      mime: "image/jpeg",
      extension: "jpg",
    });
    await supprimerFichier(r.chemin);
    expect(await lireFichier(r.chemin)).toBeNull();
  });

  it("ne supprime RIEN hors du magasin", async () => {
    // Sans le controle, cette fonction deviendrait une primitive d'effacement
    // de fichiers arbitraires.
    await expect(supprimerFichier("../../package.json")).resolves.toBeUndefined();
    const fs = await import("node:fs/promises");
    await expect(fs.access("package.json")).resolves.toBeUndefined();
  });
});
