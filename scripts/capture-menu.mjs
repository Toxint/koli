/**
 * Captures du menu lateral, tiroir mobile ouvert compris.
 *   BASE_URL=http://172.20.10.7:3000 node scripts/capture-menu.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DOSSIER = ".captures";
await mkdir(DOSSIER, { recursive: true });

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
await page.locator("#identifier").fill("vendeur@koli.ci");
await page.locator("#password").fill("Password123!");
await page.getByRole("button", { name: /connecter/i }).filter({ visible: true }).first().click();
await page.waitForTimeout(3500);

await page.goto(`${BASE}/vendeur/produits`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /ouvrir le menu/i }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${DOSSIER}/tiroir-mobile.png` });
console.log(`  ${DOSSIER}/tiroir-mobile.png`);

await nav.close();
