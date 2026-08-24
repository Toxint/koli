/**
 * Parcours catalogue produits (§16-17), de bout en bout, dans un vrai
 * navigateur et depuis l'adresse reseau.
 *
 * Ce que ce test protege, precisement :
 *  - un produit du catalogue impose SON prix a la commande (le formulaire ne
 *    peut pas fabriquer un montant) ;
 *  - un produit en rupture n'est pas commandable ;
 *  - le stock est decompte au PAIEMENT, pas a la creation du lien — sans quoi
 *    tout lien abandonne immobiliserait l'inventaire.
 *
 * Usage :
 *   BASE_URL=http://172.20.10.7:3000 node scripts/test-catalogue.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";
const marque = Date.now().toString().slice(-6);
const PRODUIT = `Pagne test ${marque}`;
/** Cree a stock nul par le test lui-meme, pour eprouver la rupture. */
const PRODUIT_EPUISE = `Sandale epuisee ${marque}`;
const PRIX = 7500;

console.log(`\n=== CATALOGUE PRODUITS depuis ${BASE} ===\n`);

const navigateur = await chromium.launch();
let echecs = 0;

const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

/**
 * Le bouton de deconnexion du menu est lui aussi un `button[type=submit]` et
 * precede le formulaire dans le DOM. On vise donc le bouton par son libelle et
 * on exige qu'il soit VISIBLE : a 390px, le menu de bureau existe mais est
 * masque, et cliquer dessus n'aurait aucun sens.
 */
const bouton = (p, libelle) =>
  p.getByRole("button", { name: libelle }).filter({ visible: true }).first();

// Telephone : 90 % des vendeurs cibles sont sur mobile.
const ctx = await navigateur.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 140)));

const connexion = async (identifiant) => {
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill(identifiant);
  await page.locator("#password").fill(MDP);
  await bouton(page, /connecter/i).click();
  await page.waitForTimeout(3500);
};

// ------------------------------------------------------- 1. Acces au catalogue
await connexion("vendeur@koli.ci");
verifier(
  new URL(page.url()).pathname === "/vendeur/dashboard",
  "connexion vendeur"
);

await page.goto(`${BASE}/vendeur/produits`, { waitUntil: "networkidle" });
let texte = await page.evaluate(() => document.body.innerText);
verifier(
  new URL(page.url()).pathname === "/vendeur/produits",
  "le catalogue est accessible"
);
verifier(texte.length > 40, "le catalogue affiche du contenu", `${texte.length} car.`);
verifier(
  /Robe Wax|Sac en Cuir/i.test(texte),
  "les produits de demonstration sont listes"
);
// -------------------------------------------------------- 2. Creation produit
//
// Deux produits : celui du parcours, et un a stock NUL pour eprouver la
// rupture.
//
// Ce second produit etait auparavant celui du jeu de donnees initial
// (« Sandales cuir tressé », cree a zero). Mais un vendeur peut le
// reapprovisionner depuis l'application — c'est meme le geste normal —, et le
// test se mettait alors a echouer sur une rupture qui n'existait plus, sans
// que rien ne soit casse. Un test doit etablir lui-meme ce qu'il verifie.
await page.goto(`${BASE}/vendeur/produits/nouveau`, {
  waitUntil: "networkidle",
});
await page.locator("#name").fill(PRODUIT_EPUISE);
await page.locator("#price").fill("12000");
await page.locator("#quantity").fill("0");
await page.locator("#category").selectOption("Mode et vêtements");
await bouton(page, /Ajouter au catalogue/i).click();
await page.waitForTimeout(3500);

texte = await page.evaluate(() => document.body.innerText);
verifier(
  texte.includes(PRODUIT_EPUISE),
  "un produit peut etre cree a stock nul"
);
verifier(
  /rupture/i.test(texte),
  "un produit a stock nul est signale en rupture"
);

await page.goto(`${BASE}/vendeur/produits/nouveau`, {
  waitUntil: "networkidle",
});
await page.locator("#name").fill(PRODUIT);
await page.locator("#price").fill(String(PRIX));
await page.locator("#quantity").fill("4");
await page.locator("#category").selectOption("Mode et vêtements");
await bouton(page, /Ajouter au catalogue/i).click();
await page.waitForTimeout(3500);

