/**
 * Captures des courbes de performance — vendeur, livreur, et le cas vide.
 *
 * Le cas vide en fait partie parce que c'est le PREMIER écran d'un nouveau
 * venu : celui qu'on ne voit jamais en travaillant sur un jeu de données déjà
 * rempli, et donc celui qui reste laid le plus longtemps.
 *
 *   BASE_URL=http://127.0.0.1:3000 node scripts/capture-courbes.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DOSSIER = ".captures";
await mkdir(DOSSIER, { recursive: true });

const nav = await chromium.launch();

async function capturer(email, sortie) {
  const ctx = await nav.newContext({
    viewport: { width: 1280, height: 900 },
    // Le double de pixels : une courbe fine se juge mal sur une capture floue.
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill(email);
  await page.locator("#password").fill("Password123!");
  await page
    .getByRole("button", { name: /^Se connecter$/ })
    .filter({ visible: true })
    .first()
    .click();

  const courbe = page.locator("[data-courbe]").first();
  await courbe.waitFor({ state: "visible", timeout: 30000 });
  await courbe.scrollIntoViewIfNeeded();

  // On attend que les animations d'ouverture soient FINIES, au lieu de dormir
  // un temps fixe : une capture prise en chemin montre une courbe tronquée et
  // fait croire à un défaut d'affichage. C'est arrivé.
  await page.evaluate(() =>
    Promise.all(
      document
        .querySelector("[data-courbe]")
        .getAnimations({ subtree: true })
        .map((a) => a.finished)
    )
  );

  const carte = courbe.locator(
    'xpath=ancestor::div[contains(@class,"rounded-2xl")][1]'
  );
  await carte.screenshot({ path: `${DOSSIER}/${sortie}.png` });
  console.log(`  ${DOSSIER}/${sortie}.png`);

  await ctx.close();
}

await capturer("vendeur@koli.ci", "courbe-vendeur");
await capturer("livreur@koli.ci", "courbe-livreur");
await capturer("vendeur2@koli.ci", "courbe-vide");

await nav.close();
