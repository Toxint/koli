/**
 * Mot de passe oublie (§62), de bout en bout.
 *
 * Ce que ce test protege :
 *  - le lien existe sur la page de connexion — sans lui, un compte verrouille
 *    par cinq tentatives ratees n'a aucune issue ;
 *  - la reponse est la MEME pour un compte inconnu et pour un compte reel,
 *    faute de quoi le formulaire devient un moyen de savoir qui est inscrit ;
 *  - le lien ne sert qu'une fois et le mot de passe change reellement ;
 *  - un jeton fabrique de toutes pieces est refuse.
 *
 * Usage :
 *   BASE_URL=http://192.168.1.101:3000 node scripts/test-mot-de-passe-oublie.mjs
 */

import { chromium } from "playwright";
import { lireUne } from "./base-donnees.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const marque = Date.now().toString().slice(-7);
const COMPTE = {
  nom: "Oubli Test",
  telephone: `+22507${marque}`,
  email: `oubli${marque}@exemple.ci`,
  ancien: "AncienMotDePasse1",
  nouveau: "NouveauMotDePasse2",
};

console.log(`\n=== MOT DE PASSE OUBLIE depuis ${BASE} ===\n`);

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
page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 160)));

const bouton = (libelle) =>
  page.getByRole("button", { name: libelle }).filter({ visible: true }).first();

// ------------------------------------------- 1. Le lien est sur la connexion
await page.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
const lien = page
  .getByRole("link", { name: /Mot de passe oublié/i })
  .filter({ visible: true });
verifier(
  (await lien.count()) > 0,
  "le lien « Mot de passe oublié ? » figure sur la connexion"
);

// ---------------------------------------------------- 2. Un compte a nous
await page.goto(`${BASE}/inscription`, { waitUntil: "networkidle" });
await page.locator("#name").fill(COMPTE.nom);
await page.locator("#phone").fill(COMPTE.telephone);
await page.locator("#email").fill(COMPTE.email);
await page.locator("#password").fill(COMPTE.ancien);
const boutique = page.locator("#businessName");
if (await boutique.count()) await boutique.fill("Boutique Oubli");
await page
  .getByRole("button", { name: /inscri|créer|compte/i })
  .filter({ visible: true })
  .first()
  .click();
// On attend la NAVIGATION, pas un delai. L'inscription ecrit desormais sur une
// base distante : les 4,5 secondes taillees pour un fichier SQLite local
// expiraient avant l'arrivee sur le tableau de bord, et le test annoncait un
// echec d'inscription qui n'en etait pas un.
await page
  .waitForURL((u) => u.pathname === "/vendeur/dashboard", { timeout: 30000 })
  .catch(() => {});
verifier(
  new URL(page.url()).pathname === "/vendeur/dashboard",
  "compte de test cree",
  new URL(page.url()).pathname
);
await ctx.clearCookies();

