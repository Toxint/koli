/**
 * Clients du vendeur (phase 7, §10).
 *
 * Ce que ce test protege :
 *  - un acheteur SANS COMPTE compte comme client : il est identifie par son
 *    telephone, comme partout ailleurs dans KOLI. Grouper par compte laisserait
 *    de cote une grande partie du public vise ;
 *  - deux commandes du meme acheteur font UN client, pas deux ;
 *  - le « total regle » ne compte que les paiements aboutis — une commande
 *    creee puis jamais payee ne fait depenser personne ;
 *  - un vendeur ne voit QUE ses propres acheteurs.
 *
 * Usage :
 *   BASE_URL=http://192.168.1.101:3000 node scripts/test-clients-vendeur.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";
const marque = Date.now().toString().slice(-6);

const INVITE = {
  nom: `Invite Sans Compte ${marque}`,
  telephone: `+22509${marque}`,
};

console.log(`\n=== CLIENTS DU VENDEUR depuis ${BASE} ===\n`);

const navigateur = await chromium.launch();
let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const bouton = (page, libelle) =>
  page.getByRole("button", { name: libelle }).filter({ visible: true }).first();

const connecter = async (page, identifiant) => {
  // `networkidle` et non `domcontentloaded` : le formulaire est gere en
  // JavaScript, et un clic avant hydratation ne declenche rien. Le test
  // echouait alors pour une raison etrangere a ce qu il verifie.
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill(identifiant);
  await page.locator("#password").fill(MDP);
  await bouton(page, /^Se connecter$/).click();
  await page
    .waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 25000 })
    .catch(() => {});
};

/** Cree une commande pour l'acheteur invite, et la paie si demande. */
async function creerCommande(page, { payer }) {
  await page.goto(`${BASE}/vendeur/commandes/nouvelle`, {
    waitUntil: "networkidle",
  });

  const selecteur = page.locator("#productId");
  const option = await selecteur.evaluate(
    (s) => Array.from(s.options).find((o) => /Robe Wax/i.test(o.textContent))?.value
  );
  await selecteur.selectOption(option);
  await page.locator("#quantity").fill("1");
  await bouton(page, /Continuer/i).click();
  await page.waitForTimeout(500);

  await page.locator("#buyerName").fill(INVITE.nom);
  await page.locator("#buyerPhone").fill(INVITE.telephone);
  await page.locator("#buyerCity").fill("Bouaké");
  await page.locator("#buyerAddress").fill(`Client test ${marque}`);
  await bouton(page, /Continuer/i).click();
  await page.waitForTimeout(500);

  await page.locator("#deliveryFee").fill("2000");
  await bouton(page, /Continuer/i).click();
  await page.waitForTimeout(500);
  await bouton(page, /Créer la commande/i).click();
  await page.waitForTimeout(4000);

  const texte = await page.evaluate(() => document.body.innerText);
  const reference = (texte.match(/KOLI-[2-9A-Z]{8}/) ?? [])[0];

  if (payer && reference) {
    const p = await page.context().newPage();
    await p.goto(`${BASE}/pay/${reference}`, { waitUntil: "networkidle" });
    await p
      .getByRole("button", { name: /Simuler un paiement réussi/i })
      .filter({ visible: true })
      .first()
      .click();
    await p.waitForTimeout(4000);
    await p.close();
  }

  return reference;
}

const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 160)));

await connecter(page, "vendeur@koli.ci");

// ── 1. La page existe et figure au menu
await page.goto(`${BASE}/vendeur/clients`, { waitUntil: "networkidle" });
verifier(
  new URL(page.url()).pathname === "/vendeur/clients",
  "la page Clients est accessible"
);
verifier(
  (await page.getByRole("link", { name: /^Clients$/ }).count()) > 0,
  "« Clients » figure au menu du vendeur (§10)"
);

// ── 2. Deux commandes du meme acheteur SANS COMPTE
const ref1 = await creerCommande(page, { payer: true });
const ref2 = await creerCommande(page, { payer: false });
verifier(Boolean(ref1 && ref2), "deux commandes creees pour le meme acheteur");

await page.goto(
  `${BASE}/vendeur/clients?q=${encodeURIComponent(INVITE.telephone)}`,
  { waitUntil: "networkidle" }
);
const texte = await page.evaluate(() => document.body.innerText);

verifier(
  texte.includes(INVITE.nom),
  "un acheteur SANS COMPTE apparait bien comme client"
);

// Une seule carte, pas deux : le regroupement se fait par telephone.
const occurrences = (texte.match(new RegExp(INVITE.nom, "g")) ?? []).length;
verifier(
  occurrences === 1,
  "deux commandes du meme acheteur font UN client, pas deux",
  `${occurrences} occurrence(s)`
);
verifier(
  /2 commandes/i.test(texte),
  "le nombre de commandes est exact",
  texte.match(/\d+ commandes?/)?.[0] ?? "introuvable"
);

// ── 3. Le total ne compte que ce qui a ete REELLEMENT paye
// Une seule des deux commandes est payee : 18 500 + 2 000 = 20 500.
const chiffres = texte.replace(/[\s  ]/g, "");
verifier(
  chiffres.includes("20500"),
  "le total ne compte que le paiement abouti, pas la commande impayee",
  texte.match(/[\d  ]+FCFA/)?.[0] ?? "introuvable"
);

// ── 4. Le lien mene aux commandes de ce client
await page
  .getByRole("link", { name: new RegExp(`commandes de ${INVITE.nom}`, "i") })
  .first()
  .click();
await page.waitForTimeout(2500);
const texteCommandes = await page.evaluate(() => document.body.innerText);
verifier(
  new URL(page.url()).pathname === "/vendeur/commandes" &&
    texteCommandes.includes(INVITE.nom),
  "« Ses commandes » filtre bien sur cet acheteur",
  new URL(page.url()).pathname
);

// ── 5. Cloisonnement : un autre vendeur ne voit pas cet acheteur
{
  const marqueAutre = Date.now().toString().slice(-7);
  const ctxAutre = await navigateur.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const autre = await ctxAutre.newPage();

  await autre.goto(`${BASE}/inscription`, { waitUntil: "domcontentloaded" });
  await autre.locator("#name").fill("Vendeur Concurrent");
  await autre.locator("#phone").fill(`+22508${marqueAutre}`);
  await autre.locator("#email").fill(`concurrent${marqueAutre}@exemple.ci`);
  await autre.locator("#password").fill(MDP);
  const boutique = autre.locator("#businessName");
  if (await boutique.count()) await boutique.fill("Boutique Concurrente");
  await autre
    .getByRole("button", { name: /inscri|créer|compte/i })
    .filter({ visible: true })
    .first()
    .click();
  await autre.waitForTimeout(4500);

  await autre.goto(`${BASE}/vendeur/clients`, { waitUntil: "networkidle" });
  const texteAutre = await autre.evaluate(() => document.body.innerText);
  verifier(
    !texteAutre.includes(INVITE.nom),
    "un autre vendeur ne voit PAS les acheteurs de ses concurrents"
  );
  await ctxAutre.close();
}

verifier(erreurs.length === 0, "aucune erreur JavaScript", erreurs[0] ?? "");

await ctx.close();
await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "La liste des clients du vendeur se comporte comme prevu."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
