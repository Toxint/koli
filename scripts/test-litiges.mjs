/**
 * Litiges (§31-33), de bout en bout.
 *
 * Ce que ce test protege — ce sont des regles d'ARGENT :
 *  - le client peut contester ; c'etait impossible, le bouton etait inerte et
 *    son seul geste possible etait de confirmer, donc de payer le vendeur ;
 *  - tant que le litige est ouvert, les fonds ne bougent pas (§33) ;
 *  - le vendeur ne peut pas ouvrir un litige sur sa propre vente, ni trancher ;
 *  - seule l'administration tranche, et sa decision deplace l'argent.
 *
 * Usage :
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-litiges.mjs
 */

import { chromium } from "playwright";
import { lireUne } from "./base-donnees.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";
const marque = Date.now().toString().slice(-6);

console.log(`\n=== LITIGES depuis ${BASE} ===\n`);

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
  await page.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
  await page.locator("#identifier").fill(identifiant);
  await page.locator("#password").fill(MDP);
  await bouton(page, /^Se connecter$/).click();
  await page
    .waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 25000 })
    .catch(() => {});
};

/** Stock du produit de demonstration, lu en base. */
async function stockRobeWax() {
  const r = await lireUne(
    'SELECT quantity FROM "Product" WHERE name LIKE ?',
    "Robe Wax%"
  );
  return r?.quantity ?? null;
}

/** Lit l'etat des fonds directement en base : c'est la seule verite. */
async function fonds(reference) {
  return lireUne(
    `SELECT f.released, f.amount, o.status FROM "Fund" f
       JOIN "Order" o ON o.id = f."orderId"
      WHERE o.reference = ?`,
    reference
  );
}

// ═══════════════ 1. Le vendeur cree une commande, le client la paie
let reference = null;
{
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");

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

  await page.locator("#buyerName").fill("Awa Koné");
  await page.locator("#buyerPhone").fill("+2250505050505");
  await page.locator("#buyerCity").fill("Abidjan");
  await page.locator("#buyerAddress").fill(`Litige test ${marque}`);
  await bouton(page, /Continuer/i).click();
  await page.waitForTimeout(500);

  await page.locator("#deliveryFee").fill("2000");
  await bouton(page, /Continuer/i).click();
  await page.waitForTimeout(500);
  await bouton(page, /Créer la commande/i).click();
  await page.waitForTimeout(4000);

  const texte = await page.evaluate(() => document.body.innerText);
  reference = (texte.match(/KOLI-[2-9A-Z]{8}/) ?? [])[0];
  verifier(Boolean(reference), "commande de test creee", reference ?? "aucune");
  await ctx.close();
}

