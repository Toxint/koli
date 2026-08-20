/**
 * Reproduit le geste reel de l'utilisateur : cliquer sur les liens depuis
 * l'accueil, plutot que charger chaque URL directement.
 *
 * Une navigation cote client (Next.js Link) peut echouer la ou un chargement
 * complet de page reussit : c'est precisement ce que les tests par URL ratent.
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/**
 * `largeurMin` : certains libelles changent selon la taille d'ecran. Le bouton
 * d'inscription affiche « S'inscrire » sous 640px et « Créer un compte »
 * au-dela — les deux sont testes, chacun a la largeur ou il existe.
 */
const PARCOURS = [
  { depuis: "/", libelle: "Connexion", attendu: "/connexion" },
  { depuis: "/", libelle: "Créer un compte", attendu: "/inscription", largeur: 1280 },
  { depuis: "/", libelle: "S'inscrire", attendu: "/inscription", largeur: 390 },
  { depuis: "/", libelle: "Commencer", attendu: "/inscription" },
  { depuis: "/", libelle: "Je suis vendeur", attendu: "/pour-les-vendeurs" },
  { depuis: "/", libelle: "Comment ça marche", attendu: "/comment-ca-marche", largeur: 1280 },
  { depuis: "/", libelle: "Pour les vendeurs", attendu: "/pour-les-vendeurs", largeur: 1280 },
  { depuis: "/", libelle: "En savoir plus sur le fonctionnement", attendu: "/comment-ca-marche" },
  { depuis: "/", libelle: "Aide", attendu: "/aide" },
  { depuis: "/", libelle: "Conditions", attendu: "/conditions" },
  { depuis: "/", libelle: "Confidentialité", attendu: "/confidentialite" },
  { depuis: "/connexion", libelle: "S'inscrire gratuitement", attendu: "/inscription" },
  { depuis: "/inscription", libelle: "Se connecter", attendu: "/connexion" },
];

const navigateur = await chromium.launch();
let echecs = 0;

for (const etape of PARCOURS) {
  const contexte = await navigateur.newContext({
    viewport: { width: etape.largeur ?? 390, height: 844 },
  });
  const page = await contexte.newPage();

  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 160)));
  page.on("console", (m) => {
    if (m.type() === "error") erreurs.push(m.text().slice(0, 160));
  });

  await page.goto(`${BASE}${etape.depuis}`, { waitUntil: "networkidle" });

  // `.and(visible)` : un lien masque par une regle responsive existe dans le
  // DOM mais n'est pas cliquable — le compter reviendrait a se mentir.
  const lien = page
    .getByRole("link", { name: etape.libelle, exact: false })
    .filter({ visible: true })
    .first();
  const presence = await lien.count();

  if (presence === 0) {
    console.log(
      `✗ « ${etape.libelle} » depuis ${etape.depuis} a ${etape.largeur ?? 390}px — LIEN ABSENT`
    );
    echecs++;
    await contexte.close();
    continue;
  }

  await lien.click();
  await page.waitForTimeout(2500);

  const url = new URL(page.url()).pathname;
  const contenu = await page.evaluate(() =>
    (document.body?.innerText ?? "").trim()
  );

  const bonneUrl = url === etape.attendu;
  const vide = contenu.length < 40;

  if (bonneUrl && !vide && erreurs.length === 0) {
    console.log(
      `✓ « ${etape.libelle} » → ${url}  (${contenu.length} car.)`
    );
  } else {
    echecs++;
    console.log(`✗ « ${etape.libelle} » depuis ${etape.depuis}`);
    if (!bonneUrl) console.log(`    URL : ${url} (attendu ${etape.attendu})`);
    if (vide) console.log(`    PAGE VIDE (${contenu.length} caracteres)`);
    for (const e of [...new Set(erreurs)].slice(0, 3)) {
      console.log(`    erreur : ${e}`);
    }
  }

  await contexte.close();
}

await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? `Tous les liens fonctionnent (${PARCOURS.length}).`
    : `${echecs} lien(s) en echec sur ${PARCOURS.length}.`
);
process.exit(echecs > 0 ? 1 : 0);
