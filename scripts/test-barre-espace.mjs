/**
 * La barre HORIZONTALE des espaces connectes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Elle remplace `test-menu-lateral.mjs`, qui eprouvait le repli d'une     │
 * │  colonne sombre — repli, deploiement, memoire, tiroir mobile. Rien de    │
 * │  tout cela n'existe plus.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce qui compte a change de forme, pas de nature. Une barre de navigation doit
 * toujours :
 *
 *   · donner acces a TOUTES les entrees, y compris celles qui ne tiennent pas
 *     dans le ruban ;
 *   · garder la deconnexion atteignable — et sans JavaScript, sinon quelqu'un
 *     reste enferme dans sa session le temps que le script arrive (§70) ;
 *   · dire OU l'on se trouve ;
 *   · porter le compteur de notifications et la mention du mode test.
 *
 * ⚠ Elle eprouve une partie de tout cela SANS JAVASCRIPT. Les deux menus sont
 * des `<details>` natifs, precisement pour cela : si l'un d'eux redevenait un
 * composant React, ce controle tomberait — et il aurait raison.
 *
 * ── FALSIFIEE, et voici comment la rejouer ──────────────────────────────────
 *
 * Dans `BarreEspace`, faire dependre le contenu des deux menus de
 * l'hydratation — un `useState(false)` mis a `true` dans un `useEffect`, garde
 * par `process.env.NEXT_PUBLIC_KOLI_FALSIFIER`, puis reconstruire.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Resultat mesure : SEULS les deux controles sans JavaScript tombent.     │
 * │  Les onze autres restent verts.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * C'est tout l'interet du bloc a `javaScriptEnabled: false` : avec un
 * navigateur ordinaire, cette regression est INVISIBLE — l'hydratation prend
 * quelques millisecondes sur ce poste, et tout parait normal. Elle ne se voit
 * que la ou elle fait mal, sur un telephone d'entree de gamme et un reseau
 * lent (§70).
 *
 * ⚠ Une condition lue dans `process.env`, jamais `if (false && …)` :
 * TypeScript reduit la seconde et casse la compilation au lieu de falsifier,
 * ce qui ne montre rien du tout (§8).
 *
 * Usage :
 *   node scripts/test-barre-espace.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

console.log(`\n=== LA BARRE DE L'ESPACE depuis ${BASE} ===\n`);

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
  return page
    .waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
};

// ═══════════ 1. Toutes les entrees restent atteignables
{
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  verifier(await connecter(page, "vendeur@koli.ci"), "connexion au compte vendeur");

  /*
   * Le ruban ne montre pas tout, et c'est voulu : onze entrees n'y tiennent
   * pas. Ce qu'on exige, c'est que RIEN ne soit perdu — le reste est dans
   * « Plus ». Une entree qui n'existe nulle part est une page qu'on ne peut
   * plus ouvrir.
   *
   * ⚠ On compte ce qui se VOIT, pas ce qui existe — et la question se pose a
   * PLAYWRIGHT, pas au DOM.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │  Deux pieges empiles, et le second m'a eu.                           │
   * │                                                                       │
   * │  1. Un `<details>` ferme garde tous ses enfants dans le DOM. Un       │
   * │     `querySelectorAll` rend le meme tableau avant et apres ouverture. │
   * │                                                                       │
   * │  2. `getClientRects()` ne repare RIEN : mesure ici, elle rend `1`     │
   * │     pour des liens d'un `<details>` ferme. Chromium leur laisse une   │
   * │     boite alors que rien n'est peint.                                 │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * Les deux donnaient « 14 → 14 » : un controle qui ne peut pas echouer, et
   * qui ne protege donc rien (§8). `isVisible()` de Playwright rend 9 → 13 —
   * il croise la boite, les styles calcules et les ancetres, ce qu'aucune
   * mesure isolee ne fait.
   */
  const liens = async () => {
    const els = await page
      .locator('header a[href^="/vendeur"], header a[href="/notifications"]')
      .all();
    const vus = [];
    for (const e of els) if (await e.isVisible()) vus.push(await e.getAttribute("href"));
    return vus;
  };

  const avant = await liens();
  await page.locator("header summary").first().click();
  await page.waitForTimeout(200);
  const apres = await liens();

  const attendues = [
    "/vendeur/dashboard",
    "/vendeur/commandes",
    "/vendeur/commandes/nouvelle",
    "/vendeur/produits",
    "/vendeur/clients",
    "/vendeur/livreurs",
    "/vendeur/factures",
    "/vendeur/transactions",
    "/vendeur/solde",
    "/vendeur/verification",
    "/vendeur/profil",
  ];
  const manquantes = attendues.filter((h) => !apres.includes(h));
  verifier(
    manquantes.length === 0,
    `les ${attendues.length} entrees de l'espace vendeur sont atteignables`,
    manquantes.join(", ")
  );

  verifier(
    apres.length > avant.length,
    "le menu « Plus » en revele qui n'etaient pas dans le ruban",
    `${avant.length} → ${apres.length}`
  );

  /*
   * ⚠ CE controle-ci existe parce que le precedent s'est laisse tromper.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │  Le menu « Plus » a vecu DANS le ruban, qui porte `overflow-x-auto`. │
   * │  Des qu'un axe cesse d'etre `visible`, l'autre passe a `auto` : le   │
   * │  ruban decoupait donc verticalement, et le menu descendait 202 px    │
   * │  sous un conteneur haut de 44. Il etait INVISIBLE, en entier.        │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * `isVisible()` repondait « oui » a chaque entree : boite non vide, styles
   * calcules corrects, aucun ancetre en `display:none`. Il ne dit RIEN du
   * rognage par l'`overflow` d'un ancetre — et quatre entrees de navigation
   * etaient inatteignables pendant que la suite restait verte.
   *
   * On compare donc les RECTANGLES : chaque entree revelee doit tenir dans
   * tous les conteneurs de defilement qui la portent.
   */
  const rogne = await page.evaluate(() => {
    const fautifs = [];
    for (const a of document.querySelectorAll("header details[open] a")) {
      const b = a.getBoundingClientRect();
      let p = a.parentElement;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (s.overflowX !== "visible" || s.overflowY !== "visible") {
          const c = p.getBoundingClientRect();
          if (b.bottom > c.bottom + 1 || b.top < c.top - 1 || b.right > c.right + 1)
            fautifs.push(`${a.getAttribute("href")} deborde de ${p.tagName}`);
        }
        p = p.parentElement;
      }
    }
    return fautifs;
  });
  verifier(
    rogne.length === 0,
    "aucune entree revelee n'est rognee par un conteneur qui defile",
    rogne.join(" ; ")
  );

  // ═══════════ 2. La barre DIT ou l'on se trouve
  await page.goto(`${BASE}/vendeur/produits`, { waitUntil: "networkidle" });
  const actif = await page.evaluate(() => {
    const a = document.querySelector('header a[aria-current="page"]');
    return a?.getAttribute("href") ?? null;
  });
  verifier(
    actif === "/vendeur/produits",
    "l'entree courante porte aria-current",
    actif ?? "aucune"
  );

  /*
   * Une SOUS-page allume son parent, et lui seul.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │  L'egalite stricte n'allumerait rien sur /vendeur/produits/<id> : la │
   * │  barre cesserait de dire ou l'on se trouve des qu'on ouvre une fiche.│
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * ⚠ Le cas SYMETRIQUE — deux entrees allumees a la fois par un `startsWith`
   * naif, « Commandes » et « Nouvelle commande » sur
   * /vendeur/commandes/nouvelle — ne s'eprouve PAS ici : cette page est
   * l'assistant en cinq etapes, et elle ne monte pas la barre de l'espace
   * (elle porte `BarreCompte`, volontairement depouillee). Le depart au plus
   * long prefixe reste ecrit dans `BarreEspace`, mais aucun ecran ne permet
   * de l'exercer dans un navigateur. Le dire vaut mieux que faire croire que
   * ce controle le couvre.
   */
  const fiche = await page.evaluate(() => {
    const a = document.querySelector('main a[href^="/vendeur/produits/"]');
    return a?.getAttribute("href") ?? null;
  });

  if (!fiche) {
    verifier(false, "une fiche produit est ouvrable pour poursuivre", "aucun lien");
  } else {
    await page.goto(`${BASE}${fiche}`, { waitUntil: "networkidle" });
    const actifs = await page.evaluate(() =>
      [...document.querySelectorAll('header a[aria-current="page"]')].map((a) =>
        a.getAttribute("href")
      )
    );
    verifier(
      actifs.length === 1 && actifs[0] === "/vendeur/produits",
      "une fiche allume « Catalogue », et une SEULE entree",
      actifs.join(" + ") || "aucune"
    );
  }

  // ═══════════ 3. Le compteur de notifications, juste au premier rendu
  const cloche = await page.evaluate(() => {
    const a = document.querySelector('header a[href="/notifications"]');
    return a?.getAttribute("aria-label") ?? null;
  });
  verifier(
    Boolean(cloche),
    "la cloche annonce son etat par un nom accessible",
    cloche ?? "aucun"
  );

  // ═══════════ 4. La mention du mode test, sous sa garde
  verifier(
    (await page.locator("header [data-mention-test]").count()) > 0,
    "la mention du mode test porte data-mention-test (§75)"
  );

  await ctx.close();
}

