import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";

/**
 * Connexion Google.
 *
 * Ce qui est protégé ici, ce sont les CONTRÔLES qui empêchent d'entrer sans y
 * avoir droit : validation du jeton d'identité (émetteur, destinataire,
 * expiration, nonce) et refus des raccourcis à l'inscription. Ce sont eux qui,
 * s'ils sautent, ouvrent un compte à quelqu'un d'autre.
 */

const prismaMock = {
  user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
};

vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const cookiesMock = { get: vi.fn(), set: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookiesMock }));

const createSessionCookieMock = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  createSessionCookie: createSessionCookieMock,
  cookieSecurise: () => false,
}));

const verifierJetonCourtMock = vi.fn();
vi.mock("@/lib/auth/jetonCourt", () => ({
  verifierJetonCourt: verifierJetonCourtMock,
  signerJetonCourt: vi.fn(),
}));

const {
  googleEstConfigure,
  defiPkce,
  jetonAleatoire,
  urlAutorisation,
  echangerCodeContreIdentite,
} = await import("@/lib/auth/google");
const { terminerInscriptionGoogleAction } = await import(
  "@/lib/auth/googleInscription"
);

const CLIENT_ID = "1234.apps.googleusercontent.com";

function base64url(valeur: object): string {
  return Buffer.from(JSON.stringify(valeur))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Fabrique un id_token : signature factice, seuls les claims sont vérifiés. */
function idToken(claims: Record<string, unknown>): string {
  return `entete.${base64url(claims)}.signature`;
}

const CLAIMS_VALIDES = {
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  sub: "google-sub-42",
  exp: Math.floor(Date.now() / 1000) + 600,
  nonce: "le-nonce",
  email: "Awa@Exemple.CI",
  email_verified: true,
  name: "Awa Koné",
  picture: "https://exemple/photo.jpg",
};

function reponseJeton(claims: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => ({ id_token: idToken(claims) }),
  } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = "secret";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("configuration", () => {
  it("se déclare non configurée sans identifiants", () => {
    delete process.env.GOOGLE_CLIENT_ID;
    expect(googleEstConfigure()).toBe(false);
  });

  it("se déclare configurée quand les deux valeurs sont présentes", () => {
    expect(googleEstConfigure()).toBe(true);
  });
});

describe("PKCE et URL d'autorisation", () => {
  it("calcule le défi S256 conformément à la RFC 7636", () => {
    const verifieur = "un-verifieur-de-test";
    const attendu = createHash("sha256")
      .update(verifieur)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(defiPkce(verifieur)).toBe(attendu);
  });

  it("produit des jetons aléatoires distincts et non triviaux", () => {
    const a = jetonAleatoire();
    const b = jetonAleatoire();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it("transporte state, nonce et défi PKCE, sans jamais le vérifieur", () => {
    const url = new URL(
      urlAutorisation({ etat: "E", verifieur: "V", nonce: "N" })
    );

    expect(url.searchParams.get("state")).toBe("E");
    expect(url.searchParams.get("nonce")).toBe("N");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(defiPkce("V"));
    // Le vérifieur ne doit jamais quitter le serveur : c'est tout l'intérêt.
    expect(url.toString()).not.toContain("code_verifier");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/google/callback"
    );
  });
});

describe("validation du jeton d'identité", () => {
  const echanger = () =>
    echangerCodeContreIdentite("code", "verifieur", "le-nonce");

  it("accepte un jeton conforme et normalise l'e-mail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reponseJeton(CLAIMS_VALIDES)));

    const identite = await echanger();

    expect(identite.sub).toBe("google-sub-42");
    expect(identite.email).toBe("awa@exemple.ci");
    expect(identite.emailVerifie).toBe(true);
  });

  it("refuse un jeton émis pour une autre application", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reponseJeton({ ...CLAIMS_VALIDES, aud: "autre-application" })
      )
    );
    await expect(echanger()).rejects.toThrow(/autre application/i);
  });

  it("refuse un émetteur inattendu", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reponseJeton({ ...CLAIMS_VALIDES, iss: "https://evil.example" })
      )
    );
    await expect(echanger()).rejects.toThrow(/Émetteur/i);
  });

  it("refuse un jeton expiré", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reponseJeton({
          ...CLAIMS_VALIDES,
          exp: Math.floor(Date.now() / 1000) - 10,
        })
      )
    );
    await expect(echanger()).rejects.toThrow(/expiré/i);
  });

  it("refuse un nonce qui ne correspond pas à la demande", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reponseJeton({ ...CLAIMS_VALIDES, nonce: "nonce-rejoue" })
      )
    );
    await expect(echanger()).rejects.toThrow(/Nonce/i);
  });

  it("traite email_verified renvoyé sous forme de chaîne", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reponseJeton({ ...CLAIMS_VALIDES, email_verified: "true" })
      )
    );
    expect((await echanger()).emailVerifie).toBe(true);
  });

  it("ne déclare pas vérifié un e-mail que Google ne confirme pas", async () => {
    // Ce booléen conditionne le rattachement à un compte existant : s'y
    // tromper reviendrait à donner la boutique d'un vendeur au premier venu.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reponseJeton({ ...CLAIMS_VALIDES, email_verified: false })
      )
    );
    expect((await echanger()).emailVerifie).toBe(false);
  });
});

