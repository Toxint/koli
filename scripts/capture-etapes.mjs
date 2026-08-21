/**
 * Captures de l'assistant de commande, une par etape.
 *   BASE_URL=http://172.20.10.7:3000 node scripts/capture-etapes.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DOSSIER = ".captures";
await mkdir(DOSSIER, { recursive: true });

const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const bouton = (l) =>
  page.getByRole("button", { name: l }).filter({ visible: true }).first();

await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
await page.locator("#identifier").fill("vendeur@koli.ci");
await page.locator("#password").fill("Password123!");
await bouton(/connecter/i).click();
await page.waitForTimeout(3500);

await page.goto(`${BASE}/vendeur/commandes/nouvelle`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${DOSSIER}/etape-1.png`, fullPage: true });

const sel = page.locator("#productId");
const opt = await sel.evaluate((s) =>
  Array.from(s.options).find((o) => /Robe Wax/i.test(o.textContent))?.value
);
await sel.selectOption(opt);
await page.locator("#quantity").fill("2");
await bouton(/Continuer/i).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${DOSSIER}/etape-2.png`, fullPage: true });

await page.locator("#buyerName").fill("Awa Koné");
await page.locator("#buyerPhone").fill("+2250505050505");
await page.locator("#buyerEmail").fill("awa@exemple.ci");
await page.locator("#buyerCity").fill("Abidjan");
await page.locator("#buyerAddress").fill("Cocody Angré 8e Tranche");
await bouton(/Continuer/i).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${DOSSIER}/etape-3.png`, fullPage: true });

await page.locator("#deliveryFee").fill("1500");
await page.locator("#buyerLandmark").fill("Face pharmacie du Soleil");
await bouton(/Continuer/i).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${DOSSIER}/etape-4.png`, fullPage: true });

console.log("  4 captures dans .captures/");
await nav.close();
