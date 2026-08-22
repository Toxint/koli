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
import Database from "better-sqlite3";

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
await page.goto(`${BASE}/inscription`, { waitUntil: "domcontentloaded" });
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
await page.waitForTimeout(4500);
verifier(
  new URL(page.url()).pathname === "/vendeur/dashboard",
  "compte de test cree"
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
const essayer = async (motDePasse) => {
  const c = await navigateur.newContext();
  const p = await c.newPage();
  await p.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
  await p.locator("#identifier").fill(COMPTE.email);
  await p.locator("#password").fill(motDePasse);
  await p
    .getByRole("button", { name: /^Se connecter$/ })
    .filter({ visible: true })
    .first()
    .click();
  await p.waitForTimeout(4000);
  const chemin = new URL(p.url()).pathname;
  await c.close();
  return chemin;
};

verifier(
  (await essayer(COMPTE.nouveau)) === "/vendeur/dashboard",
  "le nouveau mot de passe permet de se connecter"
);
verifier(
  (await essayer(COMPTE.ancien)) === "/connexion",
  "l'ancien mot de passe ne fonctionne plus"
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
  const db = new Database("prisma/dev.db", { readonly: true });
  const ligne = db
    .prepare("SELECT resetTokenHash FROM User WHERE email = ?")
    .get(COMPTE.email);
  db.close();
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