texte = await page.evaluate(() => document.body.innerText);
verifier(
  new URL(page.url()).pathname === "/vendeur/produits",
  "la creation renvoie au catalogue",
  `URL : ${new URL(page.url()).pathname}`
);
verifier(texte.includes(PRODUIT), "le nouveau produit apparait au catalogue");

// -------------------------------------------- 3. Refus du doublon de nom
await page.goto(`${BASE}/vendeur/produits/nouveau`, {
  waitUntil: "networkidle",
});
await page.locator("#name").fill(PRODUIT);
await page.locator("#price").fill("9000");
await page.locator("#quantity").fill("2");
await bouton(page, /Ajouter au catalogue/i).click();
await page.waitForTimeout(3000);
verifier(
  (await page.locator('[role="alert"]').first().count()) > 0,
  "un nom deja utilise est refuse avec un message"
);

// ------------------------------- 4. Le prix du catalogue s'impose a la commande
await page.goto(`${BASE}/vendeur/commandes/nouvelle`, {
  waitUntil: "networkidle",
});

const selecteur = page.locator("#productId");
verifier(
  (await selecteur.count()) > 0,
  "le formulaire de commande propose le catalogue"
);

// `selectOption` n'accepte pas d'expression reguliere : on releve la valeur de
// l'option dont le libelle porte le nom du produit.
const valeurOption = await selecteur.evaluate(
  (select, nom) =>
    Array.from(select.options).find((o) => o.textContent.includes(nom))?.value,
  PRODUIT
);
verifier(Boolean(valeurOption), "le produit cree figure dans la liste deroulante");
await selecteur.selectOption(valeurOption);
await page.waitForTimeout(600);

const prixLu = await page.locator("#unitPrice").inputValue();
const nomLu = await page.locator("#productName").inputValue();
verifier(nomLu === PRODUIT, "le nom se remplit depuis le catalogue", nomLu);
verifier(
  Number(prixLu) === PRIX,
  "le prix se remplit depuis le catalogue",
  `lu : ${prixLu}`
);
verifier(
  await page.locator("#unitPrice").evaluate((el) => el.readOnly),
  "le prix d'un produit du catalogue n'est pas modifiable ici"
);

// Un produit en rupture ne doit pas etre selectionnable.
//
// Le controle etait enferme dans un `if` : sans option en rupture il
// disparaissait sans un mot, et son silence se lisait comme une reussite. Le
// test creant desormais lui-meme un produit a stock nul, l'option DOIT etre la.
const optionRupture = page.locator("#productId option", {
  hasText: PRODUIT_EPUISE,
});
verifier(
  (await optionRupture.count()) > 0,
  "le produit epuise figure bien dans la liste deroulante"
);
verifier(
  (await optionRupture.count()) > 0 &&
    (await optionRupture.first().evaluate((el) => el.disabled)),
  "un produit en rupture n'est pas selectionnable"
);

// -------------------------------------- 5. Commande, puis decompte au paiement
// Le formulaire suit desormais les cinq etapes du §18 : produit, client,
// livraison, resume, creation.
await page.locator("#quantity").fill("2");
await bouton(page, /Continuer/i).click();
await page.waitForTimeout(500);

await page.locator("#buyerName").fill("Awa Koné");
await page.locator("#buyerPhone").fill("+2250505050505");
await page.locator("#buyerCity").fill("Abidjan");
await page.locator("#buyerAddress").fill("Cocody Angré");
await bouton(page, /Continuer/i).click();
await page.waitForTimeout(500);

await page.locator("#deliveryFee").fill("1000");
await bouton(page, /Continuer/i).click();
await page.waitForTimeout(500);

await bouton(page, /Créer la commande/i).click();
await page.waitForTimeout(4000);

texte = await page.evaluate(() => document.body.innerText);
const reference = (texte.match(/KOLI-[2-9A-Z]{8}/) ?? [])[0];
verifier(Boolean(reference), "la commande est creee", reference ?? "aucune reference");