// -------------------- 3. La reponse ne dit pas si le compte existe
const demander = async (identifiant) => {
  await page.goto(`${BASE}/mot-de-passe-oublie`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator("#identifiant").fill(identifiant);
  await bouton(/Recevoir le lien/i).click();
  await page.waitForTimeout(2500);
  const texte = await page.evaluate(() => document.body.innerText);
  const statut = await page.locator('[role="status"]').first().innerText().catch(() => "");
  return { texte, statut };
};

const inconnu = await demander(`inexistant${marque}@exemple.ci`);
const connu = await demander(COMPTE.email);

verifier(
  inconnu.statut.trim() === connu.statut.trim() && connu.statut.trim().length > 0,
  "la reponse est identique pour un compte inconnu et pour un compte reel",
  `inconnu : ${JSON.stringify(inconnu.statut.slice(0, 40))}`
);

// ------------------------------------------------ 4. Le lien fonctionne
const lienTest = connu.texte.match(/https?:\/\/\S*\/mot-de-passe-oublie\/[a-f0-9]{64}/);
verifier(Boolean(lienTest), "le lien de reinitialisation est fourni (mode test)");

if (!lienTest) {
  await navigateur.close();
  console.log("\nImpossible de continuer sans lien.");
  process.exit(1);
}

const chemin = new URL(lienTest[0]).pathname;
await page.goto(`${BASE}${chemin}`, { waitUntil: "domcontentloaded" });
verifier(
  (await page.locator("#motDePasse").count()) > 0,
  "le lien mene au choix du nouveau mot de passe"
);

await page.locator("#motDePasse").fill(COMPTE.nouveau);
await bouton(/Définir mon nouveau mot de passe/i).click();
await page.waitForTimeout(3000);
const apres = await page.evaluate(() => document.body.innerText);
verifier(
  /modifié|connecter/i.test(apres),
  "le mot de passe est enregistre"
);

// -------------------------------- 5. Le nouveau marche, l'ancien non
/**
 * Tente une connexion, et DIT ce qui s'est passe.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │  Rester sur /connexion signifie DEUX choses opposees : le mot de passe │
 * │  a ete refuse, ou le clic n'a rien declenche du tout.                  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A `domcontentloaded`, on remplissait et on cliquait avant que React n'ait
 * hydrate le formulaire : `onSubmit` n'existait pas encore, aucune requete ne
 * partait. Deux consequences, et la seconde est la pire.
 *
 * « le nouveau mot de passe permet de se connecter » echouait alors que la
 * reinitialisation avait parfaitement fonctionne — l'echec observe le
 * 2 septembre 2026, sur une base locale a 38 ms.
 *
 * Et « l'ancien mot de passe ne fonctionne plus » PASSAIT, pour la mauvaise
 * raison : le clic ne partant jamais, l'URL restait /connexion quoi qu'il
 * arrive. Ce controle ne pouvait pas echouer, donc il ne protegeait rien (§8)
 * — pas meme le jour ou une reinitialisation laisserait l'ancien mot de passe
 * valide, ce qui est exactement le defaut qu'il est cense guetter.
 *
 * Elle attend donc `networkidle` avant de cliquer, et rapporte le message
 * affiche : un refus se PROUVE par « mot de passe incorrect », jamais par une
 * absence de mouvement.
 */
const essayer = async (motDePasse) => {
  const c = await navigateur.newContext();
  const p = await c.newPage();
  await p.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await p.locator("#identifier").fill(COMPTE.email);
  await p.locator("#password").fill(motDePasse);
  await p
    .getByRole("button", { name: /^Se connecter$/ })
    .filter({ visible: true })
    .first()
    .click();
  // Une connexion reussie quitte /connexion ; une connexion refusee y reste et
  // affiche son motif. On attend l'un OU l'autre, borne dans le temps : le cas
  // legitime coute ce qu'il prend, et seul le silence coute le delai entier.
  await Promise.race([
    p.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 15000 }),
    p
      .getByText(/mot de passe incorrect/i)
      .first()
      .waitFor({ state: "visible", timeout: 15000 }),
  ]).catch(() => {});
  const chemin = new URL(p.url()).pathname;
  const texte = await p.evaluate(() => document.body.innerText);
  await c.close();
  return { chemin, refuse: /mot de passe incorrect/i.test(texte) };
};

const avecNouveau = await essayer(COMPTE.nouveau);
verifier(
  avecNouveau.chemin === "/vendeur/dashboard",
  "le nouveau mot de passe permet de se connecter",
  avecNouveau.chemin
);

const avecAncien = await essayer(COMPTE.ancien);
verifier(
  avecAncien.chemin === "/connexion" && avecAncien.refuse,
  "l'ancien mot de passe est refuse, et le refus est affiche",
  avecAncien.refuse
    ? avecAncien.chemin
    : `${avecAncien.chemin} sans message de refus — le formulaire a-t-il seulement ete soumis ?`
);

// ------------------------------------------------ 6. Le lien ne sert qu'une fois
await page.goto(`${BASE}${chemin}`, { waitUntil: "domcontentloaded" });
const rejoue = await page.evaluate(() => document.body.innerText);
verifier(
  /plus valide/i.test(rejoue) && (await page.locator("#motDePasse").count()) === 0,
  "le meme lien ne peut pas etre rejoue"
);

// ------------------------------------- 7. Un jeton fabrique est refuse
await page.goto(`${BASE}/mot-de-passe-oublie/${"f".repeat(64)}`, {
  waitUntil: "domcontentloaded",
});
verifier(
  (await page.locator("#motDePasse").count()) === 0,
  "un jeton fabrique de toutes pieces est refuse"
);

// -------------------- 8. Le jeton est bien HACHE en base, jamais en clair
{
  const ligne = await lireUne(
    'SELECT "resetTokenHash" FROM "User" WHERE email = ?',
    COMPTE.email
  );
  const jetonClair = chemin.split("/").pop();
  verifier(
    ligne?.resetTokenHash == null,
    "le jeton consomme est efface de la base"
  );
  verifier(
    ligne?.resetTokenHash !== jetonClair,
    "le jeton n'est jamais stocke en clair"
  );
}

verifier(erreurs.length === 0, "aucune erreur JavaScript", erreurs[0] ?? "");

await ctx.close();
await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "La reinitialisation du mot de passe fonctionne de bout en bout."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
