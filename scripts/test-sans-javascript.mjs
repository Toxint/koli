/**
 * Les deux portes de KOLI s'ouvrent-elles SANS JavaScript ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Un formulaire soumis par React n'existe QU'APRES l'hydratation. Avant,  │
 * │  on remplit, on clique, et rien ne part — sans erreur, sans message.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce n'est pas une precaution theorique. Le public de KOLI est sur telephone
 * d'entree de gamme et reseau mobile lent (§70), ou ce moment dure. Et c'est
 * un defaut du genre le plus couteux : la personne ne voit pas d'erreur, elle
 * conclut que le service ne marche pas.
 *
 * ── Pourquoi un navigateur SANS SCRIPTS, et non un test ordinaire ──────────
 *
 * `javaScriptEnabled: false` est la seule facon d'eprouver ce qui nous
 * interesse. Un navigateur normal hydrate en quelques millisecondes sur cette
 * machine : le test passerait en exercant exactement le chemin qu'on ne veut
 * pas eprouver. Couper les scripts, c'est figer le pire moment du reseau lent
 * et le rendre reproductible.
 *
 * Ce qu'il verifie, et rien de plus : que les deux portes — se connecter,
 * creer un compte — fonctionnent. Le reste de l'application peut exiger du
 * JavaScript ; un tunnel de paiement, un assistant en cinq etapes, une courbe,
 * ne se font pas sans lui. Mais si l'on ne peut pas ENTRER, rien d'autre ne
 * compte.
 *
 * Usage :
 *   node scripts/test-sans-javascript.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const DEMO = { identifiant: "vendeur@koli.ci", motDePasse: "Password123!" };

const marque = Date.now().toString().slice(-8);
const NOUVEAU = {
  nom: "Test Sans Javascript",
  telephone: `+22507${marque}`,
  motDePasse: "MotDePasseTest2026",
  boutique: "Boutique sans script",
};

let echecs = 0;
const verifier = (ok, quoi, detail = "") => {
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi}${detail ? ` — ${detail}` : ""}`);
};

console.log(`\n=== LES DEUX PORTES, SANS JAVASCRIPT (${BASE}) ===\n`);

const navigateur = await chromium.launch();

/**
 * Un onglet neuf, sans scripts.
 *
 * Un contexte par scenario : les cookies de session ne doivent pas fuir d'un
 * cas a l'autre, sinon « je viens de creer un compte » ferait passer « je me
 * connecte » sans que rien ne soit eprouve.
 */
async function ongletMuet() {
  const ctx = await navigateur.newContext({ javaScriptEnabled: false });
  return { ctx, page: await ctx.newPage() };
}

/*
 * On clique l'ETIQUETTE, comme un humain.
 *
 * La radio elle-meme est en `sr-only` — un carre d'un pixel, recouvert par
 * l'icone de la carte. `.check()` vise sa boite et se heurte au pictogramme.
 * Ce n'est pas un defaut du produit : l'`input` est DANS le `<label>`, donc
 * tout le bloc coche. Un test qui forcerait le clic (`force: true`) cesserait
 * de dire ce qu'un doigt peut faire.
 */
const choisirRole = (page, valeur) =>
  page.locator(`label:has(input[value="${valeur}"])`).click();

// ── 1. Se connecter ────────────────────────────────────────────────────────
{
  const { ctx, page } = await ongletMuet();
  await page.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });

  const scripts = await page.locator("script[src]").count();
  verifier(scripts > 0, "la page charge bien du JavaScript, qui n'est PAS execute", `${scripts} script(s) declare(s)`);

  // Un refus doit se voir. Sans cela, le test ne saurait pas distinguer
  // « refuse » de « rien ne s'est passe » — le piege documente au §8.
  await page.locator("#identifier").fill(DEMO.identifiant);
  await page.locator("#password").fill("MauvaisMotDePasse!");
  await page.getByRole("button", { name: /Se connecter/i }).click();
  await page.waitForLoadState("domcontentloaded");

  const alerte = (await page.locator('[role="alert"]').first().textContent().catch(() => "")) ?? "";
  verifier(/incorrect/i.test(alerte), "un mauvais mot de passe est refuse, et le DIT", alerte.trim().slice(0, 50));

  verifier(
    (await page.locator("#identifier").inputValue()) === DEMO.identifiant,
    "l'identifiant saisi est rendu, pour ne pas le retaper"
  );

  await page.locator("#password").fill(DEMO.motDePasse);
  await page.getByRole("button", { name: /Se connecter/i }).click();
  await page.waitForLoadState("domcontentloaded");

  verifier(/\/vendeur/.test(page.url()), "le bon mot de passe ouvre l'espace vendeur", page.url());
  verifier(
    Boolean(await page.locator("h1").first().textContent().catch(() => null)),
    "la page d'arrivee est rendue par le serveur"
  );

  await ctx.close();
}

