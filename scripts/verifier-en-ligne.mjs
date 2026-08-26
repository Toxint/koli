/**
 * Le site deploye est-il REELLEMENT fonctionnel ?
 *
 * Une page qui s affiche ne prouve rien : la page d accueil est statique. Ce
 * qui doit etre eprouve, c est la chaine complete — Vercel joint Supabase, la
 * session se signe, les donnees du vendeur remontent.
 *
 * On se connecte donc avec un VRAI compte, dont le mot de passe a ete tire au
 * sort par `supabase:securiser` et consigne dans `.donnees`.
 */

import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "https://koli-zeta.vercel.app";

const comptes = fs
  .readFileSync(".donnees/comptes-supabase.txt", "utf8")
  .split(/\r?\n/)
  // `\s*` en tete : le fichier indente son tableau recapitulatif.
  .map((l) => l.match(/^\s*(\S+)\s+(\S+@\S+)\s+(\S+)\s*$/))
  .filter(Boolean)
  .map(([, role, email, mdp]) => ({ role, email, mdp }));

const vendeur = comptes.find((c) => c.role === "SELLER");

let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

console.log(`\n=== KOLI EN LIGNE — ${BASE} ===\n`);

const nav = await chromium.launch();
const ctx = await nav.newContext();
const page = await ctx.newPage();

const erreurs = [];
page.on("response", (r) => {
  if (r.status() >= 500) erreurs.push(`${r.status()} ${r.url()}`);
});

await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle", timeout: 90000 });
verifier(new URL(page.url()).pathname === "/connexion", "la page de connexion s'ouvre sans authentification Vercel");

const texte = await page.evaluate(() => document.body.innerText);
verifier(!/admin@koli\.ci|Password123/i.test(texte), "elle n'annonce aucun compte de demonstration");

await page.locator("#identifier").fill(vendeur.email);
await page.locator("#password").fill(vendeur.mdp);
await page.getByRole("button", { name: /^Se connecter$/ }).filter({ visible: true }).first().click();

await page
  .waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 90000 })
  .catch(() => {});

const arrive = new URL(page.url()).pathname;
verifier(arrive.startsWith("/vendeur"), "la connexion aboutit sur l'espace vendeur", arrive);

// Si la session tient, c'est que AUTH_SECRET est bien pose en production.
await page.goto(`${BASE}/vendeur/dashboard`, { waitUntil: "networkidle", timeout: 90000 });
const tableau = await page.evaluate(() => document.body.innerText);

verifier(
  !/Une erreur est survenue/i.test(tableau),
  "le tableau de bord se rend sans erreur serveur"
);
verifier(
  /FCFA/.test(tableau),
  "des montants remontent de la base Supabase"
);
verifier(/Mode test/i.test(tableau), "le mode test reste signale (§75)");

// Le menu doit porter ses dix rubriques.
const rubriques = await page.locator("[data-menu-koli] nav a").count();
verifier(rubriques >= 8, `le menu lateral est complet`, `${rubriques} rubriques`);

verifier(erreurs.length === 0, "aucune reponse 500 pendant le parcours", erreurs.slice(0, 3).join(" | "));

await nav.close();

console.log(
  `\n${echecs === 0 ? "Le site en ligne fonctionne de bout en bout." : `${echecs} probleme(s).`}\n`
);
process.exit(echecs === 0 ? 0 : 1);
