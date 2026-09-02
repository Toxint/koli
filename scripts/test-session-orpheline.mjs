/**
 * Session valide pointant vers un compte qui n'existe plus.
 *
 * Ce test existe a cause d'une panne precise, signalee par une capture d'ecran :
 * une page blanche sur /vendeur/dashboard, sans message ni moyen d'en sortir.
 *
 * Le cookie de session est SIGNE, il n'est pas verifie en base. Quand le compte
 * disparait — suppression par l'administration, reinitialisation de la base —
 * le middleware continue de le tenir pour valide alors que la page ne trouve
 * plus personne. Chacun renvoyait alors vers l'autre :
 *
 *   /vendeur/dashboard  ->  compte introuvable        ->  /connexion
 *   /connexion          ->  jeton valide (middleware) ->  /vendeur/dashboard
 *
 * Resultat : ERR_TOO_MANY_REDIRECTS et une page blanche. La correction deplace
 * la decision « vous etes deja connecte » dans la page, qui lit la base.
 *
 * Usage :
 *   BASE_URL=http://172.20.10.7:3000 node scripts/test-session-orpheline.mjs
 */

import { chromium } from "playwright";
import { ecrire } from "./base-donnees.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const marque = Date.now().toString().slice(-7);
const EMAIL_TEST = `ephemere${marque}@exemple.ci`;

console.log(`\n=== SESSION ORPHELINE depuis ${BASE} ===\n`);

const navigateur = await chromium.launch();
let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 160)));

/*
 * 1. Inscription : on obtient une session parfaitement valide.
 *
 * `networkidle` et non `domcontentloaded`, et ce n'est pas un detail de
 * confort.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │  Le formulaire ne se soumet PAS avant que React ne l'ait hydrate.      │
 * │  Son `onSubmit` n'existe pas encore, et le clic ne declenche rien.     │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A `domcontentloaded`, le test remplissait et cliquait en quelques
 * millisecondes — avant l'hydratation. Il concluait « l'inscription n'ouvre
 * pas de session », alors que l'inscription n'avait jamais ete demandee.
 *
 * Cela ne se voyait pas tant que la page etait legere. Elle s'est alourdie, la
 * course s'est mise a se perdre, et le controle a commence a accuser un defaut
 * qui n'existe pas.
 *
 * ⚠ Ce que cela dit du PRODUIT, et qui reste vrai : sur un telephone d'entree
 * de gamme et un reseau lent (§70), quelqu'un qui tape « Creer mon compte »
 * tres vite peut ne rien declencher. Un vrai utilisateur met des secondes a
 * remplir un formulaire, donc le cas est rare — mais il existe, et seul un
 * formulaire fonctionnant sans JavaScript le fermerait tout a fait.
 */
await page.goto(`${BASE}/inscription`, { waitUntil: "networkidle" });
await page.locator("#name").fill("Compte Ephemere");
await page.locator("#phone").fill(`+22507${marque}`);
await page.locator("#email").fill(EMAIL_TEST);
await page.locator("#password").fill("MotDePasseTest2026");
const boutique = page.locator("#businessName");
if (await boutique.count()) await boutique.fill("Boutique Ephemere");
await page
  .getByRole("button", { name: /inscri|créer|compte/i })
  .filter({ visible: true })
  .first()
  .click();
await page
  .waitForURL((u) => u.pathname === "/vendeur/dashboard", { timeout: 30000 })
  .catch(() => {});

verifier(
  new URL(page.url()).pathname === "/vendeur/dashboard",
  "l'inscription ouvre bien une session"
);

// 2. Le compte disparait, le cookie reste.
// On efface UNIQUEMENT le compte de ce test.
//
// Rejouer le seed entier effacait tous les comptes, y compris ceux qu'un
// autre test etait en train d'utiliser : ce test devenait hostile a ses
// voisins et les faisait echouer sans rapport avec ce qu'ils verifient.
{
  await ecrire('DELETE FROM "User" WHERE email = ?', EMAIL_TEST);
}

// 3. L'utilisateur revient sur son espace.
let erreurNavigation = null;
await page
  .goto(`${BASE}/vendeur/dashboard`, {
    waitUntil: "domcontentloaded",
    timeout: 20000,
  })
  .catch((e) => {
    erreurNavigation = e.message.split("\n")[0];
  });
await page.waitForTimeout(2500);

verifier(
  erreurNavigation === null,
  "aucune boucle de redirection",
  erreurNavigation ?? ""
);

const chemin = new URL(page.url()).pathname;
const texte = await page.evaluate(() => (document.body?.innerText ?? "").trim());

verifier(
  chemin === "/connexion",
  "l'utilisateur atterrit sur le formulaire de connexion",
  chemin
);
verifier(
  texte.length > 200,
  "la page affiche du contenu, pas un ecran blanc",
  `${texte.length} caracteres`
);
verifier(
  /mot de passe/i.test(texte),
  "le formulaire de connexion est bien la"
);

// 4. Et il peut effectivement se reconnecter avec un compte valide.
await page.locator("#identifier").fill("vendeur@koli.ci");
await page.locator("#password").fill("Password123!");
await page
  .getByRole("button", { name: /^Se connecter$/ })
  .filter({ visible: true })
  .first()
  .click();
// On attend la NAVIGATION, pas un delai : la connexion ecrit desormais sur une
// base distante, et quatre secondes ne suffisent plus toujours.
await page
  .waitForURL((u) => u.pathname === "/vendeur/dashboard", { timeout: 30000 })
  .catch(() => {});

verifier(
  new URL(page.url()).pathname === "/vendeur/dashboard",
  "il peut se reconnecter normalement",
  new URL(page.url()).pathname
);

// 5. Une fois reconnecte, /connexion doit toujours renvoyer a son espace.
await page.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
verifier(
  new URL(page.url()).pathname === "/vendeur/dashboard",
  "un utilisateur connecte est renvoye vers son espace depuis /connexion",
  new URL(page.url()).pathname
);

verifier(erreurs.length === 0, "aucune erreur JavaScript", erreurs[0] ?? "");

await ctx.close();
await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "Une session orpheline ne bloque plus l'utilisateur."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