describe("terminerInscriptionGoogleAction", () => {
  const formulaire = (champs: Record<string, string> = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({
      phone: "+2250700001122",
      role: "CLIENT",
      ...champs,
    })) {
      fd.append(k, v);
    }
    return fd;
  };

  const IDENTITE = {
    sub: "google-sub-42",
    email: "awa@exemple.ci",
    nom: "Awa Koné",
    photo: null,
  };

  it("refuse sans identité Google en attente", async () => {
    cookiesMock.get.mockReturnValue(undefined);

    const res = await terminerInscriptionGoogleAction(formulaire());

    expect(res.success).toBe(false);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("refuse un cookie d'inscription forgé ou altéré", async () => {
    cookiesMock.get.mockReturnValue({ value: "jeton-bidon" });
    verifierJetonCourtMock.mockResolvedValue(null);

    const res = await terminerInscriptionGoogleAction(formulaire());

    expect(res.success).toBe(false);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("refuse un téléphone déjà pris par un autre compte", async () => {
    cookiesMock.get.mockReturnValue({ value: "jeton" });
    verifierJetonCourtMock.mockResolvedValue(IDENTITE);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue({ phone: "+2250700001122" });

    const res = await terminerInscriptionGoogleAction(formulaire());

    expect(res.success).toBe(false);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("refuse de rejouer l'étape si le compte Google est déjà rattaché", async () => {
    cookiesMock.get.mockReturnValue({ value: "jeton" });
    verifierJetonCourtMock.mockResolvedValue(IDENTITE);
    prismaMock.user.findUnique.mockResolvedValue({ id: "u-existant" });

    const res = await terminerInscriptionGoogleAction(formulaire());

    expect(res.success).toBe(false);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("crée un compte sans mot de passe et ouvre la session", async () => {
    cookiesMock.get.mockReturnValue({ value: "jeton" });
    verifierJetonCourtMock.mockResolvedValue(IDENTITE);
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: "u1",
      role: "CLIENT",
      name: "Awa Koné",
      phone: "+2250700001122",
      customerProfile: { id: "c1" },
    });

    const res = await terminerInscriptionGoogleAction(formulaire());

    expect(res.success).toBe(true);
    expect(res.redirectTo).toBe("/client/dashboard");

    const data = prismaMock.user.create.mock.calls[0][0].data;
    expect(data.passwordHash).toBeNull();
    expect(data.googleId).toBe("google-sub-42");
    expect(createSessionCookieMock).toHaveBeenCalledOnce();
  });

  it("refuse un rôle hors liste, ADMIN compris", async () => {
    cookiesMock.get.mockReturnValue({ value: "jeton" });
    verifierJetonCourtMock.mockResolvedValue(IDENTITE);

    const res = await terminerInscriptionGoogleAction(
      formulaire({ role: "ADMIN" })
    );

    expect(res.success).toBe(false);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });
});
