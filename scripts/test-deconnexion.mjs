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

/**
 * Connecte, et DIT si elle a reussi.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │  Elle avalait son expiration : `.catch(() => {})`, puis on continuait  │
 * │  comme si de rien n'etait.                                             │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Quand la connexion trainait — la campagne complete sollicite le meme
 * serveur, et bcrypt coute cher —, le test lisait la PAGE DE CONNEXION et
 * concluait « le menu ne nomme pas l'espace ». Un echec qui accuse le mauvais
 * coupable est pire qu'un echec franc : on cherche le defaut dans le menu, ou
 * il n'y en a pas.
 *
 * Elle renvoie donc un booleen, et une SECONDE tentative absorbe la contention
 * passagere. Si les deux echouent, l'appelant le dit pour ce que c'est.
 */
const connecter = async (page, identifiant) => {
  for (let essai = 1; essai <= 2; essai++) {
    await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
    await page.locator("#identifier").fill(identifiant);
    await page.locator("#password").fill(MDP);
    await page
      .getByRole("button", { name: /^Se connecter$/ })
      .filter({ visible: true })
      .first()
      .click();

    // On attend la navigation, pas un delai fixe : au premier appel apres le
    // demarrage du serveur, la reponse met plus longtemps et un
    // `waitForTimeout` trop court faisait echouer le test pour une raison
    // etrangere a ce qu'il verifie.
    const arrive = await page
      .waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 30000 })
      .then(() => true)
      .catch(() => false);

    if (arrive) return true;
  }
  return false;
};

const bouton = (page, libelle) =>
  page.getByRole("button", { name: libelle }).filter({ visible: true }).first();

/**
 * Ouvre le menu du COMPTE, ou vit desormais la deconnexion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Le menu lateral est devenu une barre HORIZONTALE : « Deconnexion » ne   │
 * │  s'affiche plus a decouvert, elle est derriere l'avatar.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce n'est pas un contournement du test : c'est l'interaction reelle, et c'est
 * celle de toutes les applications de ce genre. Le test doit l'exercer, sinon
 * il verifie un ecran qui n'existe plus.
 *
 * ⚠ Le menu est un `<details>` natif — il s'ouvre sans JavaScript, donc ce
 * clic ne depend pas de l'hydratation. Si un jour il devenait un composant
 * React, ce test tomberait, et il aurait raison : la deconnexion serait alors
 * hors d'atteinte le temps que le script arrive (§70).
 */
const ouvrirCompte = async (page) => {
  const details = page.locator("header details").last();
  if ((await details.count()) === 0) return false;
  /* Deja ouvert : un second clic le refermerait. On interroge CE `details`,
     pas « un details ouvert dans l'en-tete » — le menu « Plus » en est un
     aussi, et le trouver ouvert ferait croire que le compte l'est. */
  if (await details.evaluate((d) => d.open)) return true;
  await details.locator("summary").first().click();
  return true;
};

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
/*
 * ⚠ Elle rend un MOTIF, pas seulement `false`.
 *
 * Le `catch` avalait l'erreur : « le recu offre la deconnexion ✗ », sans un
 * mot de plus. On cherche alors un bouton manquant qui est peut-etre la, et
 * dont l'echec vient d'ailleurs — un clic intercepte, une navigation qui n'a
 * pas eu lieu, une page qui a redirige vers /connexion. C'est exactement le
 * defaut que ce fichier reproche deja a sa fonction `connecter`.
 */
const attendreDeconnexion = async (page) => {
  try {
    await ouvrirCompte(page);
    await bouton(page, /^Déconnexion$/).waitFor({
      state: "visible",
      timeout: 20000,
    });
    return { ok: true, motif: "" };
  } catch (e) {
    return {
      ok: false,
      motif: `${new URL(page.url()).pathname} — ${String(e).split("\n")[0]}`,
    };
  }
};

