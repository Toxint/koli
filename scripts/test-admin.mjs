/**
 * Espace administrateur (§34-36), de bout en bout, depuis l'adresse reseau.
 *
 * Ce que ce test protege :
 *  - le tableau de bord affiche bien TOUTES les rubriques du §34, y compris
 *    celles dont la table est encore vide (litiges, remboursements) ;
 *  - la projection de commission est presentee comme une projection et non
 *    comme un revenu acquis ;
 *  - la decision de verification d'un vendeur (§36) persiste et n'est pas
 *    accessible a un non-administrateur ;
 *  - les filtres role / etat du compte sont deux notions distinctes.
 *
 * Usage :
 *   BASE_URL=http://172.20.10.7:3000 node scripts/test-admin.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

console.log(`\n=== ESPACE ADMINISTRATEUR depuis ${BASE} ===\n`);

const navigateur = await chromium.launch();
let echecs = 0;

const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const bouton = (p, libelle) =>
  p.getByRole("button", { name: libelle }).filter({ visible: true }).first();

const connexion = async (page, identifiant) => {
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill(identifiant);
  await page.locator("#password").fill(MDP);
  await bouton(page, /connecter/i).click();
  await page.waitForTimeout(3500);
};

// Telephone : c'est l'appareil de l'immense majorite des utilisateurs.
const ctx = await navigateur.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 140)));

// ------------------------------------------------- 1. Tableau de bord (§34)
await connexion(page, "admin@koli.ci");
verifier(
  new URL(page.url()).pathname === "/admin/dashboard",
  "connexion administrateur"
);

let texte = await page.evaluate(() => document.body.innerText);

const RUBRIQUES = [
  [/utilisateurs/i, "utilisateurs"],
  [/vendeurs vérifiés/i, "vendeurs"],
  [/commandes/i, "commandes"],
  [/paiements réussis/i, "paiements test"],
  [/fonds séquestrés/i, "fonds sécurisés test"],
  [/fonds libérés/i, "fonds libérés test"],
  [/litiges/i, "litiges"],
  [/remboursements/i, "remboursements"],
  [/commission/i, "commissions"],
  [/activités récentes/i, "activités récentes"],
];

for (const [motif, nom] of RUBRIQUES) {
  verifier(motif.test(texte), `le §34 exige « ${nom} » : rubrique presente`);
}

verifier(
  /mode test/i.test(texte),
  "le mode test est signale sur les montants (§75)"
);

// La projection de commission ne doit jamais se lire comme un revenu acquis.
verifier(
  /aucun prélèvement n'est effectué/i.test(texte),
  "la commission est presentee comme une projection, pas comme un revenu"
);

// Les activites recentes doivent contenir de vraies lignes, pas un vide.
verifier(
  /KOLI-[2-9A-Z]{8}/.test(texte),
  "les activites recentes citent des commandes reelles"
);

// ---------------------------------------------- 2. Tuiles cliquables
const lienSuspendus = page
  .getByRole("link", { name: /comptes suspendus/i })
  .filter({ visible: true })
  .first();
if (await lienSuspendus.count()) {
  await lienSuspendus.click();
  await page.waitForTimeout(2500);
  const url = new URL(page.url());
  verifier(
    url.pathname === "/admin/utilisateurs" &&
      url.searchParams.get("compte") === "SUSPENDED",
    "la tuile « comptes suspendus » filtre sur l'etat du compte",
    `${url.pathname}?${url.searchParams}`
  );

  // Le filtre doit porter sur l'etat du compte et non sur le role : avec
  // l'ancien parametre unique « statut », cette URL ne renvoyait rien.
  texte = await page.evaluate(() => document.body.innerText);
  verifier(
    !/Aucun utilisateur ne correspond/i.test(texte) ||
      /0 compte/i.test(texte) ||
      /compte\(s\)/i.test(texte),
    "la page des utilisateurs repond au filtre d'etat de compte"
  );
}

// -------------------------------------------------- 3. Vendeurs (§36)
await page.goto(`${BASE}/admin/vendeurs`, { waitUntil: "networkidle" });
texte = await page.evaluate(() => document.body.innerText);

verifier(
  new URL(page.url()).pathname === "/admin/vendeurs",
  "la page des vendeurs est accessible"
);
verifier(
  /Boutique Chic/.test(texte),
  "le vendeur de demonstration est liste"
);
for (const [motif, nom] of [
  [/vérification|vérifié|en attente/i, "statut de vérification"],
  // « 3 commandes » et non « 3 commande(s) » : l'accord est fait en francais.
  [/\d+ commandes?\b/i, "commandes"],
  [/chiffre d'affaires/i, "chiffre d'affaires"],
]) {
  verifier(motif.test(texte), `le §36 exige « ${nom} » : colonne presente`);
}

// -------------------------------- 4. La decision de verification persiste
const boutonVerifier = bouton(page, /^Vérifier$/);
const boutonRejeter = bouton(page, /^Rejeter$/);

if (await boutonRejeter.count()) {
  await boutonRejeter.click();
  await page.waitForTimeout(400);

  // §58 : une action sensible se confirme.
  const confirmation = bouton(page, /^Confirmer$/);
  verifier(
    (await confirmation.count()) > 0,
    "rejeter un vendeur demande une confirmation (§58)"
  );
  await confirmation.click();
  await page.waitForTimeout(3000);

  await page.reload({ waitUntil: "networkidle" });
  texte = await page.evaluate(() => document.body.innerText);
  verifier(
    /Rejeté/.test(texte),
    "la decision de rejet persiste apres rechargement"
  );

  // On remet le vendeur en etat verifie, pour ne pas laisser la base
  // de demonstration dans un etat degrade.
  const remettre = bouton(page, /^Vérifier$/);
  if (await remettre.count()) {
    await remettre.click();
    await page.waitForTimeout(400);
    await bouton(page, /^Confirmer$/).click();
    await page.waitForTimeout(3000);
    await page.reload({ waitUntil: "networkidle" });
    texte = await page.evaluate(() => document.body.innerText);
    verifier(
      /Vérifié/.test(texte),
      "la remise en verifie persiste egalement"
    );
  }
} else if (await boutonVerifier.count()) {
  verifier(false, "aucun bouton de rejet trouve sur la page des vendeurs");
}

// ------------------------------- 5. Cloisonnement : un vendeur n'entre pas
const ctxVendeur = await navigateur.newContext({
  viewport: { width: 390, height: 844 },
});
const pageVendeur = await ctxVendeur.newPage();
await connexion(pageVendeur, "vendeur@koli.ci");
await pageVendeur.goto(`${BASE}/admin/vendeurs`, { waitUntil: "networkidle" });

const urlVendeur = new URL(pageVendeur.url()).pathname;
const texteVendeur = await pageVendeur.evaluate(() => document.body.innerText);
verifier(
  !urlVendeur.startsWith("/admin/") &&
    !/chiffre d'affaires/i.test(texteVendeur),
  "un vendeur n'accede pas a la console d'administration",
  urlVendeur
);
await ctxVendeur.close();

verifier(erreurs.length === 0, "aucune erreur JavaScript", erreurs[0] ?? "");

await ctx.close();
await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "L'espace administrateur repond aux §34-36."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
