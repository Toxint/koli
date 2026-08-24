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

/**
 * Points de terminaison OpenID.
 *
 * Surchargeables UNIQUEMENT hors production, pour brancher un fournisseur
 * local lors du test de bout en bout (`scripts/faux-google.mjs`). Sans cela,
 * la chaîne complète — départ, PKCE, retour, échange du code, création du
 * compte — ne pourrait jamais être exercée sans identifiants Google réels.
 *
 * En production, la garde `NODE_ENV` rend ces variables inertes : l'application
 * ne parle qu'aux serveurs de Google, quoi qu'il y ait dans l'environnement.
 */
function pointsDeTerminaison() {
  const horsProduction = process.env.NODE_ENV !== "production";

  return {
    autorisation:
      (horsProduction && process.env.GOOGLE_AUTH_URL) || AUTORISATION,
    jeton: (horsProduction && process.env.GOOGLE_TOKEN_URL) || JETON,
    emetteurs:
      horsProduction && process.env.GOOGLE_ISSUER
        ? [process.env.GOOGLE_ISSUER]
        : EMETTEURS,
  };
}

export const COOKIE_ETAT = "koli_oauth_etat";
export const COOKIE_VERIFIEUR = "koli_oauth_verifieur";
export const COOKIE_NONCE = "koli_oauth_nonce";
export const COOKIE_INSCRIPTION = "koli_google_inscription";

/**
 * La connexion Google est-elle reellement utilisable ?
 *
 * Le bouton s'affiche desormais dans TOUS les cas : le masquer quand la
 * configuration manque revenait a faire disparaitre la fonction sans rien
 * dire, et personne ne pouvait deviner pourquoi. Il mene alors a un message
 * qui nomme precisement ce qu'il reste a faire.
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

/**
 * Origine à laquelle Google doit nous renvoyer.
 *
 * On part de l'origine RÉELLEMENT visitée, et non de `NEXT_PUBLIC_APP_URL`.
 * Sans cela, un utilisateur venu de `http://127.0.0.1:3000` était renvoyé sur
 * `http://localhost:3000` : deux origines distinctes pour le navigateur, donc
 * les cookies `state`, `nonce` et vérifieur déposés avant le départ n'étaient
 * pas renvoyés au retour, et la connexion échouait systématiquement.
 *
 * L'origine n'est pas acceptée aveuglément — l'en-tête `Host` est fourni par
 * le client. Seules passent les adresses locales de développement et
 * l'origine déclarée dans la configuration ; tout le reste retombe sur cette
 * dernière.
 */
export function origineDeRappel(origineVisitee: string | null): string {
  const configuree = baseApplication();
  if (!origineVisitee) return configuree;

  try {
    const u = new URL(origineVisitee);
    const estLocale = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (estLocale || u.origin === configuree) return u.origin;
  } catch {
    // Origine illisible : on s'en tient à la configuration.
  }

  return configuree;
}

export function adresseDeRappel(origineVisitee: string | null = null): string {
  return `${origineDeRappel(origineVisitee)}/api/auth/google/callback`;
}

/**
 * La connexion Google peut-elle aboutir depuis CETTE adresse ?
 *
 * Non quand l'origine visitée n'est pas sur la liste blanche — typiquement une
 * adresse réseau privée du genre `http://192.168.1.20:3000`, celle par
 * laquelle on ouvre KOLI depuis un téléphone du même Wi-Fi. Deux raisons
 * indépendantes s'y opposent : Google refuse les adresses IP privées comme
 * adresse de rappel, et notre propre liste blanche fait retomber le rappel sur
 * l'origine configurée — donc sur `localhost`, qui, depuis un téléphone,
 * désigne le téléphone lui-même.
 *
 * Sans ce contrôle, le bouton était affiché et cliquable sur l'appareil
 * principal du public visé, pour ne mener qu'à une impasse. Mieux vaut dire
 * pourquoi que laisser essayer.
 */
/**
 * Origine annoncée par le navigateur, reconstruite depuis les en-têtes.
 *
 * Utile aux composants serveur, qui disposent de `headers()` mais pas de
 * l'objet requête. La valeur reste **non vérifiée** : c'est
 * `googleUtilisableDepuis` / `origineDeRappel` qui la confrontent à la liste
 * blanche.
 */
export function origineDepuisEnTetes(en: {
  get(nom: string): string | null;
}): string | null {
  const hote = en.get("x-forwarded-host") ?? en.get("host");
  if (!hote) return null;
  const protocole = en.get("x-forwarded-proto") ?? "http";
  return `${protocole}://${hote}`;
}

export function googleUtilisableDepuis(origineVisitee: string | null): boolean {
  if (!googleEstConfigure()) return false;
  if (!origineVisitee) return true;

  try {
    return origineDeRappel(origineVisitee) === new URL(origineVisitee).origin;
  } catch {
    return false;
  }
}

/**
 * Origine réellement demandée par le navigateur.
 *
 * `nextUrl.origin` ne convient pas : il reflète l'adresse d'écoute du serveur,
 * pas l'hôte que le visiteur a saisi. Un serveur lancé sur `0.0.0.0` et visité
 * en `127.0.0.1` renvoyait ainsi `localhost`, ce qui suffisait à casser toute
 * la connexion Google.
 *
 * `x-forwarded-*` d'abord, pour rester correct derrière un proxy — c'est le
 * cas en production. Ces en-têtes viennent du client, mais `origineDeRappel()`
 * les confronte à une liste blanche : rien n'est accepté sur parole.
 */
export function origineDemandee(requete: {
  headers: { get(nom: string): string | null };
  url: string;
}): string {
  const hote =
    requete.headers.get("x-forwarded-host") ?? requete.headers.get("host");
  if (!hote) return baseApplication();

  const protocole =
    requete.headers.get("x-forwarded-proto") ??
    new URL(requete.url).protocol.replace(":", "");

  return origineDeRappel(`${protocole}://${hote}`);
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
  origine: string | null;
}): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID as string,
    redirect_uri: adresseDeRappel(options.origine),
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

  return `${pointsDeTerminaison().autorisation}?${params.toString()}`;
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
  nonceAttendu: string,
  origine: string | null = null
): Promise<IdentiteGoogle> {
  const reponse = await fetch(pointsDeTerminaison().jeton, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      // MEME adresse qu'a l'aller : OAuth 2.0 impose que les deux coincident.
      redirect_uri: adresseDeRappel(origine),
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

  if (!charge.iss || !pointsDeTerminaison().emetteurs.includes(charge.iss)) {
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