// ═══════════ 1. Un clic ne deconnecte pas : il demande confirmation
{
  const ctx = await navigateur.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");

  await ouvrirCompte(page);
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
  await ouvrirCompte(page);
  await bouton(page, /^Déconnexion$/).click();
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  verifier(
    (await page.getByRole("alertdialog").count()) === 0,
    "la touche Echap referme la demande (§69)"
  );

  // ═══════════ 4. Confirmer deconnecte reellement
  await ouvrirCompte(page);
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
  const assistant = await attendreDeconnexion(page);
  verifier(
    assistant.ok,
    "l'assistant de commande offre la deconnexion",
    assistant.motif
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

    /*
     * ⚠ On attend l'ARRIVEE sur la facture, pas un etat de chargement.
     *
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │  La navigation de Next est DOUCE : aucun document n'est charge, et   │
     * │  `waitForLoadState("domcontentloaded")` rend la main aussitot.       │
     * └──────────────────────────────────────────────────────────────────────┘
     *
     * Le controle cherchait alors le menu du compte dans le DOM de la page
     * PRECEDENTE — la liste des commandes, qui en porte un —, cliquait son
     * `summary` pendant qu'elle se demontait, et attendait trente secondes un
     * element deja detache. Il annoncait « le recu n'offre pas la
     * deconnexion » alors que le recu allait tres bien.
     *
     * C'est le §8 mot pour mot : on attend une consequence, jamais un delai.
     * Une pause de 1,5 s « reparait » d'ailleurs le symptome — c'est
     * exactement ce qui rend ce genre de rustine tentant, et faux.
     */
    await page.waitForURL(/\/facture\//, { timeout: 30000 }).catch(() => {});
    const r = await attendreDeconnexion(page);
    verifier(r.ok, "le recu offre la deconnexion", r.motif);
  }

  await ctx.close();
}

/*
 * ═══════════ 6. Le menu du compte dit QUEL compte, et dans quel ROLE
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Ce controle cherchait « Espace vendeur » dans `document.body.innerText`.│
 * │  Depuis la barre horizontale, cette phrase n'est plus NULLE PART dans le │
 * │  menu : elle ne subsiste que comme badge dans le corps du tableau de     │
 * │  bord vendeur.                                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Il passait donc pour le vendeur en lisant un badge de page, et echouait
 * pour le client parce qu'aucun badge equivalent n'existe chez lui. Un
 * controle qui reussit pour une raison etrangere a ce qu'il verifie ne
 * protege rien — et celui-la n'avait plus rien a voir avec un menu.
 *
 * Il eprouve desormais ce que la barre promet reellement : le menu du compte
 * nomme le compte ET son role. Sur un telephone partage, ou sur un compte qui
 * achete autant qu'il vend, c'est ce qui evite d'agir dans le mauvais espace.
 *
 * ⚠ Il est BORNE au menu du compte, pas a l'en-tete entier. Le ruban vendeur
 * porte une entree « Clients » : un motif /Client/i lache sur l'en-tete
 * matcherait cette entree et rendrait le controle incapable d'echouer.
 */
{
  for (const [identifiant, attendu] of [
    ["vendeur@koli.ci", "Vendeur"],
    ["client@koli.ci", "Client"],
  ]) {
    const ctx = await navigateur.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();

    /*
     * Si la connexion n'aboutit pas, on le DIT — et on n'accuse pas le menu.
     *
     * C'est le defaut qui faisait echouer ce controle une fois sur trois
     * pendant la campagne complete : la connexion depassait son delai, le test
     * lisait la page de connexion, et concluait « le menu ne nomme pas
     * l'espace ». On cherchait alors le defaut dans un menu qui n'en avait
     * aucun.
     */
    if (!(await connecter(page, identifiant))) {
      verifier(
        false,
        `${identifiant} : la connexion aboutit`,
        "deux tentatives expirees — le menu n'est PAS en cause"
      );
      await ctx.close();
      continue;
    }

    /*
     * ⚠ Le libelle du role a CHANGE DE PLACE avec la barre horizontale.
     *
     * ┌────────────────────────────────────────────────────────────────────┐
     * │  Il s'affichait a decouvert dans la colonne laterale. Il vit       │
     * │  desormais dans le menu du COMPTE — et sous 1536 px, il n'est nulle │
     * │  part ailleurs.                                                     │
     * └────────────────────────────────────────────────────────────────────┘
     *
     * `innerText` ignore le contenu d'un `<details>` ferme : sans ce clic, le
     * controle echouerait en annoncant « le menu ne nomme pas le role »,
     * alors qu'il le nomme parfaitement une fois ouvert. C'est le meme piege
     * que la connexion expiree plus haut — un echec qui accuse le mauvais
     * coupable.
     */
    if (!(await ouvrirCompte(page))) {
      verifier(false, `${identifiant} : le menu du compte existe`, "aucun details");
      await ctx.close();
      continue;
    }

    // On attend LE TEXTE, pas seulement le changement d'URL : la barre est
    // rendue par le serveur, elle peut arriver apres.
    const menu = page.locator("header details").last();
    await menu
      .locator(`text=${attendu}`)
      .first()
      .waitFor({ state: "visible", timeout: 30000 })
      .catch(() => {});

    /* On lit les LIGNES du menu et on cherche une egalite exacte. « Client »
       en sous-chaine matcherait « Clients » du ruban ; ici le ruban est hors
       du `details`, mais l'egalite le garantit sans dependre de ce detail. */
    const lignes = await menu.evaluate((d) =>
      d.innerText
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    );

    verifier(
      lignes.includes(attendu),
      `${identifiant} : le menu du compte nomme le role « ${attendu} »`,
      lignes.join(" | ") || "menu vide"
    );

    /* Le NOM du compte, en plus du role : « Vendeur » seul ne distingue pas
       deux boutiques ouvertes sur le meme telephone. */
    verifier(
      lignes.some((l) => l !== attendu && l !== "Mon profil" && l !== "Déconnexion"),
      `${identifiant} : il nomme aussi le compte`,
      lignes.join(" | ") || "menu vide"
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
