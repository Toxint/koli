/**
 * Verifie la CONNEXION reelle, depuis l'adresse reseau.
 *
 * Ce test existe a cause d'une panne precise : le cookie de session portait
 * l'attribut `secure`, que les navigateurs acceptent sur `localhost` (origine
 * consideree comme sure) mais refusent sur une adresse IP en HTTP. La
 * connexion aboutissait puis l'utilisateur etait immediatement renvoye au
 * formulaire, sans aucun message. Tester uniquement `localhost` rendait le
 * defaut invisible.
 *
 * Usage :
 *   BASE_URL=http://172.20.10.7:3000 node scripts/test-connexion.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

const COMPTES = [
  { identifiant: "vendeur@koli.ci", attendu: "/vendeur/dashboard" },
  { identifiant: "client@koli.ci", attendu: "/client/dashboard" },
  { identifiant: "livreur@koli.ci", attendu: "/livreur/dashboard" },
  { identifiant: "admin@koli.ci", attendu: "/admin/dashboard" },
];

console.log(`\n=== CONNEXION depuis ${BASE} ===\n`);

const navigateur = await chromium.launch();
let echecs = 0;

for (const compte of COMPTES) {
  const ctx = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();

  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 140)));

  // On entre par une page protegee : c'est le parcours reel de l'utilisateur,
  // avec le parametre `redirect` que le middleware ajoute.
  await page.goto(`${BASE}${compte.attendu}`, { waitUntil: "networkidle" });

  await page.locator("#identifier").fill(compte.identifiant);
  await page.locator("#password").fill(MDP);
  await page.locator('button[type="submit"]').first().click();

  await page.waitForTimeout(4000);

  const url = new URL(page.url()).pathname;
  const cookies = await ctx.cookies();
  const session = cookies.find((c) => c.name === "koli_session");
  const texte = await page.evaluate(() =>
    (document.body?.innerText ?? "").trim()
  );

  const connecte = url === compte.attendu;

  if (connecte && session && erreurs.length === 0) {
    console.log(
      `✓ ${compte.identifiant.padEnd(18)} → ${url}  (cookie secure=${session.secure})`
    );
  } else {
    echecs++;
    console.log(`✗ ${compte.identifiant}`);
    console.log(`    URL apres connexion : ${url} (attendu ${compte.attendu})`);
    console.log(
      `    cookie de session : ${session ? `present (secure=${session.secure})` : "ABSENT"}`
    );
    if (!connecte && url === "/connexion") {
      console.log(
        "    -> renvoye au formulaire : le cookie n'a pas ete conserve"
      );
    }
    const messageErreur = texte.match(/incorrect|suspendu|tentatives/i);
    if (messageErreur) console.log(`    message affiche : ${messageErreur[0]}`);
    for (const e of erreurs.slice(0, 2)) console.log(`    erreur JS : ${e}`);
  }

  // La session survit-elle a un rechargement ? C'est la que le defaut du
  // cookie `secure` se manifestait.
  if (connecte) {
    await page.reload({ waitUntil: "networkidle" });
    const apres = new URL(page.url()).pathname;
    if (apres !== compte.attendu) {
      echecs++;
      console.log(
        `  ✗ ${compte.identifiant} — session perdue au rechargement (${apres})`
      );
    }
  }

  await ctx.close();
}

await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? `Les ${COMPTES.length} connexions fonctionnent, session persistante.`
    : `${echecs} probleme(s) de connexion.`
);
process.exit(echecs > 0 ? 1 : 0);
