import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

/**
 * Mot de passe oublie (§62).
 *
 * Ce qui est protege ici, ce sont les proprietes qui empechent ce formulaire de
 * devenir une porte d'entree :
 *  - la reponse ne dit JAMAIS si le compte existe ;
 *  - seul le hachage du jeton est stocke ;
 *  - le jeton expire, et ne sert qu'une fois ;
 *  - un compte suspendu ne peut pas etre repris par ce biais.
 */
const prismaMock = {
  user: { findFirst: vi.fn(), update: vi.fn() },
};

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/password", () => ({
  hashPassword: async (v: string) => `hache:${v}`,
}));

const {
  demanderReinitialisationAction,
  reinitialiserMotDePasseAction,
  jetonEstValideAction,
} = await import("@/lib/auth/reinitialisation");

const hacher = (j: string) => createHash("sha256").update(j).digest("hex");

function formulaire(champs: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
});

describe("demande de reinitialisation", () => {
  it("repond la meme chose pour un compte inconnu et pour un compte reel", async () => {
    // C'est le point essentiel : sinon ce formulaire dit qui est inscrit.
    prismaMock.user.findFirst.mockResolvedValue(null);
    const inconnu = await demanderReinitialisationAction(
      formulaire({ identifiant: "personne@exemple.ci" })
    );

    prismaMock.user.findFirst.mockResolvedValue({ id: "u1", status: "ACTIVE" });
    prismaMock.user.update.mockResolvedValue({});
    const connu = await demanderReinitialisationAction(
      formulaire({ identifiant: "vendeur@koli.ci" })
    );

    expect(inconnu.success).toBe(true);
    expect(connu.success).toBe(true);
    expect(inconnu.message).toBe(connu.message);
  });

  it("n'emet aucun jeton pour un compte inconnu", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    await demanderReinitialisationAction(
      formulaire({ identifiant: "personne@exemple.ci" })
    );
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("n'emet aucun jeton pour un compte suspendu", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "u1",
      status: "SUSPENDED",
    });
    const res = await demanderReinitialisationAction(
      formulaire({ identifiant: "vendeur@koli.ci" })
    );
    expect(res.success).toBe(true);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("stocke le HACHAGE du jeton, jamais le jeton", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "u1", status: "ACTIVE" });
    prismaMock.user.update.mockResolvedValue({});

    const res = await demanderReinitialisationAction(
      formulaire({ identifiant: "vendeur@koli.ci" })
    );

    const jeton = res.lienDeTest!.split("/").pop()!;
    const ecrit = prismaMock.user.update.mock.calls[0][0].data;

    expect(ecrit.resetTokenHash).toBe(hacher(jeton));
    // Une fuite de la base ne doit pas donner la main sur le compte.
    expect(ecrit.resetTokenHash).not.toBe(jeton);
    expect(ecrit.resetTokenExpiry.getTime()).toBeGreaterThan(Date.now());
  });

  it("tire un jeton different a chaque demande", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "u1", status: "ACTIVE" });
    prismaMock.user.update.mockResolvedValue({});

    const a = await demanderReinitialisationAction(
      formulaire({ identifiant: "vendeur@koli.ci" })
    );
    const b = await demanderReinitialisationAction(
      formulaire({ identifiant: "vendeur@koli.ci" })
    );

    expect(a.lienDeTest).not.toBe(b.lienDeTest);
  });

  it("refuse un identifiant trop court sans interroger la base", async () => {
    const res = await demanderReinitialisationAction(
      formulaire({ identifiant: "a" })
    );
    expect(res.success).toBe(false);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });
});

describe("reinitialisation effective", () => {
  const JETON = "a".repeat(64);

  it("refuse un jeton expire", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "u1",
      resetTokenHash: hacher(JETON),
      resetTokenExpiry: new Date(Date.now() - 1000),
      status: "ACTIVE",
    });

    const res = await reinitialiserMotDePasseAction(
      formulaire({ jeton: JETON, motDePasse: "MotDePasseSolide1" })
    );

    expect(res.success).toBe(false);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("refuse un jeton inconnu", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    const res = await reinitialiserMotDePasseAction(
      formulaire({ jeton: JETON, motDePasse: "MotDePasseSolide1" })
    );

    expect(res.success).toBe(false);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("refuse un mot de passe trop court", async () => {
    const res = await reinitialiserMotDePasseAction(
      formulaire({ jeton: JETON, motDePasse: "court" })
    );
    expect(res.success).toBe(false);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it("refuse un compte suspendu", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "u1",
      resetTokenHash: hacher(JETON),
      resetTokenExpiry: new Date(Date.now() + 60_000),
      status: "SUSPENDED",
    });

    const res = await reinitialiserMotDePasseAction(
      formulaire({ jeton: JETON, motDePasse: "MotDePasseSolide1" })
    );

    expect(res.success).toBe(false);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("change le mot de passe, consomme le jeton et deverrouille le compte", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "u1",
      resetTokenHash: hacher(JETON),
      resetTokenExpiry: new Date(Date.now() + 60_000),
      status: "ACTIVE",
    });
    prismaMock.user.update.mockResolvedValue({});

    const res = await reinitialiserMotDePasseAction(
      formulaire({ jeton: JETON, motDePasse: "MotDePasseSolide1" })
    );

    expect(res.success).toBe(true);
    const ecrit = prismaMock.user.update.mock.calls[0][0].data;
    expect(ecrit.passwordHash).toBe("hache:MotDePasseSolide1");
    // Usage unique.
    expect(ecrit.resetTokenHash).toBeNull();
    expect(ecrit.resetTokenExpiry).toBeNull();
    // Un compte verrouille par des tentatives ratees redevient accessible :
    // c'est souvent la raison meme de la reinitialisation.
    expect(ecrit.failedLoginAttempts).toBe(0);
    expect(ecrit.lockedUntil).toBeNull();
  });
});

describe("validite du jeton", () => {
  it("rejette un jeton vide ou trop court sans interroger la base", async () => {
    expect(await jetonEstValideAction("")).toBe(false);
    expect(await jetonEstValideAction("abc")).toBe(false);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it("rejette un jeton expire", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      resetTokenExpiry: new Date(Date.now() - 1),
    });
    expect(await jetonEstValideAction("z".repeat(64))).toBe(false);
  });

  it("accepte un jeton encore valide", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      resetTokenExpiry: new Date(Date.now() + 60_000),
    });
    expect(await jetonEstValideAction("z".repeat(64))).toBe(true);
  });
});
