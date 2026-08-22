/**
 * Fournisseur OpenID local, pour tester la connexion Google SANS identifiants
 * Google.
 *
 * Il ne simule pas complaisamment : il parle le vrai protocole et REFUSE tout
 * ce que Google refuserait — `client_id` inconnu, secret errone, `redirect_uri`
 * qui ne correspond pas a l'aller, `code` deja consomme, et surtout PKCE
 * verifie pour de bon (SHA-256 du verifieur compare au defi envoye au depart).
 *
 * C'est ce qui donne sa valeur au test : si notre implementation se trompait
 * d'un seul de ces points, l'echange echouerait ici exactement comme chez
 * Google.
 *
 * Usage :
 *   PORT=4545 node scripts/faux-google.mjs
 *
 * Le scenario renvoye se pilote par les parametres de /o/oauth2/v2/auth :
 *   ?_sub=...  ?_email=...  ?_verifie=0|1  ?_nom=...
 */

import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4545);
const EMETTEUR = process.env.ISSUER ?? `http://127.0.0.1:${PORT}`;
const CLIENT_ID = process.env.CLIENT_ID ?? "faux-client.apps.googleusercontent.com";
const CLIENT_SECRET = process.env.CLIENT_SECRET ?? "faux-secret";

/** Codes d'autorisation en attente d'echange. */
const codes = new Map();

/**
 * Identite que renverra la PROCHAINE autorisation.
 *
 * Le vrai Google fait choisir un compte a l'ecran ; ici le test l'annonce a
 * l'avance par POST /_scenario. C'est ce qui permet de rejouer plusieurs cas —
 * inconnu, deja rattache, e-mail non verifie — sans intervention humaine.
 */
const DEFAUT = {
  sub: "faux-sub-001",
  email: "essai.google@exemple.ci",
  verifie: true,
  nom: "Essai Google",
};
let scenario = { ...DEFAUT };

const b64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function idToken(charge) {
  // Signature factice : l'application ne la verifie pas, et la specification
  // l'en dispense pour un jeton recu directement du point de terminaison.
  return `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify(charge)
  )}.signature-factice`;
}

function lireCorps(requete) {
  return new Promise((resoudre) => {
    let donnees = "";
    requete.on("data", (m) => (donnees += m));
    requete.on("end", () => resoudre(donnees));
  });
}

const serveur = createServer(async (requete, reponse) => {
  const url = new URL(requete.url, `http://127.0.0.1:${PORT}`);

  // ------------------------------------------ Choix du compte, pour le test
  if (url.pathname === "/_scenario" && requete.method === "POST") {
    scenario = { ...DEFAUT, ...JSON.parse((await lireCorps(requete)) || "{}") };
    reponse.writeHead(200, { "Content-Type": "application/json" });
    return reponse.end(JSON.stringify(scenario));
  }

  // ---------------------------------------------------- Ecran d'autorisation
  if (url.pathname === "/o/oauth2/v2/auth") {
    const p = url.searchParams;

    if (p.get("client_id") !== CLIENT_ID) {
      reponse.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      return reponse.end("client_id inconnu");
    }
    if (p.get("code_challenge_method") !== "S256" || !p.get("code_challenge")) {
      reponse.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      return reponse.end("PKCE absent ou methode non supportee");
    }

    const code = randomBytes(16).toString("hex");
    codes.set(code, {
      defi: p.get("code_challenge"),
      nonce: p.get("nonce"),
      redirect_uri: p.get("redirect_uri"),
      ...scenario,
    });

    const retour = new URL(p.get("redirect_uri"));
    retour.searchParams.set("code", code);
    retour.searchParams.set("state", p.get("state") ?? "");
    reponse.writeHead(302, { Location: retour.toString() });
    return reponse.end();
  }

  // ------------------------------------------------------ Echange du jeton
  if (url.pathname === "/token" && requete.method === "POST") {
    const corps = new URLSearchParams(await lireCorps(requete));
    const envoyer = (statut, charge) => {
      reponse.writeHead(statut, { "Content-Type": "application/json" });
      reponse.end(JSON.stringify(charge));
    };

    if (
      corps.get("client_id") !== CLIENT_ID ||
      corps.get("client_secret") !== CLIENT_SECRET
    ) {
      return envoyer(401, { error: "invalid_client" });
    }

    const entree = codes.get(corps.get("code"));
    if (!entree) return envoyer(400, { error: "invalid_grant" });
    // Un code ne sert qu'une fois.
    codes.delete(corps.get("code"));

    if (corps.get("redirect_uri") !== entree.redirect_uri) {
      return envoyer(400, {
        error: "redirect_uri_mismatch",
        error_description: `attendu ${entree.redirect_uri}, recu ${corps.get("redirect_uri")}`,
      });
    }

    // PKCE : c'est ici que se joue la validite de notre implementation.
    const verifieur = corps.get("code_verifier") ?? "";
    const defiCalcule = b64url(createHash("sha256").update(verifieur).digest());
    if (defiCalcule !== entree.defi) {
      return envoyer(400, {
        error: "invalid_grant",
        error_description: "code_verifier ne correspond pas au code_challenge",
      });
    }

    return envoyer(200, {
      access_token: "faux-access-token",
      token_type: "Bearer",
      expires_in: 3600,
      id_token: idToken({
        iss: EMETTEUR,
        aud: CLIENT_ID,
        sub: entree.sub,
        exp: Math.floor(Date.now() / 1000) + 600,
        iat: Math.floor(Date.now() / 1000),
        nonce: entree.nonce,
        email: entree.email,
        email_verified: entree.verifie,
        name: entree.nom,
        picture: "https://exemple.invalid/photo.jpg",
      }),
    });
  }

  reponse.writeHead(404);
  reponse.end();
});

serveur.listen(PORT, "127.0.0.1", () => {
  console.log(`faux fournisseur OpenID sur http://127.0.0.1:${PORT}`);
});
