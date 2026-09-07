/**
 * Assistant de creation de commande en 5 etapes (§18).
 *
 * Ce que ce test protege :
 *  - on ne franchit PAS une etape incomplete (sinon le vendeur decouvre le
 *    probleme au bout du parcours, apres avoir tout saisi) ;
 *  - revenir en arriere ne perd pas la saisie ;
 *  - le resume affiche le total reellement calcule, et « Modifier » ramene
 *    bien a la bonne etape ;
 *  - vider un champ apres coup ne permet pas de creer quand meme.
 *
 * Usage :
 *   BASE_URL=http://172.20.10.7:3000 node scripts/test-commande-etapes.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

console.log(`\n=== ASSISTANT DE COMMANDE EN 5 ETAPES depuis ${BASE} ===\n`);

const navigateur = await chromium.launch();
let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const ctx = await navigateur.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 140)));

const bouton = (libelle) =>
  page.getByRole("button", { name: libelle }).filter({ visible: true }).first();

const etapeCourante = async () => {
  const t = await page.evaluate(() => document.body.innerText);
  // Le tiret cadratin distingue la ligne VISIBLE des libelles destines aux
  // lecteurs d'ecran, qui utilisent « : » et enumerent les cinq etapes.
  const m = t.match(/Étape (\d) sur 5 —/);
  return m ? Number(m[1]) : null;
};

await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
await page.locator("#identifier").fill("vendeur@koli.ci");
await page.locator("#password").fill(MDP);
await bouton(/connecter/i).click();
await page.waitForTimeout(3500);

await page.goto(`${BASE}/vendeur/commandes/nouvelle`, {
  waitUntil: "networkidle",
});

// ----------------------------------------------- 1. Les cinq etapes existent
verifier((await etapeCourante()) === 1, "l'assistant demarre a l'etape 1");
const texte0 = await page.evaluate(() => document.body.innerText);
verifier(/Produit/i.test(texte0), "l'etape 1 porte bien sur le produit");

// ------------------------------------- 2. Une etape incomplete ne passe pas
await bouton(/Continuer/i).click();
await page.waitForTimeout(400);
verifier(
  (await etapeCourante()) === 1,
  "une etape 1 vide ne laisse pas passer",
  `etape ${await etapeCourante()}`
);
verifier(
  (await page.locator('[role="alert"]').count()) > 0,
  "un message explique ce qui manque"
);

// ------------------------------------------------- 3. Etape 1 renseignee
/*
 * Le produit est choisi pour son STOCK, jamais par son nom.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Il demandait « Robe Wax », quantite 2. Le jeu de demonstration lui en   │
 * │  donne 15 — mais chaque campagne en consomme, et le stock ne se rend     │
 * │  pas tout seul.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le 7 septembre 2026, il en restait UN. Le formulaire a refuse, a juste
 * titre, et le controle est tombe sur « l'etape 1 valide mene a l'etape 2 » —
 * pour une raison entierement etrangere a ce qu'il verifie, qui est
 * l'enchainement des etapes.
 *
 * C'est le defaut deja decrit dans CLAUDE.md a propos de `verif:courbes` : un
 * controle qui lit les restes d'un autre. Il lit desormais le stock annonce
 * dans le libelle de l'option — « Pagne … (stock : 6) » — et prend celui qui
 * en a le plus. S'il n'en trouve aucun, il le DIT au lieu d'echouer sur un
 * symptome sans rapport.
 */
const QUANTITE = 2;
const FRAIS_LIVRAISON = 1500;
const selecteur = page.locator("#productId");
const choix = await selecteur.evaluate((s, mini) => {
  let meilleur = null;
  for (const o of Array.from(s.options)) {
    const texte = o.textContent ?? "";
    const m = /\(stock : (\d+)\)/.exec(texte);
    if (!m) continue;
    const stock = Number(m[1]);

    /*
     * Le prix se lit dans le meme libelle : « Nom — 18 500 FCFA (stock : 6) ».
     * Les espaces sont INSECABLES (U+202F) : on retire tout ce qui n'est pas
     * un chiffre plutot que de deviner lequel separe quoi.
     */
    const entre = texte.split("—")[1]?.split("(stock")[0] ?? "";
    const prix = Number(entre.replace(/\D/g, ""));
    if (!prix) continue;

    if (stock >= mini && (!meilleur || stock > meilleur.stock)) {
      meilleur = { valeur: o.value, stock, prix, nom: texte.split("—")[0].trim() };
    }
  }
  return meilleur;
}, QUANTITE);

verifier(
  choix !== null,
  `un produit du catalogue a au moins ${QUANTITE} en stock`,
  choix ? `${choix.nom} (stock : ${choix.stock})` : "aucun — relancer npm run base:preparer"
);
if (!choix) {
  console.log("");
  console.log("  Le catalogue est epuise : la suite ne prouverait rien.");
  console.log("");
  await navigateur.close();
  process.exit(1);
}

await selecteur.selectOption(choix.valeur);
await page.locator("#quantity").fill(String(QUANTITE));
await bouton(/Continuer/i).click();
await page.waitForTimeout(500);
verifier((await etapeCourante()) === 2, "l'etape 1 valide mene a l'etape 2");

// -------------------------- 4. Telephone invalide : l'etape 2 ne passe pas
await page.locator("#buyerName").fill("Awa Koné");
await page.locator("#buyerPhone").fill("123");
await page.locator("#buyerCity").fill("Abidjan");
await page.locator("#buyerAddress").fill("Cocody Angré");
await bouton(/Continuer/i).click();
await page.waitForTimeout(400);
verifier(
  (await etapeCourante()) === 2,
  "un telephone trop court bloque l'etape 2"
);

