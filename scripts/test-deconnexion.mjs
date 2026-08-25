/**
 * Deconnexion avec confirmation (§58).
 *
 * Elle partait auparavant au premier clic. Sur un telephone — l'appareil de la
 * quasi-totalite des utilisateurs — le bouton voisine avec la navigation et se
 * touche par megarde ; un vendeur au milieu d'une commande perdait sa saisie
 * sans avoir rien demande.
 *
 * Ce test verifie aussi que la deconnexion existe sur les ecrans SANS menu
 * lateral : l'assistant de commande, le recu et le suivi n'en offraient aucune,
 * et il fallait revenir au tableau de bord pour y parvenir — ce que rien
 * n'indiquait.
 *
 * Usage :
 *   BASE_URL=http://172.20.10.7:3000 node scripts/test-deconnexion.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

console.log(`\n=== DECONNEXION depuis ${BASE} ===\n`);

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
  await page.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
  await page.locator("#identifier").fill(identifiant);
  await page.locator("#password").fill(MDP);
  await page
    .getByRole("button", { name: /^Se connecter$/ })
    .filter({ visible: true })
    .first()
    .click();

  // On attend la navigation, pas un delai fixe : au premier appel apres le
  // demarrage du serveur, la reponse met plus longtemps et un `waitForTimeout`
  // trop court faisait echouer le test pour une raison etrangere a ce qu'il
  // verifie.
  await page
    .waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 25000 })
    .catch(() => {});
};

const bouton = (page, libelle) =>
  page.getByRole("button", { name: libelle }).filter({ visible: true }).first();

/**
 * Attend que la déconnexion apparaisse, au lieu de dormir un temps fixe.
 *
 * En mode développement, une route visitée pour la première fois est compilée
 * à la demande : elle peut mettre plusieurs secondes. Une attente figée de
 * 1,2 s suffisait sur `localhost` — déjà chaud — et échouait depuis l'adresse
 * Wi-Fi, où le test tombait sur la compilation à froid. Il annonçait alors une
 * déconnexion manquante qui était bel et bien là : un échec étranger à ce
 * qu'il vérifie, le pire défaut qu'un test puisse avoir.
 */
const attendreDeconnexion = async (page) => {
  try {
    await bouton(page, /^Déconnexion$/).waitFor({
      state: "visible",
      timeout: 20000,
    });
    return true;
  } catch {
    return false;
  }
};

// ═══════════ 1. Un clic ne deconnecte pas : il demande confirmation
{
  const ctx = await navigateur.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");

  await bouton(page, /^Déconnexion$/).click();
  await page.waitForTimeout(600);

  verifier(
    (await page.getByRole("alertdialog").count()) > 0,
    "un clic sur « Déconnexion » ouvre une demande de confirmation (§58)"
  );

  const texte = await page.evaluate(() => document.body.innerText);
  verifier(
    /Boutique Chic/.test(texte),
    "la question rappelle le compte concerne — utile sur un telephone partage"
  );

  // On est toujours connecte tant qu'on n'a pas confirme.
  verifier(
    new URL(page.url()).pathname === "/vendeur/dashboard",
    "rien n'est parti tant que la confirmation n'est pas donnee",
    new URL(page.url()).pathname
  );
  const cookies = await ctx.cookies();
  verifier(
    cookies.some((c) => c.name === "koli_session"),
    "la session est intacte a ce stade"
  );

  // ═══════════ 2. Annuler laisse tout en place
  await bouton(page, /^Annuler$/).click();
  await page.waitForTimeout(600);
  verifier(
    (await page.getByRole("alertdialog").count()) === 0,
    "« Annuler » referme la demande"
  );
  verifier(
    (await ctx.cookies()).some((c) => c.name === "koli_session"),
    "« Annuler » conserve la session"
  );

  // ═══════════ 3. Echap referme aussi
  await bouton(page, /^Déconnexion$/).click();
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  verifier(
    (await page.getByRole("alertdialog").count()) === 0,
    "la touche Echap referme la demande (§69)"
  );

  // ═══════════ 4. Confirmer deconnecte reellement
  await bouton(page, /^Déconnexion$/).click();
  await page.waitForTimeout(500);
  await bouton(page, /Oui, me déconnecter/).click();
  await page.waitForTimeout(3500);

  verifier(
    !(await ctx.cookies()).some((c) => c.name === "koli_session"),
    "confirmer supprime bien la session"
  );

  await page.goto(`${BASE}/vendeur/dashboard`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1500);
  verifier(
    new URL(page.url()).pathname === "/connexion",
    "l'espace n'est plus accessible apres deconnexion",
    new URL(page.url()).pathname
  );

  await ctx.close();
}

// ═══════════ 5. Les ecrans sans menu lateral ont aussi la deconnexion
{
  const ctx = await navigateur.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");

  await page.goto(`${BASE}/vendeur/commandes/nouvelle`, {
    waitUntil: "domcontentloaded",
  });
  verifier(
    await attendreDeconnexion(page),
    "l'assistant de commande offre la deconnexion"
  );

  // Le recu, ouvert depuis les commandes.
  await page.goto(`${BASE}/vendeur/commandes`, { waitUntil: "networkidle" });
  const recu = page
    .getByRole("link", { name: /Reçu/i })
    .filter({ visible: true })
    .first();

  // Le controle etait auparavant enferme dans un `if` : sans recu affiche, il
  // disparaissait sans un mot, et son silence se lisait comme une reussite.
  // Le jeu de donnees comporte des commandes reglees, donc au moins un recu.
  if ((await recu.count()) === 0) {
    verifier(false, "un recu est disponible pour poursuivre la verification");
  } else {
    await recu.click();
    await page.waitForLoadState("domcontentloaded");
    verifier(await attendreDeconnexion(page), "le recu offre la deconnexion");
  }

  await ctx.close();
}

// ═══════════ 6. Le menu nomme l'espace, pour expliquer ses entrees
{
  for (const [identifiant, attendu] of [
    ["vendeur@koli.ci", /Espace vendeur/i],
    ["client@koli.ci", /Espace client/i],
  ]) {
    const ctx = await navigateur.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();
    await connecter(page, identifiant);

    // On attend LE TEXTE ATTENDU, pas seulement le changement d'URL.
    //
    // `connecter` avale l'expiration de son attente. Quand le serveur est
    // sollicite par le reste de la suite, la connexion depasse le delai, le
    // test lit la page de connexion, et conclut que le menu ne nomme pas
    // l'espace — un echec etranger a ce qu'il verifie, qui n'apparaissait
    // qu'une fois sur trois.
    await page
      .waitForFunction(
        (motif) => new RegExp(motif, "i").test(document.body.innerText),
        attendu.source,
        { timeout: 30000 }
      )
      .catch(() => {});

    const texte = await page.evaluate(() => document.body.innerText);
    verifier(
      attendu.test(texte),
      `${identifiant} : le menu nomme l'espace`,
      /* Sans le drapeau « i », ce detail affichait TOUJOURS « aucun » : la
         feuille de style rend le libelle en majuscules, et `innerText` en
         tient compte. Un message d'echec qui n'apprend rien vaut a peine
         mieux que pas de message. */
      texte.match(/Espace \w+/i)?.[0] ?? "aucun"
    );
    await ctx.close();
  }
}

await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "La deconnexion demande confirmation et reste atteignable partout."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
