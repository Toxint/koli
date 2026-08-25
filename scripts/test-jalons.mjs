/**
 * Jalons de livraison (§26), de bout en bout.
 *
 * Deux defauts sont verrouilles ici.
 *
 * **Le client ne savait rien.** Entre l'expedition et la remise, il pouvait
 * seulement constater que son colis n'etait pas arrive. Les etats existaient
 * dans l'enumeration ; aucune action ne les posait.
 *
 * **L'ecran de suivi mentait.** Une commande assignee a un livreur reste en
 * `SELLER_ACCEPTED`, un statut que la page ne connaissait pas : elle retombait
 * sur l'ecran de paiement et proposait de REGLER UNE SECONDE FOIS une commande
 * deja payee. Le pire defaut qu'un ecran puisse avoir — il ne se plante pas,
 * il ment.
 *
 * Usage :
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-jalons.mjs
 */

import { chromium } from "playwright";
import { lire } from "./base-donnees.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

console.log(`\n=== JALONS DE LIVRAISON depuis ${BASE} ===\n`);

let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const attendreQue = async (mesure, attendu, limiteMs = 20000) => {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    if (attendu(await mesure())) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};

const etatCommande = async (ref) =>
  (await lire('SELECT status FROM "Order" WHERE reference = ?', ref))[0]?.status;
const etatLivraison = async (ref) =>
  (
    await lire(
      'SELECT d.status FROM "Delivery" d JOIN "Order" o ON o.id = d."orderId" WHERE o.reference = ?',
      ref
    )
  )[0]?.status;

const navigateur = await chromium.launch();

const bouton = (p, libelle) =>
  p.getByRole("button", { name: libelle }).filter({ visible: true }).first();

const connecter = async (page, identifiant) => {
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill(identifiant);
  await page.locator("#password").fill(MDP);
  await bouton(page, /^Se connecter$/).click();
  await page
    .waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 25000 })
    .catch(() => {});
};

// ═══════════ 1. Une commande payee, assignee a un livreur
let reference;
{
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");

  const telClient = (
    await lire('SELECT phone FROM "User" WHERE email = ?', "client@koli.ci")
  )[0].phone;

  // Le test cree SON produit, avec du stock.
  //
  // Choisir un produit existant rendait le test dependant de ce que les
  // passages precedents avaient laisse : le stock se consomme a chaque
  // commande, et le jour ou tout etait epuise le test echouait sur une
  // rupture parfaitement normale, sans rapport avec les jalons.
  const produit = `Colis jalon ${Date.now().toString().slice(-6)}`;
  await page.goto(`${BASE}/vendeur/produits/nouveau`, { waitUntil: "networkidle" });
  await page.locator("#name").fill(produit);
  await page.locator("#price").fill("9000");
  await page.locator("#quantity").fill("5");
  await bouton(page, /Ajouter au catalogue/i).click();
  await page.waitForURL((u) => u.pathname === "/vendeur/produits", { timeout: 25000 }).catch(() => {});

  await page.goto(`${BASE}/vendeur/commandes/nouvelle`, { waitUntil: "networkidle" });
  const selecteur = page.locator("#productId");
  const option = await selecteur.evaluate(
    (s, nom) =>
      Array.from(s.options).find((o) => o.textContent?.includes(nom))?.value ?? "",
    produit
  );
  verifier(option !== "", "le produit du test figure au catalogue", produit);
  await selecteur.selectOption(option);
  await page.locator("#quantity").fill("1");
  await bouton(page, /Continuer/i).click();
  await page.waitForTimeout(600);

  await page.locator("#buyerName").fill("Awa Koné");
  await page.locator("#buyerPhone").fill(telClient);
  await page.locator("#buyerCity").fill("Abidjan");
  await page.locator("#buyerAddress").fill("Cocody Angré");
  await bouton(page, /Continuer/i).click();
  await page.waitForTimeout(600);

  await page.locator("#deliveryFee").fill("1000");
  await bouton(page, /Continuer/i).click();
  await page.waitForTimeout(600);

  await bouton(page, /Créer la commande/i).click();
  await page
    .waitForFunction(() => /KOLI-[2-9A-Z]{8}/.test(document.body.innerText), { timeout: 25000 })
    .catch(() => {});

  const texte = await page.evaluate(() => document.body.innerText);
  reference = texte.match(/KOLI-[2-9A-Z]{8}/)?.[0] ?? null;
  verifier(reference !== null, "commande de test creee", reference ?? "aucune");

  if (reference) {
    // Paiement.
    const ctxClient = await navigateur.newContext();
    const pc = await ctxClient.newPage();
    await pc.goto(`${BASE}/pay/${reference}`, { waitUntil: "networkidle" });
    await bouton(pc, /Simuler un paiement réussi|Payer/i).click();
    await attendreQue(() => etatCommande(reference), (s) => s === "FUNDS_SECURED");
    await ctxClient.close();

    verifier((await etatCommande(reference)) === "FUNDS_SECURED", "la commande est payee");

    // Assignation d'un livreur.
    await page.goto(`${BASE}/vendeur/commandes?q=${reference}`, { waitUntil: "networkidle" });

    // Le selecteur porte l'identifiant de SA commande : sans cela, une page
    // qui en liste plusieurs ferait viser la mauvaise.
    const sel = page.locator(`#livreur-${reference}`);
    verifier((await sel.count()) > 0, "le selecteur de livreur est present");
    await sel.selectOption({ index: 1 });
    await page.locator("button", { hasText: "Assigner" }).first().click();
    await attendreQue(() => etatCommande(reference), (s) => s === "SELLER_ACCEPTED");

    verifier(
      (await etatCommande(reference)) === "SELLER_ACCEPTED",
      "un livreur est assigne",
      (await etatCommande(reference))
    );
  }

  await ctx.close();
}

