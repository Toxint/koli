/**
 * Captures d'ecran de l'espace administrateur, pour inspection visuelle.
 *   BASE_URL=http://172.20.10.7:3000 node scripts/capture-admin.mjs
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DOSSIER = ".captures";
await mkdir(DOSSIER, { recursive: true });

const nav = await chromium.launch();

for (const taille of [
  { nom: "mobile", width: 390, height: 844 },
  { nom: "desktop", width: 1280, height: 900 },
]) {
  const ctx = await nav.newContext({
    viewport: { width: taille.width, height: taille.height },
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill("admin@koli.ci");
  await page.locator("#password").fill("Password123!");
  await page
    .getByRole("button", { name: /connecter/i })
    .filter({ visible: true })
    .first()
    .click();
  await page.waitForTimeout(3500);

  for (const vue of [
    { chemin: "/admin/dashboard", nom: "admin-dashboard" },
    { chemin: "/admin/vendeurs", nom: "admin-vendeurs" },
    { chemin: "/admin/utilisateurs", nom: "admin-utilisateurs" },
  ]) {
    await page.goto(`${BASE}${vue.chemin}`, { waitUntil: "networkidle" });
    await page.screenshot({
      path: `${DOSSIER}/${vue.nom}-${taille.nom}.png`,
      fullPage: true,
    });
    console.log(`  ${DOSSIER}/${vue.nom}-${taille.nom}.png`);
  }

  await ctx.close();
}

await nav.close();