// Total attendu : 2 x 7500 + 1000 = 16 000 FCFA, au prix du CATALOGUE.
// Le formulaire ne peut pas l'avoir fabrique : le champ etait en lecture seule.
if (reference) {
  const pagePaiement = await ctx.newPage();
  await pagePaiement.goto(`${BASE}/pay/${reference}`, {
    waitUntil: "networkidle",
  });
  const texteP = await pagePaiement.evaluate(() => document.body.innerText);
  const chiffres = texteP.replace(/[\s  ]/g, "");
  verifier(
    chiffres.includes("16000"),
    "le total applique bien le prix du catalogue (16 000 FCFA)"
  );
  await pagePaiement.close();
}

// Le stock ne doit PAS avoir bouge : la commande n'est pas payee.
await page.goto(`${BASE}/vendeur/produits?q=${encodeURIComponent(PRODUIT)}`, {
  waitUntil: "networkidle",
});
texte = await page.evaluate(() => document.body.innerText);
verifier(
  /Stock\s*:\s*4/.test(texte),
  "un lien de paiement non regle n'immobilise pas le stock",
  texte.match(/Stock\s*:\s*\d+/)?.[0] ?? "stock illisible"
);

// Paiement, puis re-verification du stock.
if (reference) {
  const pagePaiement = await ctx.newPage();
  await pagePaiement.goto(`${BASE}/pay/${reference}`, {
    waitUntil: "networkidle",
  });
  const boutonPayer = bouton(pagePaiement, /payer|confirmer|simuler/i);
  if (await boutonPayer.count()) {
    await boutonPayer.click();
    await pagePaiement.waitForTimeout(4500);
  }
  await pagePaiement.close();

  await page.goto(`${BASE}/vendeur/produits?q=${encodeURIComponent(PRODUIT)}`, {
    waitUntil: "networkidle",
  });
  texte = await page.evaluate(() => document.body.innerText);
  verifier(
    /Stock\s*:\s*2/.test(texte),
    "le stock est decompte au paiement (4 - 2 = 2)",
    texte.match(/Stock\s*:\s*\d+/)?.[0] ?? "stock illisible"
  );
}

// ------------------------------------------------ 6. Cloisonnement entre vendeurs
// Un identifiant de produit valide, consulte depuis un AUTRE compte, doit
// renvoyer 404 et non la fiche.
await page.goto(`${BASE}/vendeur/produits`, { waitUntil: "networkidle" });
const lienModifier = page.getByRole("link", { name: /Modifier/i }).first();
const hrefProduit = await lienModifier.getAttribute("href");

if (hrefProduit) {
  const ctxAutre = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
  });
  const pageAutre = await ctxAutre.newPage();
  await pageAutre.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await pageAutre.locator("#identifier").fill("client@koli.ci");
  await pageAutre.locator("#password").fill(MDP);
  await bouton(pageAutre, /connecter/i).click();
  await pageAutre.waitForTimeout(3500);

  const reponse = await pageAutre.goto(`${BASE}${hrefProduit}`, {
    waitUntil: "networkidle",
  });
  const urlFinale = new URL(pageAutre.url()).pathname;
  // Le critere n'est ni le code de retour ni la presence du nom du produit :
  // le middleware redirige un client vers SON espace (200 legitime), ou le
  // produit qu'il vient de commander s'affiche a bon droit. Ce qui compte est
  // qu'il n'obtienne pas le FORMULAIRE D'EDITION du catalogue.
  const formulaireEdition =
    (await pageAutre.locator("#price").count()) > 0 &&
    (await pageAutre.locator("#quantity").count()) > 0;

  verifier(
    !urlFinale.startsWith("/vendeur/") && !formulaireEdition,
    "un non-vendeur n'obtient pas le formulaire d'edition d'une fiche produit",
    `statut ${reponse?.status()} — ${urlFinale}`
  );
  await ctxAutre.close();
}

verifier(erreurs.length === 0, "aucune erreur JavaScript", erreurs[0] ?? "");

await ctx.close();
await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "Le catalogue produits fonctionne de bout en bout."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
