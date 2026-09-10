/**
 * Reproduit le parcours reel signale : creer un compte, puis se connecter avec.
 *
 * Usage :
 *   BASE_URL=http://172.20.10.7:3000 node scripts/test-inscription.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

// Suffixe unique : le test doit pouvoir etre rejoue sans se heurter a
// l'unicite du telephone et de l'e-mail.
const marque = Date.now().toString().slice(-7);
const COMPTE = {
  nom: "Test Nouveau Vendeur",
  telephone: `+22507${marque}`,
  email: `test${marque}@exemple.ci`,
  motDePasse: "MotDePasseTest2026",
  boutique: "Boutique de test",
};

console.log(`\n=== INSCRIPTION puis CONNEXION depuis ${BASE} ===\n`);
console.log(`  compte : ${COMPTE.email} / ${COMPTE.telephone}\n`);

const navigateur = await chromium.launch();
let echecs = 0;

const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

// ------------------------------------------------------------ 1. Inscription
{
  const ctx = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 140)));

  await page.goto(`${BASE}/inscription`, { waitUntil: "networkidle" });

  await page.locator("#name").fill(COMPTE.nom);
  await page.locator("#phone").fill(COMPTE.telephone);
  await page.locator("#email").fill(COMPTE.email);
  await page.locator("#password").fill(COMPTE.motDePasse);
  const boutique = page.locator("#businessName");
  if (await boutique.count()) await boutique.fill(COMPTE.boutique);

  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(5000);

  const url = new URL(page.url()).pathname;
  const cookies = await ctx.cookies();
  const session = cookies.find((c) => c.name === "koli_session");
  const texte = await page.evaluate(() => document.body.innerText.trim());

  verifier(
    url === "/vendeur/dashboard",
    "l'inscription mene directement a l'espace vendeur",
    `URL : ${url}`
  );
  verifier(session != null, "le cookie de session est conserve");
  verifier(texte.length > 40, "la page affiche du contenu", `${texte.length} car.`);
  verifier(erreurs.length === 0, "aucune erreur JavaScript", erreurs[0] ?? "");

  await ctx.close();
}

// ------------------------------------------------- 2. Deconnexion / reconnexion
{
  const ctx = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 140)));

  // Navigateur vierge : on se connecte avec le compte tout juste cree.
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill(COMPTE.email);
  await page.locator("#password").fill(COMPTE.motDePasse);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(5000);

  const url = new URL(page.url()).pathname;
  verifier(
    url === "/vendeur/dashboard",
    "connexion par e-mail avec le compte cree",
    `URL : ${url}`
  );

  // Le telephone doit fonctionner aussi comme identifiant.
  const ctx2 = await navigateur.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page2.locator("#identifier").fill(COMPTE.telephone);
  await page2.locator("#password").fill(COMPTE.motDePasse);
  await page2.locator('button[type="submit"]').first().click();
  await page2.waitForTimeout(5000);
  verifier(
    new URL(page2.url()).pathname === "/vendeur/dashboard",
    "connexion par telephone avec le meme compte",
    `URL : ${new URL(page2.url()).pathname}`
  );
  await ctx2.close();

  // Un mauvais mot de passe doit produire un message VISIBLE.
  const ctx3 = await navigateur.newContext();
  const page3 = await ctx3.newPage();
  await page3.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page3.locator("#identifier").fill(COMPTE.email);
  await page3.locator("#password").fill("mauvais-mot-de-passe");
  await page3.locator('button[type="submit"]').first().click();
  await page3.waitForTimeout(4000);
  const alerte = await page3.locator('[role="alert"]').first().count();
  const texte3 = await page3.evaluate(() => document.body.innerText);
  verifier(
    alerte > 0 && /incorrect|tentative/i.test(texte3),
    "un mot de passe errone affiche bien un message d'erreur"
  );
  await ctx3.close();

  verifier(erreurs.length === 0, "aucune erreur JavaScript", erreurs[0] ?? "");
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Le pays annonce sa MONNAIE, et elle survit a la troncature
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │  Ce champ ne demande pas une adresse : il fixe la monnaie de tous les    │
// │  prix du vendeur.                                                        │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Deux pays de la liste s'appellent « Congo » et n'ont pas la meme monnaie :
// Brazzaville en FCFA, Kinshasa en FC, quatre fois d'ecart sur la valeur. Un
// commercant de Kinshasa qui se trompe de ligne saisit ses prix dans une
// monnaie qui n'est pas la sienne, et ne s'en apercoit qu'a la premiere vente.
//
// ⚠ UN MENU FERME TRONQUE EN SILENCE. Mesure a 320 px : 184 px de place, et
// « Republique Democratique du Congo » en fait 320 a lui seul. Le symbole
// place APRES le nom etait donc le premier morceau coupe — le garde-fou
// disparaissait pour le seul vendeur qu'il vise. Il vient desormais en tete.
//
// Ce controle ne verifie pas que le libelle EXISTE : il verifie que la
// monnaie reste LISIBLE une fois le menu ferme, sur le plus petit ecran.
{
  const ctx = await navigateur.newContext({ viewport: { width: 320, height: 740 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/inscription`, { waitUntil: "networkidle" });

  const lire = async (pays) => {
    await page.locator("#country").selectOption(pays);
    return page.evaluate(() => {
      const s = document.querySelector("#country");
      const st = getComputedStyle(s);
      const c = document.createElement("canvas").getContext("2d");
      c.font = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
      // 20 px pour la fleche du menu, qui recouvre la fin du texte.
      const dispo =
        s.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight) - 20;
      const texte = s.options[s.selectedIndex].textContent.trim();
      let visible = "";
      for (const ch of texte) {
        if (c.measureText(visible + ch).width > dispo) break;
        visible += ch;
      }
      return visible;
    });
  };

  const aide = await page
    .locator("#aide-pays")
    .textContent()
    .catch(() => "");
  verifier(
    /monnaie/i.test(aide ?? ""),
    "le champ Pays DIT qu'il fixe la monnaie",
    (aide ?? "").replace(/s+/g, " ").trim().slice(0, 52)
  );

  // Les deux Congo : le cas qui a motive tout ceci.
  const brazza = await lire("République du Congo");
  const kinshasa = await lire("République Démocratique du Congo");

  verifier(
    brazza.startsWith("FCFA"),
    "Brazzaville annonce FCFA, menu ferme et tronque",
    `« ${brazza} »`
  );
  verifier(
    kinshasa.startsWith("FC ") || kinshasa.startsWith("FC—") || kinshasa.startsWith("FC "),
    "Kinshasa annonce FC — et NON FCFA",
    `« ${kinshasa} »`
  );
  verifier(
    !kinshasa.startsWith("FCFA"),
    "les deux ne se confondent pas une fois tronques"
  );

  // Et tous les autres, pour que l'ajout d'un pays ne casse rien en silence.
  const pays = await page.evaluate(() =>
    [...document.querySelector("#country").options].map((o) => o.value)
  );
  const muets = [];
  for (const p of pays) {
    const vu = await lire(p);
    // Le symbole doit tenir AVANT le tiret : sinon il a ete coupe.
    if (!vu.includes(" — ")) muets.push(`${p} → « ${vu} »`);
  }
  verifier(
    muets.length === 0,
    `la monnaie survit a la troncature pour les ${pays.length} pays`,
    muets.slice(0, 2).join(" | ")
  );

  await ctx.close();
}

await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "Inscription et connexion fonctionnent de bout en bout."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
