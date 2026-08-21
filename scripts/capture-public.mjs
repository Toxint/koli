/**
 * Captures des pages publiques.
 *   BASE_URL=http://172.20.10.7:3000 node scripts/capture-public.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DOSSIER = ".captures";
await mkdir(DOSSIER, { recursive: true });

const nav = await chromium.launch();
for (const t of [
  { nom: "mobile", width: 390, height: 844 },
  { nom: "desktop", width: 1280, height: 900 },
]) {
  const ctx = await nav.newContext({ viewport: { width: t.width, height: t.height } });
  const page = await ctx.newPage();
  for (const vue of [
    { chemin: "/", nom: "accueil" },
    { chemin: "/connexion", nom: "connexion" },
  ]) {
    await page.goto(`${BASE}${vue.chemin}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${DOSSIER}/${vue.nom}-${t.nom}.png`, fullPage: vue.nom === "connexion" });
    console.log(`  ${DOSSIER}/${vue.nom}-${t.nom}.png`);
  }
  await ctx.close();
}
await nav.close();