// ═══════════ 5. SANS JAVASCRIPT : tout doit encore s'ouvrir
{
  const ctx = await navigateur.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
  await page.locator("#identifier").fill("vendeur@koli.ci");
  await page.locator("#password").fill(MDP);
  await page.getByRole("button", { name: /^Se connecter$/ }).click();
  await page.waitForLoadState("domcontentloaded");
  verifier(/\/vendeur/.test(page.url()), "on entre sans JavaScript", page.url());

  /*
   * LE controle de cette suite — et il ne dit QUE ce qu'il prouve.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │  Les deux menus sont des `<details>` natifs. Ils s'ouvrent au clic   │
   * │  et au clavier sans une ligne de script. Si l'un redevenait un       │
   * │  composant React, tout ce qu'il contient sortirait d'atteinte le     │
   * │  temps que le JavaScript arrive (§70) — et ce controle tomberait.    │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * ⚠ Il ne pretend PAS que la deconnexion FONCTIONNE sans JavaScript. Son
   * declencheur est un `<button type="button" onClick>` : sans hydratation,
   * il est inerte. Le menu s'ouvre, le bouton s'affiche, et cliquer ne fait
   * rien. C'est un manque anterieur a cette barre — l'ancien menu lateral
   * portait le meme bouton — mais il faut l'ecrire ici, sinon la formule
   * « la deconnexion y est » se lira un jour comme une garantie.
   */
  const compte = page.locator("header summary").last();
  verifier(
    (await page.getByRole("button", { name: /^Déconnexion$/ }).count()) === 0 ||
      !(await page.getByRole("button", { name: /^Déconnexion$/ }).first().isVisible()),
    "menu ferme, son contenu n'est pas offert par megarde"
  );

  await compte.click();
  verifier(
    await page
      .getByRole("button", { name: /^Déconnexion$/ })
      .first()
      .isVisible(),
    "le menu du compte s'OUVRE sans JavaScript (details natif)"
  );

  await page.locator("header summary").first().click();
  verifier(
    await page.locator('header a[href="/vendeur/transactions"]').first().isVisible(),
    "le menu « Plus » s'ouvre aussi sans JavaScript"
  );

  await ctx.close();
}

