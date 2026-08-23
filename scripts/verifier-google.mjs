/**
 * Controle des identifiants Google, sans navigateur.
 *
 * Sert a savoir TOUT DE SUITE si le collage dans .env est bon, plutot que de
 * le decouvrir au premier clic. Le controle est reel : on interroge Google
 * avec le client_id, et c'est Google qui dit s'il le connait.
 *
 * Usage :
 *   node scripts/verifier-google.mjs
 */

import { readFileSync } from "node:fs";

const AUTORISATION = "https://accounts.google.com/o/oauth2/v2/auth";

function lireEnv() {
  const valeurs = {};
  try {
    for (const ligne of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m) valeurs[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    console.log("  ✗ fichier .env introuvable");
    process.exit(1);
  }
  return valeurs;
}

const env = lireEnv();
const id = env.GOOGLE_CLIENT_ID ?? "";
const secret = env.GOOGLE_CLIENT_SECRET ?? "";

console.log("\n=== IDENTIFIANTS GOOGLE ===\n");

let echecs = 0;
const dire = (ok, texte, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${texte}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};

if (!id && !secret) {
  console.log("  Aucun identifiant renseigne dans .env.\n");
  console.log("  A faire sur https://console.cloud.google.com/apis/credentials :");
  console.log("    1. Creer un projet, puis l'ecran de consentement OAuth (externe)");
  console.log("    2. Creer des identifiants > ID client OAuth > Application Web");
  console.log("    3. URI de redirection autorises — LES DEUX :");
  console.log("         http://localhost:3000/api/auth/google/callback");
  console.log("         http://127.0.0.1:3000/api/auth/google/callback");
  console.log("    4. Coller GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans .env\n");
  console.log("  Puis relancer : node scripts/verifier-google.mjs");
  process.exitCode = 1;
  process.exit(1);
}

dire(Boolean(id), "GOOGLE_CLIENT_ID est renseigne");
dire(Boolean(secret), "GOOGLE_CLIENT_SECRET est renseigne");

// Forme attendue : Google delivre toujours un identifiant en
// <chiffres>-<suite>.apps.googleusercontent.com
dire(
  /\.apps\.googleusercontent\.com$/.test(id),
  "GOOGLE_CLIENT_ID a bien la forme delivree par Google",
  id ? `recu : ${id.slice(0, 24)}…` : ""
);

// Le secret ne doit pas etre l'identifiant recopie par erreur.
dire(
  Boolean(secret) && secret !== id,
  "le secret n'est pas une copie de l'identifiant"
);

if (echecs > 0) {
  console.log("\n  Corrigez .env, puis relancez ce controle.");
  process.exit(1);
}

// ------------------------------------------------ Controle aupres de Google
// On demande l'ecran d'autorisation sans le suivre : un client_id inconnu
// fait repondre Google par une page d'erreur explicite.
const params = new URLSearchParams({
  client_id: id,
  redirect_uri: "http://127.0.0.1:3000/api/auth/google/callback",
  response_type: "code",
  scope: "openid email profile",
  state: "controle",
});

/**
 * Google ne renvoie pas le motif dans le corps de la reponse : il redirige
 * vers /signin/oauth/error en placant l'erreur, encodee en base64url, dans le
 * parametre `authError`. C'est la qu'il faut la lire.
 *
 * Une premiere version cherchait « invalid_client » dans le corps d'une
 * reponse non suivie — corps qui ne contient qu'un « Moved Temporarily » de
 * 462 octets. Elle declarait donc valide n'importe quel identifiant. Un
 * controle qui rassure a tort est pire que pas de controle du tout.
 */
try {
  const reponse = await fetch(`${AUTORISATION}?${params}`, {
    redirect: "manual",
    // `Connection: close` : sans cela, la connexion persistante restait
    // ouverte et Node sortait sur une assertion libuv (Windows) apres avoir
    // pourtant affiche « valide ». Un script qui annonce un succes puis
    // renvoie un code d'erreur est pire qu'inutile — il casse tout
    // enchainement qui s'y fie.
    headers: { Connection: "close" },
  });
  const destination = reponse.headers.get("location") ?? "";

  let motif = "";
  const encode = new URL(destination, AUTORISATION).searchParams.get(
    "authError"
  );
  if (encode) {
    motif = Buffer.from(
      encode.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
  }

  const enErreur = destination.includes("/signin/oauth/error");

  dire(
    !/invalid_client|deleted_client|was not found/i.test(motif),
    "Google reconnait cet identifiant client",
    /invalid_client|was not found/i.test(motif)
      ? "identifiant inconnu de Google — verifiez le collage"
      : ""
  );

  dire(
    !/redirect_uri_mismatch/i.test(motif),
    "l'adresse de rappel http://127.0.0.1:3000/… est declaree chez Google",
    /redirect_uri_mismatch/i.test(motif)
      ? "ajoutez-la dans « URI de redirection autorises »"
      : ""
  );

  // Toute autre erreur renvoyee par Google doit remonter telle quelle plutot
  // que d'etre passee sous silence.
  if (enErreur && !/invalid_client|redirect_uri_mismatch|was not found/i.test(motif)) {
    dire(false, "Google refuse la demande", motif.replace(/[^\x20-\x7E]/g, " ").trim());
  }
} catch (e) {
  dire(false, "impossible de joindre Google", e.message);
}

console.log("");
if (echecs === 0) {
  console.log("  Les identifiants sont valides. Relancez le serveur, puis");
  console.log("  le bouton « Continuer avec Google » fonctionnera.");
} else {
  console.log(`  ${echecs} probleme(s) a corriger dans .env.`);
}
// `exitCode` plutot que `process.exit()` : la sortie forcee coupait la
// connexion HTTP en cours de fermeture et Node terminait sur une assertion
// libuv, avec un code 127 apres avoir pourtant affiche « valide ».
process.exitCode = echecs > 0 ? 1 : 0;