// ── 2. Creer un compte ─────────────────────────────────────────────────────
{
  const { ctx, page } = await ongletMuet();
  await page.goto(`${BASE}/inscription`, { waitUntil: "domcontentloaded" });

  /*
   * LE controle qui a demande le plus de travail.
   *
   * Les trois blocs de champs sont tous rendus, et c'est `globals.css` qui
   * montre celui du role coche. Un rendu conditionnel en React ne produirait
   * que le bloc initial : changer de role ne ferait rien apparaitre, et le
   * formulaire demanderait le nom d'une boutique a un client.
   */
  verifier(await page.locator('[data-champs-role="SELLER"]').isVisible(), "au depart, les champs du vendeur sont visibles");
  verifier(!(await page.locator('[data-champs-role="CLIENT"]').isVisible()), "ceux du client sont masques");

  await choisirRole(page, "CLIENT");
  verifier(await page.locator('input[value="CLIENT"]').isChecked(), "cliquer la carte « Client » coche sa radio");
  verifier(await page.locator('[data-champs-role="CLIENT"]').isVisible(), "et fait apparaitre SES champs");
  verifier(!(await page.locator('[data-champs-role="SELLER"]').isVisible()), "en masquant ceux du vendeur");

  await choisirRole(page, "SELLER");
  await page.locator("#name").fill(NOUVEAU.nom);
  await page.locator("#phone").fill(NOUVEAU.telephone);
  await page.locator("#password").fill(NOUVEAU.motDePasse);
  await page.locator("#businessName").fill(NOUVEAU.boutique);
  await page.getByRole("button", { name: /Créer mon compte/i }).click();
  await page.waitForLoadState("domcontentloaded");

  verifier(/\/vendeur/.test(page.url()), "le compte est cree et l'espace vendeur s'ouvre", page.url());
  await ctx.close();
}

// ── 3. Un refus rend la saisie, jamais le mot de passe ─────────────────────
{
  const { ctx, page } = await ongletMuet();
  await page.goto(`${BASE}/inscription`, { waitUntil: "domcontentloaded" });

  await page.locator("#name").fill("Doublon Sans Script");
  await page.locator("#phone").fill(NOUVEAU.telephone); // deja pris ci-dessus
  await page.locator("#password").fill(NOUVEAU.motDePasse);
  await page.getByRole("button", { name: /Créer mon compte/i }).click();
  await page.waitForLoadState("domcontentloaded");

  const alerte = (await page.locator('[role="alert"]').first().textContent().catch(() => "")) ?? "";
  verifier(/existe déjà/i.test(alerte), "un numero deja pris est refuse, et le DIT", alerte.trim().slice(0, 45));
  verifier((await page.locator("#name").inputValue()) === "Doublon Sans Script", "le nom saisi est rendu");

  /*
   * Le mot de passe n'est JAMAIS renvoye.
   *
   * Il traverserait le reseau une seconde fois, dans une reponse, pour se
   * poser dans un attribut du document — lisible dans le cache du navigateur,
   * dans un mandataire d'entreprise, et par-dessus l'epaule.
   */
  verifier((await page.locator("#password").inputValue()) === "", "le mot de passe n'est PAS renvoye");
  await ctx.close();
}

await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "Se connecter et creer un compte fonctionnent sans une ligne de JavaScript.\n"
    : `${echecs} probleme(s) : une porte de KOLI ne s'ouvre pas sans JavaScript.\n`
);
process.exit(echecs > 0 ? 1 : 0);