// ═══════════ 6. Sur TELEPHONE : deux lignes, et un menu qui reste a l'ecran
/*
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Le controle de rognage du bloc 1 tourne a 1440 px, et il ne regardait   │
 * │  que les conteneurs de defilement — pas le BORD DE L'ECRAN.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * A 360 px, le menu « Plus » s'ouvrait ancre a droite d'un bouton place a
 * gauche, et sortait de l'ecran : « es livreurs », « ansactions ». Aucun
 * conteneur ne le rognait — c'etait la fenetre elle-meme. Le bloc 1 restait
 * vert. Une capture l'a montre, pas la suite.
 *
 * Et la grappe de droite passait sous le logo : trois lignes d'en-tete sur un
 * ecran ou chaque pixel de hauteur est du contenu en moins.
 */
for (const largeur of [320, 360]) {
  const ctx = await navigateur.newContext({ viewport: { width: largeur, height: 740 } });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");

  const lignes = await page.evaluate(() => {
    const logo = document.querySelector('header a[aria-label="Accueil de mon espace KOLI"]');
    /* Le DERNIER `summary` de l'en-tete, et non `details:last-of-type`.
       `:last-of-type` s'evalue PAR PARENT : « Plus » et le compte n'ont plus
       le meme parent, les deux correspondent, et `querySelector` rendait
       « Plus » — sur la seconde ligne. Le controle echouait sur un en-tete
       parfaitement correct, capture a l'appui. */
    const compte = [...document.querySelectorAll("header summary")].pop();
    const l = logo.getBoundingClientRect(), c = compte.getBoundingClientRect();
    // Meme ligne si leurs centres verticaux sont a moins de 10 px.
    return Math.abs((l.top + l.bottom) / 2 - (c.top + c.bottom) / 2) < 10;
  });
  verifier(
    lignes,
    `${largeur} px : logo et compte partagent la premiere ligne`,
    "la grappe de droite est passee a la ligne"
  );

  await page.locator("header summary").first().click();
  await page.waitForTimeout(250);
  const horsEcran = await page.evaluate(() => {
    const W = window.innerWidth;
    return [...document.querySelectorAll("header details[open] a")]
      .map((a) => ({ h: a.getAttribute("href"), b: a.getBoundingClientRect() }))
      .filter(({ b }) => b.left < -1 || b.right > W + 1)
      .map(({ h, b }) => `${h} [${Math.round(b.left)}..${Math.round(b.right)}]`);
  });
  verifier(
    horsEcran.length === 0,
    `${largeur} px : le menu « Plus » tient DANS l'ecran`,
    horsEcran.join(" ; ")
  );
  await ctx.close();
}

// ═══════════ 7. Le ruban defile DANS son conteneur, jamais la page
{
  const ctx = await navigateur.newContext({ viewport: { width: 320, height: 740 } });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");

  const r = await page.evaluate(() => {
    const n = document.querySelector('header nav[aria-label="Navigation de l\'espace"]');
    return {
      rubanDeborde: n.scrollWidth > n.clientWidth + 1,
      document: document.documentElement.scrollWidth,
      fenetre: window.innerWidth,
    };
  });

  verifier(
    r.rubanDeborde,
    "a 320 px le ruban a bien plus de contenu que de place",
    "sinon ce controle ne prouverait rien"
  );
  verifier(
    r.document <= r.fenetre,
    "et pourtant la PAGE ne defile pas horizontalement (§8)",
    `document=${r.document} fenetre=${r.fenetre}`
  );

  await ctx.close();
}

await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "La barre donne acces a tout, dit ou l'on est, et s'ouvre sans JavaScript.\n"
    : `${echecs} probleme(s).\n`
);
process.exit(echecs > 0 ? 1 : 0);
