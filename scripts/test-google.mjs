/**
 * Connexion Google, dans un vrai navigateur.
 *
 * Le compte Google reel ne peut pas etre automatise. Ce qui est verifie ici,
 * c'est tout ce qui l'entoure et qui casse silencieusement :
 *  - sans identifiants configures, AUCUN bouton n'apparait (un bouton qui
 *    mene a une erreur vaut moins que pas de bouton) ;
 *  - le depart de la connexion pose bien state, verifieur et nonce en cookies
 *    httpOnly, et redirige vers Google avec PKCE ;
 *  - un retour force sans cookies est REFUSE (protection CSRF) ;
 *  - /inscription/google sans identite en attente renvoie a la connexion.
 *
 * Usage :
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-google.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CONFIGURE = process.env.GOOGLE_CONFIGURE === "1";

console.log(`\n=== CONNEXION GOOGLE depuis ${BASE} ===`);
console.log(
  CONFIGURE
    ? "  (identifiants Google configures)\n"
    : "  (identifiants Google ABSENTS : on verifie l'absence propre)\n"
);

const navigateur = await chromium.launch();
let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const ctx = await navigateur.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 140)));

// ------------------------------------------- 1. Le bouton est TOUJOURS la
// Il etait auparavant masque sans configuration : la fonction disparaissait
// sans un mot, et rien ne permettait de comprendre pourquoi.
for (const chemin of ["/connexion", "/inscription"]) {
  await page.goto(`${BASE}${chemin}`, { waitUntil: "domcontentloaded" });
  const bouton = page
    .getByRole("link", { name: /avec Google/i })
    .filter({ visible: true });
  const nombre = await bouton.count();

  verifier(nombre > 0, `${chemin} propose la connexion Google`, `${nombre} bouton(s)`);

  if (nombre > 0) {
    verifier(
      (await bouton.first().getAttribute("href")) === "/api/auth/google",
      `${chemin} : le bouton part vers /api/auth/google`
    );
  }

  const texte = await page.evaluate(() => document.body.innerText);
  // Le message s'adresse a un commercant, pas a un developpeur : le detail
  // technique est parti au journal du serveur.
  const mention = /Bientôt disponible/i.test(texte);
  verifier(
    CONFIGURE ? !mention : mention,
    CONFIGURE
      ? `${chemin} : aucune mention d'indisponibilite`
      : `${chemin} : l'indisponibilite est annoncee sobrement`
  );
}

// ------------------------------------------------- 2. Depart de la poignee
{
  // `manual` : on veut lire la redirection, pas la suivre jusqu'a Google.
  const reponse = await page.request.get(`${BASE}/api/auth/google`, {
    maxRedirects: 0,
  });
  const destination = reponse.headers()["location"] ?? "";

  if (CONFIGURE) {
    const url = new URL(destination);
    verifier(
      url.origin === "https://accounts.google.com",
      "le depart redirige vers Google",
      url.origin
    );
    verifier(
      url.searchParams.get("code_challenge_method") === "S256",
      "PKCE est active (S256)"
    );
    verifier(
      Boolean(url.searchParams.get("state")),
      "un state est transmis (anti-CSRF)"
    );
    verifier(
      Boolean(url.searchParams.get("nonce")),
      "un nonce est transmis (anti-rejeu)"
    );
    verifier(
      !destination.includes("code_verifier"),
      "le verifieur PKCE ne quitte jamais le serveur"
    );

    // L'adresse de rappel doit porter l'origine REELLEMENT visitee. Avec
    // NEXT_PUBLIC_APP_URL en dur, un visiteur de 127.0.0.1 etait renvoye sur
    // localhost : deux sites distincts pour le navigateur, donc les cookies de
    // la poignee de main ne revenaient pas et la connexion echouait toujours.
    verifier(
      url.searchParams.get("redirect_uri") ===
        `${BASE}/api/auth/google/callback`,
      "l'adresse de rappel reste sur l'origine visitee",
      url.searchParams.get("redirect_uri") ?? ""
    );

    const cookies = await ctx.cookies();
    for (const nom of [
      "koli_oauth_etat",
      "koli_oauth_verifieur",
      "koli_oauth_nonce",
    ]) {
      const c = cookies.find((x) => x.name === nom);
      verifier(c != null && c.httpOnly, `${nom} est pose en httpOnly`);
    }
  } else {
    verifier(
      destination.includes("/connexion"),
      "sans configuration, le depart renvoie a la connexion avec un message",
      destination
    );
  }
}

// ------------------------------ 3. Retour force sans cookies : doit echouer
{
  const vierge = await navigateur.newContext();
  const reponse = await vierge.request.get(
    `${BASE}/api/auth/google/callback?code=faux&state=forge`,
    { maxRedirects: 0 }
  );
  const destination = reponse.headers()["location"] ?? "";

  verifier(
    destination.includes("/connexion") && destination.includes("erreur"),
    "un retour forge sans cookies est refuse (anti-CSRF)",
    destination
  );

  const cookies = await vierge.cookies();
  verifier(
    !cookies.some((c) => c.name === "koli_session"),
    "aucune session n'est ouverte par un retour forge"
  );
  await vierge.close();
}

// ------------------- 4. Page de complement sans identite en attente
{
  const vierge = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
  });
  const p = await vierge.newPage();
  await p.goto(`${BASE}/inscription/google`, { waitUntil: "networkidle" });
  const chemin = new URL(p.url()).pathname;
  const texte = await p.evaluate(() => document.body.innerText);

  verifier(
    chemin === "/connexion",
    "/inscription/google sans identite renvoie a la connexion",
    chemin
  );
  verifier(
    /expir|recommencer/i.test(texte),
    "le visiteur est informe plutot que renvoye sur un formulaire muet"
  );
  await vierge.close();
}

verifier(erreurs.length === 0, "aucune erreur JavaScript", erreurs[0] ?? "");

await ctx.close();
await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "La connexion Google se comporte comme prevu."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
