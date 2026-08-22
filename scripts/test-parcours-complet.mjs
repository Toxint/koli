/**
 * Scenario complet de bout en bout — cahier des charges §72 et §80.
 *
 * Pilote un vrai navigateur a travers tout le parcours, avec les quatre roles :
 *   vendeur cree la commande -> client paie -> vendeur assigne un livreur ->
 *   livreur valide l'OTP -> client confirme -> fonds liberes.
 *
 * Verifie au passage les garanties de securite : le vendeur ne doit pas
 * pouvoir confirmer a la place du client, et l'ancienne backdoor OTP doit
 * rester fermee.
 *
 * Usage :
 *   npm run dev            (dans un autre terminal)
 *   node scripts/test-parcours-complet.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

let etapes = 0;
let echecs = 0;

function verifier(condition, libelle, detail = "") {
  etapes++;
  if (condition) {
    console.log(`  ✓ ${libelle}`);
  } else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
}

async function connecter(page, identifiant) {
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill(identifiant);
  await page.locator("#password").fill(MDP);
  await page.locator('button[type="submit"]').first().click();
  await page
    .waitForURL((u) => !u.pathname.includes("/connexion"), { timeout: 20000 })
    .catch(() => {});
}

async function main() {
  const navigateur = await chromium.launch();
  const contexte = () =>
    navigateur.newContext({ viewport: { width: 390, height: 844 } });

  console.log("\n=== PARCOURS COMPLET KOLI (§72, §80) ===\n");

  // ---------------------------------------------------------------- 1. Vendeur
  console.log("1. Le vendeur cree une commande");
  const ctxVendeur = await contexte();
  const vendeur = await ctxVendeur.newPage();
  await connecter(vendeur, "vendeur@koli.ci");

  await vendeur.goto(`${BASE}/vendeur/commandes/nouvelle`, {
    waitUntil: "networkidle",
  });
  // Produit choisi dans le catalogue (§16) : le formulaire ne comporte plus de
  // valeurs de demonstration pre-remplies, qui faisaient partir de vraies
  // commandes sous un nom d'article fictif.
  const selecteurProduit = vendeur.locator("#productId");
  const optionProduit = await selecteurProduit.evaluate(
    (select) =>
      Array.from(select.options).find((o) =>
        /Robe Wax/i.test(o.textContent)
      )?.value
  );
  await selecteurProduit.selectOption(optionProduit);
  await vendeur.locator("#quantity").fill("1");

  const continuer = () =>
    vendeur
      .getByRole("button", { name: /Continuer/i })
      .filter({ visible: true })
      .first()
      .click();

  // Les cinq etapes du §18 : produit, client, livraison, resume, creation.
  await continuer();
  await vendeur.waitForTimeout(500);

  await vendeur.locator("#buyerName").fill("Awa Koné");
  // Le telephone du compte client de demonstration : la commande doit se
  // rattacher automatiquement a son espace.
  await vendeur.locator("#buyerPhone").fill("+2250505050505");
  await vendeur.locator("#buyerCity").fill("Abidjan");
  await vendeur.locator("#buyerAddress").fill("Cocody Angré 8e Tranche");
  await continuer();
  await vendeur.waitForTimeout(500);

  await vendeur.locator("#deliveryFee").fill("2000");
  await vendeur.locator("#buyerLandmark").fill("En face de la pharmacie");
  await continuer();
  await vendeur.waitForTimeout(500);

  await vendeur
    .getByRole("button", { name: /Créer la commande/i })
    .filter({ visible: true })
    .first()
    .click();

  await vendeur.waitForSelector("text=/KOLI-/", { timeout: 20000 });
  const texteSucces = await vendeur
    .locator("h2")
    .filter({ hasText: "KOLI-" })
    .first()
    .textContent();
  const reference = texteSucces?.match(/KOLI-[0-9A-Z]{8}/)?.[0] ?? null;

  verifier(reference !== null, "commande creee avec une reference", texteSucces ?? "");
  verifier(
    reference !== null && !/KOLI-\d{6}$/.test(reference),
    "reference non sequentielle (non devinable)"
  );
  if (!reference) {
    await navigateur.close();
    process.exit(1);
  }
  console.log(`  → ${reference}\n`);

  // ------------------------------------------------------------- 2. Paiement
  console.log("2. Le client paie via le lien");
  const ctxClient = await contexte();
  const client = await ctxClient.newPage();
  await connecter(client, "client@koli.ci");
  await client.goto(`${BASE}/pay/${reference}`, { waitUntil: "networkidle" });

  await client.locator("button", { hasText: "Simuler un paiement réussi" }).click();
  await client.waitForSelector("text=/Mode test/i", { timeout: 20000 });

  // On lit le DOM rendu plutot que le HTML brut (les accents y sont encodes),
  // et on attend explicitement l'element : `count()` ne patiente pas,
  // contrairement a `textContent()`.
  const blocCode = client.locator("span.font-mono.text-4xl").first();
  await blocCode.waitFor({ timeout: 15000 }).catch(() => {});
  const codeOtp = (await blocCode.textContent().catch(() => null))?.trim();

  verifier(
    Boolean(codeOtp),
    "le code de reception est affiche au client (§27)"
  );
  verifier(/^\d{4}$/.test(codeOtp ?? ""), "code a 4 chiffres", codeOtp ?? "");
  console.log(`  → code : ${codeOtp}\n`);

  // --------------------------------------------- 3. Le vendeur ne voit pas l'OTP
  console.log("3. Cloisonnement du code de reception");
  await vendeur.goto(`${BASE}/pay/${reference}`, { waitUntil: "networkidle" });
  const vueVendeur = await vendeur.content();
  verifier(
    !vueVendeur.includes(codeOtp ?? "@@@"),
    "le vendeur ne voit PAS le code, meme via son propre lien partage"
  );
  verifier(
    !/Oui, j'ai reçu ma commande/.test(vueVendeur),
    "le vendeur ne peut PAS confirmer la reception a la place du client"
  );
  console.log("");

  // --------------------------------------------------------- 4. Assignation
  console.log("4. Le vendeur assigne un livreur (§26)");
  await vendeur.goto(`${BASE}/vendeur/commandes`, { waitUntil: "networkidle" });
  const selecteur = vendeur.locator(`#livreur-${reference}`);
  verifier(await selecteur.count() > 0, "le selecteur de livreur est present");

  const options = await selecteur.locator("option").count();
  verifier(options > 1, "au moins un livreur disponible");

  await selecteur.selectOption({ index: 1 });
  await vendeur.locator("button", { hasText: "Assigner" }).first().click();
  await vendeur.waitForSelector("text=/Livreur :/", { timeout: 20000 });
  verifier(true, "livreur assigne");
  console.log("");

  // -------------------------------------------------------------- 5. Livreur
  console.log("5. Le livreur valide la remise");
  const ctxLivreur = await contexte();
  const livreur = await ctxLivreur.newPage();
  await connecter(livreur, "livreur@koli.ci");
  await livreur.goto(`${BASE}/livreur/dashboard`, { waitUntil: "networkidle" });

  const vueLivreur = await livreur.content();
  verifier(
    vueLivreur.includes(reference),
    "la commande apparait bien chez le livreur"
  );
  verifier(
    !vueLivreur.includes(codeOtp ?? "@@@"),
    "le livreur ne voit PAS le code (il doit le demander au client)"
  );

  await livreur
    .locator("button", { hasText: "Valider la Livraison" })
    .first()
    .click();
  await livreur.waitForSelector("#champ-otp", { timeout: 10000 });

  // Ancienne backdoor.
  await livreur.locator("#champ-otp").fill("1234");
  await livreur.locator('button[type="submit"]').last().click();
  await livreur.waitForSelector('[role="alert"]', { timeout: 15000 });
  verifier(true, "le code « 1234 » est refuse (backdoor fermee)");

  // Vrai code.
  await livreur.locator("#champ-otp").fill(codeOtp ?? "");
  await livreur.locator('button[type="submit"]').last().click();
  await livreur.waitForSelector("text=/Code OTP validé|livrée/i", {
    timeout: 20000,
  });
  verifier(true, "le vrai code est accepte");
  console.log("");

  // ------------------------------------------------- 6. Fonds encore bloques
  console.log("6. Livrer n'est pas etre paye (§29)");
  await client.goto(`${BASE}/pay/${reference}`, { waitUntil: "networkidle" });
  const avantConfirmation = await client.content();
  verifier(
    /Avez-vous reçu votre commande/.test(avantConfirmation),
    "le client est invite a confirmer la reception"
  );
  verifier(
    !/Commande terminée/.test(avantConfirmation),
    "les fonds ne sont PAS encore liberes"
  );

  // §28 : la preuve etait ecrite en base depuis la premiere livraison sans
  // jamais etre montree. Une preuve que personne ne peut consulter ne prouve
  // rien.
  const texteClient = await client.evaluate(() => document.body.innerText);
  verifier(
    /Preuve de livraison/i.test(texteClient),
    "la preuve de livraison est affichee au client (§28)"
  );
  verifier(
    new RegExp(`\\b${codeOtp}\\b`).test(texteClient),
    "elle porte le code de reception effectivement remis"
  );
  verifier(
    /Kouassi Express|Livreur/i.test(texteClient),
    "elle nomme le livreur"
  );

  await vendeur.goto(`${BASE}/vendeur/commandes?q=${reference}`, {
    waitUntil: "networkidle",
  });
  const texteVendeur = await vendeur.evaluate(() => document.body.innerText);
  verifier(
    /Remis le/i.test(texteVendeur),
    "le vendeur constate lui aussi la remise depuis ses commandes"
  );
  console.log("");

  // ------------------------------------------------------- 7. Confirmation
  console.log("7. Le client confirme, les fonds sont liberes");
  await client
    .locator("button", { hasText: "Oui, j'ai reçu ma commande" })
    .click();
  await client.waitForSelector("text=/Commande terminée/", { timeout: 20000 });
  verifier(true, "reception confirmee, commande terminee");

  await vendeur.goto(`${BASE}/vendeur/dashboard`, { waitUntil: "networkidle" });
  const vueSolde = await vendeur.content();
  verifier(
    /Solde disponible/.test(vueSolde),
    "le solde du vendeur est visible"
  );
  console.log("");

  await navigateur.close();

  console.log("=".repeat(46));
  console.log(`${etapes - echecs}/${etapes} verifications reussies`);
  console.log("=".repeat(46) + "\n");
  process.exit(echecs > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