// -------------------------------- 5. Email mal forme : refuse lui aussi
await page.locator("#buyerPhone").fill("+2250505050505");
await page.locator("#buyerEmail").fill("pas-un-email");
await bouton(/Continuer/i).click();
await page.waitForTimeout(400);
verifier(
  (await etapeCourante()) === 2,
  "un e-mail mal forme bloque l'etape 2 (facultatif, mais valide s'il est saisi)"
);

await page.locator("#buyerEmail").fill("awa@exemple.ci");
await bouton(/Continuer/i).click();
await page.waitForTimeout(500);
verifier((await etapeCourante()) === 3, "l'etape 2 valide mene a l'etape 3");

// ------------------------------------- 6. Retour arriere : rien n'est perdu
await bouton(/Précédent/i).click();
await page.waitForTimeout(500);
verifier((await etapeCourante()) === 2, "« Précédent » revient a l'etape 2");
verifier(
  (await page.locator("#buyerName").inputValue()) === "Awa Koné",
  "le nom saisi est conserve"
);
verifier(
  (await page.locator("#buyerEmail").inputValue()) === "awa@exemple.ci",
  "l'e-mail saisi est conserve"
);

await bouton(/Continuer/i).click();
await page.waitForTimeout(500);

// ------------------------------------------------- 7. Etape 3 puis resume
await page.locator("#deliveryFee").fill(String(FRAIS_LIVRAISON));
await page.locator("#buyerLandmark").fill("Face pharmacie");
await bouton(/Continuer/i).click();
await page.waitForTimeout(500);
verifier((await etapeCourante()) === 4, "l'etape 3 mene au resume");

const texteResume = await page.evaluate(() => document.body.innerText);
const chiffres = texteResume.replace(/[\s  ]/g, "");

/*
 * Le total attendu est CALCULE depuis le produit reellement choisi.
 *
 * Il valait « 38 500 » en dur — 2 x 18 500 + 1 500, le prix de la Robe Wax.
 * Depuis que le produit est choisi pour son stock et non pour son nom, ce
 * nombre ne veut plus rien dire : le controle tombait en annoncant un total
 * exact qui n'etait exact que pour un article qu'il n'avait pas pris.
 *
 * Un attendu code en dur decrit le jeu de donnees, pas la regle. Celui-ci
 * decrit la regle : prix x quantite + frais de livraison.
 */
const attendu = choix.prix * QUANTITE + FRAIS_LIVRAISON;
verifier(
  chiffres.includes(String(attendu)),
  `le resume affiche le total exact (${QUANTITE} × ${choix.prix} + ${FRAIS_LIVRAISON})`,
  `attendu ${attendu}`
);
verifier(
  /awa@exemple\.ci/i.test(texteResume),
  "le resume reprend l'e-mail facultatif"
);
verifier(
  /Face pharmacie/i.test(texteResume),
  "le resume reprend le repere de livraison"
);

// -------------------------------- 8. « Modifier » ramene a la bonne etape
await page
  .getByRole("button", { name: /^Modifier$/ })
  .filter({ visible: true })
  .first()
  .click();
await page.waitForTimeout(500);
verifier(
  (await etapeCourante()) === 1,
  "« Modifier » sur le bloc Produit ramene a l'etape 1",
  `etape ${await etapeCourante()}`
);

// ------------- 9. Vider un champ apres coup ne permet pas de creer quand meme
await bouton(/Continuer/i).click();
await page.waitForTimeout(400);
await bouton(/Continuer/i).click();
await page.waitForTimeout(400);
await bouton(/Continuer/i).click();
await page.waitForTimeout(500);
verifier((await etapeCourante()) === 4, "retour au resume");

await page
  .getByRole("button", { name: /^Modifier$/ })
  .filter({ visible: true })
  .nth(1)
  .click();
await page.waitForTimeout(500);
await page.locator("#buyerName").fill("");
await bouton(/Continuer/i).click();
await page.waitForTimeout(400);
verifier(
  (await etapeCourante()) === 2,
  "un champ vide apres coup rebloque l'etape concernee"
);

// ------------------------------------------------------ 10. Creation reelle
await page.locator("#buyerName").fill("Awa Koné");
await bouton(/Continuer/i).click();
await page.waitForTimeout(400);
await bouton(/Continuer/i).click();
await page.waitForTimeout(400);
await bouton(/Créer la commande/i).click();
await page.waitForTimeout(4500);

const texteFinal = await page.evaluate(() => document.body.innerText);
const reference = (texteFinal.match(/KOLI-[2-9A-Z]{8}/) ?? [])[0];
verifier(Boolean(reference), "la commande est creee", reference ?? "aucune");
verifier((await etapeCourante()) === 5, "l'assistant affiche l'etape 5");
verifier(
  /wa\.me|WhatsApp/i.test(texteFinal),
  "le lien de partage WhatsApp est propose"
);

if (reference) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/pay/${reference}`, { waitUntil: "networkidle" });
  const t = await p.evaluate(() => document.body.innerText);
  verifier(
    t.replace(/[\s  ]/g, "").includes(String(attendu)),
    "la page de paiement affiche le total annonce au resume",
    `attendu ${attendu}`
  );
  await p.close();
}

verifier(erreurs.length === 0, "aucune erreur JavaScript", erreurs[0] ?? "");

await ctx.close();
await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "L'assistant en 5 etapes se comporte comme prevu."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
