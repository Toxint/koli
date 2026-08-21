import { createHash, randomBytes } from "node:crypto";

/**
 * Connexion Google (OAuth 2.0 / OpenID Connect).
 *
 * Trois protections, toutes obligatoires ici :
 *
 *  - `state` : jeton aléatoire déposé en cookie avant la redirection et
 *    recomparé au retour. Sans lui, un tiers peut forger un lien de rappel et
 *    connecter la victime sur SON compte Google (CSRF de connexion).
 *  - PKCE : le code d'autorisation ne vaut rien sans le `code_verifier` qui
 *    n'a jamais quitté le serveur. Protège si le code fuite (journaux, en-tête
 *    Referer, historique).
 *  - `nonce` : lie le jeton d'identité à cette demande précise, ce qui
 *    interdit de rejouer un jeton obtenu ailleurs.
 */

const AUTORISATION = "https://accounts.google.com/o/oauth2/v2/auth";
const JETON = "https://oauth2.googleapis.com/token";
const EMETTEURS = ["https://accounts.google.com", "accounts.google.com"];

export const COOKIE_ETAT = "koli_oauth_etat";
export const COOKIE_VERIFIEUR = "koli_oauth_verifieur";
export const COOKIE_NONCE = "koli_oauth_nonce";
export const COOKIE_INSCRIPTION = "koli_google_inscription";

/**
 * La connexion Google n'est proposée que si elle est réellement configurée.
 * Afficher un bouton qui mène à une erreur serait pire que ne rien afficher.
 */
export function googleEstConfigure(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

function baseApplication(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_APP_URL doit être défini : c'est lui qui construit l'adresse de rappel Google."
    );
  }
  return base.replace(/\/+$/, "");
}

export function adresseDeRappel(): string {
  return `${baseApplication()}/api/auth/google/callback`;
}

function base64url(donnees: Buffer): string {
  return donnees
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function jetonAleatoire(): string {
  return base64url(randomBytes(32));
}

export function defiPkce(verifieur: string): string {
  return base64url(createHash("sha256").update(verifieur).digest());
}

export function urlAutorisation(options: {
  etat: string;
  verifieur: string;
  nonce: string;
}): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID as string,
    redirect_uri: adresseDeRappel(),
    response_type: "code",
    scope: "openid email profile",
    state: options.etat,
    nonce: options.nonce,
    code_challenge: defiPkce(options.verifieur),
    code_challenge_method: "S256",
    // `select_account` : sur un téléphone partagé — courant chez le public
    // visé — Google reconnecterait sinon silencieusement le compte précédent.
    prompt: "select_account",
  });

  return `${AUTORISATION}?${params.toString()}`;
}

export interface IdentiteGoogle {
  sub: string;
  email: string | null;
  emailVerifie: boolean;
  nom: string;
  photo: string | null;
}

interface ReponseJeton {
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface ChargeIdToken {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  given_name?: string;
  picture?: string;
}

function lireCharge(idToken: string): ChargeIdToken {
  const parties = idToken.split(".");
  if (parties.length !== 3) throw new Error("Jeton d'identité malformé.");
  return JSON.parse(
    Buffer.from(parties[1].replace(/-/g, "+").replace(/_/g, "/"), "base64")
      .toString("utf8")
  );
}

/**
 * Échange le code contre l'identité de l'utilisateur.
 *
 * La signature du jeton n'est pas revérifiée : il est obtenu *directement*
 * auprès du point de terminaison de Google, en TLS, authentifié par notre
 * secret client. OpenID Connect Core §3.1.3.7 dispense explicitement de la
 * vérification de signature dans ce cas de figure. Les claims qui restent à
 * contrôler — émetteur, destinataire, expiration, nonce — le sont ci-dessous ;
 * ce sont eux qui empêchent de rejouer un jeton émis pour une autre
 * application.
 */
export async function echangerCodeContreIdentite(
  code: string,
  verifieur: string,
  nonceAttendu: string
): Promise<IdentiteGoogle> {
  const reponse = await fetch(JETON, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      redirect_uri: adresseDeRappel(),
      grant_type: "authorization_code",
      code_verifier: verifieur,
    }),
  });

  const donnees = (await reponse.json()) as ReponseJeton;

  if (!reponse.ok || !donnees.id_token) {
    throw new Error(
      donnees.error_description || donnees.error || "Échange de jeton refusé."
    );
  }

  const charge = lireCharge(donnees.id_token);

  if (!charge.iss || !EMETTEURS.includes(charge.iss)) {
    throw new Error("Émetteur du jeton inattendu.");
  }
  if (charge.aud !== process.env.GOOGLE_CLIENT_ID) {
    throw new Error("Jeton émis pour une autre application.");
  }
  if (!charge.exp || charge.exp * 1000 <= Date.now()) {
    throw new Error("Jeton expiré.");
  }
  if (charge.nonce !== nonceAttendu) {
    throw new Error("Nonce invalide : la demande ne correspond pas.");
  }
  if (!charge.sub) {
    throw new Error("Identifiant Google absent du jeton.");
  }

  return {
    sub: charge.sub,
    email: charge.email ? charge.email.toLowerCase() : null,
    // Google renvoie tantôt un booléen, tantôt la chaîne "true".
    emailVerifie:
      charge.email_verified === true || charge.email_verified === "true",
    nom: charge.name || charge.given_name || "Utilisateur KOLI",
    photo: charge.picture ?? null,
  };
}