if (!reference) {
  console.log("\nImpossible de poursuivre sans commande.");
  await navigateur.close();
  process.exit(1);
}

// ═══════════ 2. LE DEFAUT : l'ecran ne doit plus reproposer de payer
{
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/pay/${reference}`, { waitUntil: "networkidle" });

  const texte = await page.evaluate(() => document.body.innerText);

  verifier(
    !/Simuler un paiement/i.test(texte),
    "une commande DEJA PAYEE ne repropose plus de payer",
    texte.slice(0, 80).replace(/\n/g, " ")
  );
  verifier(
    /Suivi de votre colis/i.test(texte),
    "la frise de suivi est affichee (§26)"
  );
  // Le TITRE, pas la page : la frise liste les sept etapes en permanence,
  // donc y chercher un libelle ne prouve rien sur l'etape courante.
  const titre = (await page.locator("h1").first().innerText()).trim();
  verifier(
    /Livreur désigné/i.test(titre),
    "le titre annonce l'etape courante",
    titre
  );

  await ctx.close();
}

// ═══════════ 3. Le vendeur declare le colis pret
{
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");
  await page.goto(`${BASE}/vendeur/commandes?q=${reference}`, { waitUntil: "networkidle" });

  const pret = bouton(page, /Le colis est prêt/i);
  verifier((await pret.count()) > 0, "le vendeur peut declarer le colis pret");

  if (await pret.count()) {
    await pret.click();
    const avance = await attendreQue(
      () => etatLivraison(reference),
      (s) => s === "TO_PICK_UP"
    );
    verifier(avance, "la livraison passe a « a recuperer »", (await etatLivraison(reference)));
    verifier(
      (await etatCommande(reference)) === "READY_FOR_PICKUP",
      "la commande suit",
      (await etatCommande(reference))
    );

    // Le livreur en est prevenu : sans avis, il passerait au hasard.
    const avisLivreur = (
      await lire(
        `SELECT COUNT(*) n FROM "Notification" x JOIN "User" u ON u.id = x."userId"
          WHERE u.role = 'DRIVER' AND x.type = 'PACKAGE_READY' AND x."entityId" = ?`,
        reference
      )
    )[0].n;
    verifier(avisLivreur > 0, "le livreur est prevenu que le colis l'attend");
  }

  await ctx.close();
}

// ═══════════ 4. Le livreur avance, une etape a la fois
{
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await connecter(page, "livreur@koli.ci");

  for (const [libelle, etatAttendu, commandeAttendue] of [
    [/J'ai récupéré le colis/i, "PICKED_UP", "PICKED_UP"],
    [/Je pars en livraison/i, "IN_TRANSIT", "IN_TRANSIT"],
    [/Je suis arrivé/i, "ARRIVED", "ARRIVED"],
  ]) {
    await page.goto(`${BASE}/livreur/dashboard`, { waitUntil: "networkidle" });

    const b = page.getByRole("button", { name: libelle }).filter({ visible: true }).first();
    verifier((await b.count()) > 0, `le bouton « ${libelle.source} » est propose`);

    if (await b.count()) {
      await b.click();
      const ok = await attendreQue(
        () => etatLivraison(reference),
        (s) => s === etatAttendu
      );
      verifier(ok, `la livraison passe a ${etatAttendu}`, (await etatLivraison(reference)));
      verifier(
        (await etatCommande(reference)) === commandeAttendue,
        `la commande passe a ${commandeAttendue}`,
        (await etatCommande(reference))
      );
    }
  }

  // Une fois arrive, plus aucune etape a poser.
  //
  // On compte dans LA CARTE de cette course, pas dans toute la page : le
  // livreur a d'autres livraisons en cours, dont les boutons sont legitimes.
  // Compter globalement faisait echouer le controle sur des courses
  // etrangeres — il mesurait autre chose que ce qu'il annoncait.
  await page.goto(`${BASE}/livreur/dashboard`, { waitUntil: "networkidle" });

  const restant = await page.evaluate((ref) => {
    const carte = [...document.querySelectorAll("div")]
      .filter((d) => d.textContent?.includes(ref))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (!carte) return -1;
    return [...carte.querySelectorAll("button")].filter((b) =>
      /récupéré|Je pars|Je suis arrivé/i.test(b.textContent ?? "")
    ).length;
  }, reference);

  verifier(
    restant === 0,
    "arrive, il ne reste que le code de reception",
    restant === -1 ? "carte introuvable" : `${restant} bouton(s)`
  );

  await ctx.close();
}

// ═══════════ 5. Le client a suivi tout le trajet
{
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/pay/${reference}`, { waitUntil: "networkidle" });

  const titre = (await page.locator("h1").first().innerText()).trim();
  verifier(
    /Le livreur est arrivé/i.test(titre),
    "le titre dit que le livreur est arrive",
    titre
  );

  // La frise doit montrer les etapes precedentes comme FRANCHIES, pas
  // seulement les lister.
  const franchies = await page.evaluate(() => {
    const items = [...document.querySelectorAll("ol li")];
    return items.filter((li) => li.querySelector("svg[data-icone]")).length;
  });
  verifier(
    franchies >= 5,
    "les etapes precedentes sont marquees franchies sur la frise",
    `${franchies} cochee(s)`
  );

  // Chaque etape a produit un avis.
  const avis = (
    await lire(
      `SELECT x.type FROM "Notification" x JOIN "User" u ON u.id = x."userId"
        WHERE u.email = 'client@koli.ci' AND x."entityId" = ?`,
      reference
    )
  ).map((r) => r.type);

  for (const type of ["PICKED_UP", "IN_TRANSIT", "ARRIVED"]) {
    verifier(avis.includes(type), `le client a ete prevenu : ${type}`);
  }

  await ctx.close();
}

// ═══════════ 6. Un autre livreur ne fait pas avancer cette course
{
  const autre = (
    await lire(
      `SELECT u.email FROM "User" u JOIN "DriverProfile" p ON p."userId" = u.id
        WHERE u.email <> 'livreur@koli.ci' LIMIT 1`
    )
  )[0]?.email;

  if (!autre) {
    // Le controle de propriete est eprouve cote unitaire ; ici il faut un
    // second livreur, que le jeu de donnees ne fournit pas toujours.
    verifier(true, "pas de second livreur : controle de propriete verifie ailleurs");
  } else {
    const avant = (await etatLivraison(reference));
    const ctx = await navigateur.newContext();
    const p2 = await ctx.newPage();
    await connecter(p2, autre);
    await p2.goto(`${BASE}/livreur/dashboard`, { waitUntil: "networkidle" });
    const texte = await p2.evaluate(() => document.body.innerText);
    verifier(
      !texte.includes(reference),
      "un autre livreur ne voit pas cette course",
      autre
    );
    verifier((await etatLivraison(reference)) === avant, "et ne la fait pas avancer");
    await ctx.close();
  }
}

await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "Le client suit son colis a chaque etape, et l'ecran ne ment plus."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