if (!reference) {
  await navigateur.close();
  console.log("\nImpossible de continuer sans commande.");
  process.exitCode = 1;
} else {
  // ═══════════════ 2. Le client paie, puis conteste
  const ctxClient = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
  });
  const client = await ctxClient.newPage();
  await connecter(client, "client@koli.ci");

  await client.goto(`${BASE}/pay/${reference}`, { waitUntil: "networkidle" });
  await bouton(client, /Simuler un paiement réussi/i).click();
  await client.waitForTimeout(4000);

  verifier((await fonds(reference))?.status === "FUNDS_SECURED", "paiement securise");

  // Le bouton doit exister AVANT toute livraison : « produit non recu ».
  const signaler = bouton(client, /Signaler un problème/i);
  verifier(
    (await signaler.count()) > 0,
    "le client peut signaler un probleme des le paiement (§31)"
  );

  await signaler.click();
  await client.waitForTimeout(500);
  await client
    .getByRole("radio", { name: /Je n'ai pas reçu le produit/i })
    .first()
    .check({ force: true });
  await client
    .locator("#description")
    .fill("Le colis n'est jamais arrive, personne ne s'est presente.");
  await bouton(client, /Envoyer le signalement/i).click();
  await client.waitForTimeout(4000);

  verifier(
    new URL(client.url()).pathname === `/litige/${reference}`,
    "le signalement mene a la page du litige",
    new URL(client.url()).pathname
  );

  const etat = (await fonds(reference));
  verifier(etat?.status === "DISPUTE_OPEN", "la commande passe en litige", etat?.status);
  verifier(etat?.released === false, "les fonds NE sont PAS liberes (§33)");

  // ═══════════════ 3. Le client ne peut plus confirmer pour debloquer
  await client.goto(`${BASE}/pay/${reference}`, { waitUntil: "networkidle" });
  const texteSuivi = await client.evaluate(() => document.body.innerText);
  verifier(
    /litige/i.test(texteSuivi) && !/Simuler un paiement/i.test(texteSuivi),
    "le suivi montre le litige et ne repropose pas de payer"
  );

  // ═══════════════ 4. Le vendeur voit le litige et peut repondre, pas trancher
  const ctxVendeur = await navigateur.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const vendeur = await ctxVendeur.newPage();
  await connecter(vendeur, "vendeur@koli.ci");
  await vendeur.goto(`${BASE}/litige/${reference}`, { waitUntil: "networkidle" });

  const texteVendeur = await vendeur.evaluate(() => document.body.innerText);
  verifier(
    /Litige/i.test(texteVendeur) && /jamais arrive/i.test(texteVendeur),
    "le vendeur mis en cause accede au litige"
  );
  verifier(
    (await bouton(vendeur, /Rendre la décision/i).count()) === 0,
    "le vendeur ne peut PAS trancher"
  );

  await vendeur.locator("#message").fill("Le colis a ete confie au livreur le 12.");
  await bouton(vendeur, /^Envoyer$/).click();
  await vendeur.waitForTimeout(3000);
  const apresMessage = await vendeur.evaluate(() => document.body.innerText);
  verifier(/confie au livreur/i.test(apresMessage), "le vendeur peut repondre");

  // ═══════════════ 5. Un tiers n'accede pas au litige
  const ctxTiers = await navigateur.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const tiers = await ctxTiers.newPage();
  await connecter(tiers, "livreur@koli.ci");
  const reponse = await tiers.goto(`${BASE}/litige/${reference}`, {
    waitUntil: "domcontentloaded",
  });
  const texteTiers = await tiers.evaluate(() => document.body.innerText);
  verifier(
    reponse?.status() === 404 || !/jamais arrive/i.test(texteTiers),
    "un tiers n'accede pas au contenu du litige",
    `statut ${reponse?.status()}`
  );
  await ctxTiers.close();

  // ═══════════════ 6. L'admin tranche
  const ctxAdmin = await navigateur.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const admin = await ctxAdmin.newPage();
  await connecter(admin, "admin@koli.ci");

  await admin.goto(`${BASE}/admin/litiges`, { waitUntil: "networkidle" });
  const listeAdmin = await admin.evaluate(() => document.body.innerText);
  verifier(
    listeAdmin.includes(reference),
    "le litige apparait dans la console d'administration"
  );

  await admin.goto(`${BASE}/litige/${reference}`, { waitUntil: "networkidle" });
  verifier(
    (await bouton(admin, /Rendre la décision/i).count()) > 0,
    "l'administration peut trancher"
  );

  // Motivation trop courte : refusee.
  await admin
    .getByRole("radio", { name: /En faveur du client/i })
    .first()
    .check({ force: true });
  await admin.locator("#motivation").fill("non");
  await bouton(admin, /Rendre la décision/i).click();
  await admin.waitForTimeout(2500);
  verifier(
    (await fonds(reference))?.status === "DISPUTE_OPEN",
    "une motivation trop courte ne tranche rien"
  );

  await admin.locator("#motivation").fill(
    "Aucune preuve de remise n'a ete produite : le client est rembourse."
  );
  await bouton(admin, /Rendre la décision/i).click();
  await admin.waitForTimeout(4000);

  const final = (await fonds(reference));
  verifier(
    final?.status === "REFUND_PENDING",
    "la commande passe en remboursement",
    final?.status
  );
  verifier(
    final?.released === false,
    "les fonds ne sont PAS verses au vendeur quand le client gagne"
  );

  // La creance de remboursement est bien inscrite.
  {
    const r = await lireUne(
      `SELECT r.amount FROM "Refund" r
         JOIN "Order" o ON o.id = r."orderId"
        WHERE o.reference = ?`,
      reference
    );
    // 18 500 d'articles + 2 000 de livraison : le client a regle les deux.
    verifier(r?.amount === 20500, "le remboursement porte sur le total regle", String(r?.amount));
  }

  // ═══════════════ 7. Un litige tranche ne se rejoue pas
  await admin.reload({ waitUntil: "networkidle" });
  const apresDecision = await admin.evaluate(() => document.body.innerText);
  verifier(
    (await bouton(admin, /Rendre la décision/i).count()) === 0,
    "le litige tranche ne propose plus de decision"
  );
  verifier(
    /Tranché en faveur du client/i.test(apresDecision),
    "l'issue est affichee aux parties"
  );

  // ═══════════════ 8. Phase 22 — le remboursement est traite
  const stockAvant = (await stockRobeWax());

  await admin.goto(`${BASE}/admin/remboursements`, { waitUntil: "networkidle" });
  const listeRemb = await admin.evaluate(() => document.body.innerText);
  verifier(
    listeRemb.includes(reference),
    "le remboursement apparait dans la console d'administration"
  );

  await bouton(admin, /^Rembourser$/).click();
  await admin.waitForTimeout(600);
  verifier(
    (await bouton(admin, /Confirmer le remboursement/i).count()) > 0,
    "rembourser demande confirmation (§58)"
  );
  verifier(
    (await fonds(reference))?.status === "REFUND_PENDING",
    "rien n'est parti tant que la confirmation n'est pas donnee"
  );

  // On ne coche PAS la restitution de stock : le colis n'a jamais ete recu,
  // mais rien ne dit qu'il soit revenu chez le vendeur.
  await bouton(admin, /Confirmer le remboursement/i).click();
  await admin.waitForTimeout(4000);

  const apresRemb = (await fonds(reference));
  verifier(
    apresRemb?.status === "REFUNDED",
    "la commande passe en remboursee",
    apresRemb?.status
  );
  verifier(
    apresRemb?.released === true,
    "le sequestre est solde : ce n'est plus un engagement de la plateforme"
  );
  verifier(
    (await stockRobeWax()) === stockAvant,
    "le stock n'est PAS remis d'office",
    `avant ${stockAvant}, apres ${(await stockRobeWax())}`
  );

  // Le journal (§40) porte le mouvement, en negatif.
  {
    const t = await lireUne(
      `SELECT t.type, t.amount FROM "Transaction" t
         JOIN "Order" o ON o.id = t."orderId"
        WHERE o.reference = ? AND t.type = 'REFUND'`,
      reference
    );
    verifier(
      t?.amount === -20500,
      "le journal inscrit le remboursement en negatif : l'argent sort",
      String(t?.amount)
    );
  }

  // ═══════════════ 9. §30 — on ne rembourse pas deux fois
  await admin.reload({ waitUntil: "networkidle" });
  verifier(
    (await bouton(admin, /^Rembourser$/).count()) === 0,
    "un remboursement traite ne se rejoue pas (§30)"
  );

  // ═══════════════ 10. Le client voit l'issue
  await client.goto(`${BASE}/pay/${reference}`, { waitUntil: "networkidle" });
  const vueClient = await client.evaluate(() => document.body.innerText);
  verifier(
    /rembours/i.test(vueClient) && !/Simuler un paiement/i.test(vueClient),
    "le client voit sa commande remboursee, sans ecran de paiement"
  );

  await ctxAdmin.close();
  await ctxVendeur.close();
  await ctxClient.close();
}

await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "Les litiges protegent bien les fonds jusqu'a la decision."
    : `${echecs} probleme(s).`
);
process.exitCode = echecs > 0 ? 1 : 0;
