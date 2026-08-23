/**
 * Menu lateral : repli, et deconnexion TOUJOURS atteignable.
 *
 * Ce test existe a cause d'un defaut precis : en ajoutant une septieme entree
 * au menu vendeur, le panneau s'est mis a deborder sans defiler. Sous ~670px
 * de hauteur de fenetre — la taille d'un portable courant — le bouton de
 * deconnexion sortait de l'ecran et devenait PUREMENT INATTEIGNABLE. Rien ne
 * le signalait : il avait simplement disparu.
 *
 * Il verifie donc, a plusieurs hauteurs de fenetre :
 *  - que la deconnexion reste dans l'ecran ou accessible par defilement ;
 *  - que le menu se replie et se deploie, en liberant reellement de la place ;
 *  - que le choix survit a une navigation, sans sursaut de mise en page.
 *
 * Usage :
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-menu-lateral.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

console.log(`\n=== MENU LATERAL depuis ${BASE} ===\n`);

const navigateur = await chromium.launch();
let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const connecter = async (page, identifiant) => {
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill(identifiant);
  await page.locator("#password").fill(MDP);
  await page
    .getByRole("button", { name: /^Se connecter$/ })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 25000 })
    .catch(() => {});
  await page.waitForTimeout(800);
};

/** Le bouton est-il reellement atteignable, quitte a faire defiler ? */
const deconnexionAtteignable = async (page) => {
  const b = page
    .locator("aside button")
    .filter({ hasText: "Déconnexion" })
    .first();
  if ((await b.count()) === 0) return { present: false, atteignable: false };

  await b.scrollIntoViewIfNeeded().catch(() => {});
  const dans = await b.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0;
  });
  return { present: true, atteignable: dans };
};

// ═══════════ 1. La deconnexion resiste aux fenetres courtes
// C'est exactement le cas qui l'avait fait disparaitre.
for (const hauteur of [560, 640, 720, 900]) {
  const ctx = await navigateur.newContext({
    viewport: { width: 1366, height: hauteur },
  });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");

  const etat = await deconnexionAtteignable(page);
  verifier(
    etat.present && etat.atteignable,
    `deconnexion atteignable a ${hauteur}px de hauteur`,
    etat.present ? "presente mais hors ecran" : "absente"
  );

  await ctx.close();
}

// ═══════════ 2. Repli et deploiement
{
  const ctx = await navigateur.newContext({
    viewport: { width: 1366, height: 800 },
  });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");

  const largeurMenu = () =>
    page.evaluate(() => {
      const a = document.querySelector("aside");
      return a ? Math.round(a.getBoundingClientRect().width) : 0;
    });
  const debutContenu = () =>
    page.evaluate(() => {
      const m = document.querySelector("main");
      return m ? Math.round(m.getBoundingClientRect().left) : 0;
    });

  const largeurOuvert = await largeurMenu();
  const contenuOuvert = await debutContenu();
  verifier(largeurOuvert > 200, "le menu est deploye au depart", `${largeurOuvert}px`);

  const replier = page.getByRole("button", { name: /Replier le menu/i }).first();
  verifier((await replier.count()) > 0, "un bouton de repli est propose");

  await replier.click();
  await page.waitForTimeout(700);

  const largeurReplie = await largeurMenu();
  const contenuReplie = await debutContenu();

  verifier(
    largeurReplie < largeurOuvert - 100,
    "le menu se replie reellement",
    `${largeurOuvert}px → ${largeurReplie}px`
  );
  verifier(
    contenuReplie < contenuOuvert - 100,
    "le contenu recupere la place liberee",
    `${contenuOuvert}px → ${contenuReplie}px`
  );

  // Replie, les libelles disparaissent mais restent lisibles aux lecteurs
  // d'ecran : les entrees ne doivent pas devenir anonymes.
  const entrees = await page
    .locator("aside nav a")
    .evaluateAll((els) =>
      els.map((e) => ({
        titre: e.getAttribute("title"),
        texte: (e.textContent ?? "").trim(),
      }))
    );
  verifier(
    entrees.length > 0 && entrees.every((e) => e.titre && e.texte),
    "replie, chaque entree garde un libelle accessible",
    JSON.stringify(entrees[0] ?? {})
  );

  const etatReplie = await deconnexionAtteignable(page);
  verifier(
    etatReplie.present && etatReplie.atteignable,
    "la deconnexion reste atteignable menu replie"
  );

  // ═══════════ 3. Le choix survit a une navigation, sans sursaut
  await page.goto(`${BASE}/vendeur/commandes`, { waitUntil: "domcontentloaded" });
  const largeurApresNavigation = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--largeur-menu").trim()
  );
  verifier(
    largeurApresNavigation === "4.75rem",
    "le menu reste replie apres navigation, des le premier rendu",
    largeurApresNavigation
  );

  // ═══════════ 4. Deploiement
  const deployer = page.getByRole("button", { name: /Déployer le menu/i }).first();
  verifier((await deployer.count()) > 0, "un bouton de deploiement est propose");
  await deployer.click();
  await page.waitForTimeout(700);

  verifier(
    (await largeurMenu()) > 200,
    "le menu se redeploie",
    `${await largeurMenu()}px`
  );

  await ctx.close();
}

// ═══════════ 5. Sur telephone, le tiroir reste complet
{
  const ctx = await navigateur.newContext({
    viewport: { width: 390, height: 640 },
  });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");

  await page.getByRole("button", { name: /Ouvrir le menu/i }).first().click();
  await page.waitForTimeout(700);

  const texte = await page.evaluate(() => document.body.innerText);
  verifier(
    /Tableau de bord/.test(texte) && /Déconnexion/.test(texte),
    "le tiroir mobile reste complet, deconnexion comprise"
  );
  verifier(
    (await page.getByRole("button", { name: /Replier le menu/i }).filter({ visible: true }).count()) === 0,
    "aucun repli propose sur telephone : le tiroir se ferme deja entierement"
  );

  await ctx.close();
}

await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "Le menu se replie et la deconnexion reste toujours atteignable."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
