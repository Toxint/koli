/**
 * Les courbes de performance des tableaux de bord — vendeur et livreur.
 *
 * Une courbe fausse a exactement l'allure d'une courbe juste. C'est ce qui rend
 * ce contrôle nécessaire : personne ne remarquera de lui-même qu'une aire monte
 * un peu trop haut, et le premier à s'en apercevoir serait le vendeur, en
 * comparant avec son solde.
 *
 * Quatre choses sont éprouvées ici, contre le VRAI serveur et la VRAIE base :
 *
 *  1. Le total annoncé est celui que porte le registre — pas une approximation,
 *     pas une somme d'autre chose.
 *  2. Il est **net de commission**. Le même écran affiche un solde net juste
 *     au-dessus : une courbe brute le dépasserait.
 *  3. Les chiffres sont **dans la page**, en toutes lettres, et pas seulement
 *     dessinés. Un graphique seul exclut qui n'y voit pas, et ne se copie pas.
 *  4. Le livreur ne voit **que** sa paie (§25) : ni la marchandise qu'il
 *     transporte, ni la commission KOLI.
 *
 * Ce que ce script NE prouve pas : que la règle de calcul soit la bonne. Il
 * recopie cette règle pour la confronter aux données brutes — ce sont les tests
 * unitaires de `lib/__tests__/courbes.test.ts` qui l'éprouvent, elle.
 *
 * Usage :
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-courbes.mjs
 */

import { chromium } from "playwright";
import { ecrire, lire, lireUne, fermer } from "./base-donnees.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";
const JOURS = 14;

console.log(`\n=== COURBES DE PERFORMANCE depuis ${BASE} ===\n`);

let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

/**
 * Un contrôle qui ne peut pas s'exercer le DIT, au lieu de passer au vert.
 *
 * Le cas se présente vraiment : l'état vide se vérifie sur un compte sans
 * mouvement, et rien n'empêche un autre test d'en avoir créé un.
 */
const inapplicable = (libelle, pourquoi) =>
  console.log(`  ~ ${libelle} — non éprouvé : ${pourquoi}`);

// ─── La même règle que `lib/finance/courbes.ts`, appliquée aux données brutes.

const minuitMoins = (recul) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - recul);
  return d;
};

const cleJour = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function serieAttendue(lignes) {
  const depuis = minuitMoins(JOURS - 1);
  const parJour = new Map();

  for (const l of lignes) {
    if (l.createdAt < depuis) continue;
    const montant = l.type === "COMMISSION" ? -Math.abs(l.amount) : l.amount;
    const cle = cleJour(l.createdAt);
    parJour.set(cle, (parJour.get(cle) ?? 0) + montant);
  }

  const points = [];
  for (let i = JOURS - 1; i >= 0; i--) {
    points.push(Math.max(0, parJour.get(cleJour(minuitMoins(i))) ?? 0));
  }
  return points;
}

/**
 * Une écriture posée à quelques minutes de minuit peut tomber d'un côté ou de
 * l'autre selon l'instant où le serveur a rendu la page. Le contrôle le dit
 * plutôt que de clignoter au hasard.
 */
function fraisDeBordure(lignes) {
  return lignes.some((l) => {
    const minuit = new Date(l.createdAt);
    minuit.setHours(0, 0, 0, 0);
    const depuisMinuit = l.createdAt - minuit;
    return depuisMinuit < 120_000 || depuisMinuit > 86_400_000 - 120_000;
  });
}

// ─── Lecture des écrans.

/** Les chiffres seuls : le séparateur est une espace fine insécable (U+202F). */
const enNombre = (texte) => Number(String(texte).replace(/\D/g, ""));

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
  // On attend la CONSÉQUENCE — la carte rendue — et non un délai : la valeur
  // qui convient à cette machine ne convient pas à la suivante.
  await page
    .locator("[data-courbe]")
    .first()
    .waitFor({ state: "attached", timeout: 25000 })
    .catch(() => {});
};

/** La carte qui porte la courbe, titre et total compris. */
const carteDe = (page) =>
  page
    .locator("[data-courbe]")
    .first()
    .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');

const totalAffiche = async (carte) => {
  const m = (await carte.innerText()).match(
    /([\d   ]+)FCFA sur la période/
  );
  return m ? enNombre(m[1]) : null;
};

/**
 * Ce controle POSE SES PROPRES ECRITURES.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │  Il lisait ce qu'un AUTRE test avait laisse derriere lui.              │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Le jeu de demonstration ne cree aucune liberation de fonds : il s'arrete au
 * sequestre. Les ecritures que cette courbe affiche etaient donc celles qu'un
 * test amont — le parcours, les jalons — avait produites en passant. Rien ne
 * garantissait ni leur presence, ni leur date, ni leur montant.
 *
 * Le 2 septembre 2026 elles n'y etaient plus, et les trois controles les plus
 * substantiels du fichier sont tombes d'un coup : « 0 graduation », « plafond
 * -Infinity ». Le defaut n'etait pas dans les courbes, qui allaient tres bien.
 *
 * Le pire etait le §25. Sans liberation, `marchandise` vaut 0, et le controle
 * cherchait la chaine "0" dans l'ecran du livreur — qu'on y trouve toujours.
 * Il echouait donc quoi qu'affiche cette page, et pour une raison etrangere a
 * ce qu'il verifie.
 *
 * Deux jours distincts, et non un seul : avec un seul point, l'axe vertical
 * n'a pas d'etendue et le controle des graduations ne prouverait rien.
 */
const aNettoyer = [];

async function poserLesEcritures(idVendeur, idLivreur) {
  const suffixe = Date.now().toString(36).toUpperCase().slice(-8);

  // Deux jours DANS la fenetre, et loin de minuit : `fraisDeBordure` existe
  // parce qu'une ecriture posee a quelques minutes de minuit bascule d'un jour
  // a l'autre selon l'instant du rendu.
  const jour = (recul) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - recul);
    return d;
  };

  const lots = [
    { recul: 3, marchandise: 40000, commission: 2000, livraison: 1500 },
    { recul: 1, marchandise: 25000, commission: 1250, livraison: 1000 },
  ];

  for (const [n, lot] of lots.entries()) {
    const idCommande = `ctrl-courbe-o-${suffixe}-${n}`;

    // Note AVANT insertion : une erreur en cours de route laisserait sinon une
    // commande orpheline que le menage ignore.
    aNettoyer.push(idCommande);

    await ecrire(
      `INSERT INTO "Order" (id, reference, "sellerId", "buyerName", "buyerPhone",
         "buyerCountry", "buyerCity", "buyerAddress", "deliveryFee", status,
         "createdAt", "updatedAt")
       VALUES (?, ?, ?, 'Controle Courbe', '+2250700000097', 'Cote d''Ivoire',
         'Abidjan', 'Adresse de controle', ?, 'COMPLETED', ?, ?)`,
      idCommande,
      `KOLI-CRB${suffixe}${n}`,
      idVendeur,
      lot.livraison,
      jour(lot.recul),
      jour(lot.recul)
    );

    await ecrire(
      `INSERT INTO "Delivery" (id, "orderId", "driverId", status, "assignedAt",
         "deliveredAt")
       VALUES (?, ?, ?, 'CONFIRMED', ?, ?)`,
      `ctrl-courbe-d-${suffixe}-${n}`,
      idCommande,
      idLivreur,
      jour(lot.recul),
      jour(lot.recul)
    );

    // La commission est NEGATIVE : `amount` est signe, et la courbe du vendeur
    // est nette. Une commission positive gonflerait la courbe au lieu de la
    // reduire — et le total afficherait plus que ce que le vendeur touche.
    const ecritures = [
      ["FUNDS_RELEASED", lot.marchandise],
      ["COMMISSION", -lot.commission],
      ["DRIVER_PAYOUT", lot.livraison],
    ];

    for (const [type, montant] of ecritures) {
      await ecrire(
        `INSERT INTO "Transaction" (id, "orderId", type, amount, "createdAt")
         VALUES (?, ?, ?::"TransactionType", ?, ?)`,
        `ctrl-courbe-t-${suffixe}-${n}-${type}`,
        idCommande,
        type,
        montant,
        jour(lot.recul)
      );
    }
  }
}


const navigateur = await chromium.launch();

try {
  const vendeur = await lireUne(
    `SELECT s.id FROM "SellerProfile" s JOIN "User" u ON u.id = s."userId"
      WHERE u.email = ?`,
    "vendeur@koli.ci"
  );
  const livreur = await lireUne(
    `SELECT d.id FROM "DriverProfile" d JOIN "User" u ON u.id = d."userId"
      WHERE u.email = ?`,
    "livreur@koli.ci"
  );

  await poserLesEcritures(vendeur.id, livreur.id);

  // ═══════════ 1. Le vendeur — le total annoncé est celui du registre

  const ecritures = await lire(
    `SELECT t.type, t.amount, t."createdAt"
       FROM "Transaction" t JOIN "Order" o ON o.id = t."orderId"
      WHERE o."sellerId" = ? AND t.type IN ('FUNDS_RELEASED', 'COMMISSION')`,
    vendeur.id
  );

  const attendue = serieAttendue(ecritures);
  const totalAttendu = attendue.reduce((s, v) => s + v, 0);
  const maxAttendu = Math.max(...attendue);

  const ctxV = await navigateur.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const pageV = await ctxV.newPage();
  await connecter(pageV, "vendeur@koli.ci");

  const carteV = carteDe(pageV);
  verifier(
    (await pageV.locator("[data-courbe]").count()) === 1,
    "le tableau de bord vendeur porte une courbe, et une seule"
  );
  verifier(
    /Vos encaissements/i.test(await carteV.innerText()),
    "elle est nommée : le lecteur sait ce qu'il regarde"
  );

  if (fraisDeBordure(ecritures)) {
    inapplicable(
      "le total dit ce que porte le registre",
      "une écriture est à moins de deux minutes de minuit, le découpage en jours est indécidable"
    );
  } else {
    const affiche = await totalAffiche(carteV);
    verifier(
      affiche === totalAttendu,
      "le total dit ce que porte le registre",
      `écran ${affiche}, base ${totalAttendu}`
    );

    // ═══════════ 2. Net de commission, jamais brut
    const brut = ecritures
      .filter(
        (l) =>
          l.type === "FUNDS_RELEASED" && l.createdAt >= minuitMoins(JOURS - 1)
      )
      .reduce((s, l) => s + l.amount, 0);

    if (brut - totalAttendu <= 0) {
      inapplicable(
        "la courbe est nette de commission",
        "aucune commission n'a été prélevée sur la période"
      );
    } else {
      verifier(
        affiche < brut,
        "la courbe est nette de commission, pas brute",
        `écran ${affiche}, brut libéré ${brut}`
      );
    }

    // ═══════════ 3. L'échelle verticale contient le pic, et de peu

    // Les graduations sont abrégées — « 60 k », « 1,2 M » — parce qu'un axe
    // n'est pas un relevé de compte. On les relit ici dans l'autre sens.
    const decoder = (t) => {
      const m = t.match(/([\d,]+)\s*([kM])?/);
      if (!m) return NaN;
      const n = Number(m[1].replace(",", "."));
      return m[2] === "M" ? n * 1e6 : m[2] === "k" ? n * 1e3 : n;
    };

    const graduations = (
      await pageV.locator('[data-courbe] [data-axe="y"]').allInnerTexts()
    )
      .map(decoder)
      .filter((n) => Number.isFinite(n));
    const plafond = Math.max(...graduations);

    verifier(
      graduations.length >= 3,
      "l'axe vertical est gradué, et pas seulement borné",
      `${graduations.length} graduation(s)`
    );

    // Le plafond contient le pic — sinon la courbe sortirait du cadre — mais
    // sans excès : un axe deux fois trop haut écrase la courbe au ras du zéro
    // et fait paraître nulle une bonne quinzaine.
    verifier(
      plafond >= maxAttendu && plafond < maxAttendu * 2,
      "l'échelle contient le plus fort jour, et de peu",
      `plafond ${plafond}, plus fort jour ${maxAttendu}`
    );
  }

  // ═══════════ 4. Les chiffres sont dans la page, pas seulement dessinés

  const lignesTableau = pageV.locator("[data-courbe] details tbody tr");
  const nbLignes = await lignesTableau.count();
  verifier(
    nbLignes === JOURS,
    `les ${JOURS} jours figurent en toutes lettres dans un tableau`,
    `${nbLignes} ligne(s)`
  );

  verifier(
    (await pageV
      .locator("[data-courbe] details")
      .first()
      .getAttribute("open")) === null,
    "le tableau est là sans être ouvert : présent, mais pas encombrant"
  );

  // `textContent` et non `innerText` : le tableau est REPLIÉ, donc pas rendu.
  // `innerText` ne rend que ce qui s'affiche et renvoyait quatorze chaînes
  // vides — le contrôle échouait en accusant la page, alors qu'il se regardait
  // lui-même. C'est justement ce qu'on veut prouver ici : les chiffres sont
  // dans le document avant qu'on ouvre quoi que ce soit.
  const cellules = await pageV
    .locator("[data-courbe] details tbody tr td:last-child")
    .allTextContents();
  verifier(
    cellules.reduce((s, c) => s + enNombre(c), 0) ===
      (await totalAffiche(carteV)),
    "le tableau et le total en tête portent le même chiffre"
  );

  // La courbe est lissée : un segment cubique entre deux jours, donc treize
  // segments pour quatorze jours. Compter les points revient à compter les
  // « C » du tracé.
  const trace = await pageV
    .locator('[data-courbe] [data-trace="ligne"]')
    .getAttribute("d");
  const nbSegments = (trace.match(/C/g) ?? []).length;
  verifier(
    nbSegments === JOURS - 1,
    `la courbe relie les ${JOURS} jours — les jours vides compris`,
    `${nbSegments} segment(s)`
  );

  // Le lissage ne doit RIEN inventer : une spline ordinaire plonge sous zéro
  // après un jour vide suivi d'un gros jour, et ce creux se lit comme une
  // perte qui n'a pas eu lieu. Aucun point de contrôle ne descend donc sous la
  // ligne de base ni ne monte au-dessus du plafond de l'échelle.
  //
  // Les bornes ne sont pas écrites en dur ici : elles se lisent sur la grille
  // elle-même. Un contrôle qui recopie les marges du composant cesse de le
  // vérifier le jour où quelqu'un les change des deux côtés.
  const debordement = await pageV
    .locator("[data-courbe] svg")
    .evaluate((svg) => {
      const boite = svg.querySelector('[data-trace="ligne"]').getBBox();
      const grille = [...svg.querySelectorAll("line")].map(
        (l) => l.y1.baseVal.value
      );
      return {
        haut: boite.y,
        bas: boite.y + boite.height,
        plafond: Math.min(...grille),
        base: Math.max(...grille),
      };
    });
  verifier(
    debordement.haut >= debordement.plafond - 0.5 &&
      debordement.bas <= debordement.base + 0.5,
    "le lissage n'invente ni bosse au-dessus du plafond ni creux sous zéro",
    `tracé de ${debordement.haut.toFixed(1)} à ${debordement.bas.toFixed(1)}, ` +
      `grille de ${debordement.plafond.toFixed(1)} à ${debordement.base.toFixed(1)}`
  );

  // ═══════════ 4 bis. La courbe est tracée EN ENTIER
  //
  // Elle ne l'était pas : l'animation d'ouverture se faisait par pointillés sur
  // un tracé normalisé (`pathLength="1"`), et `vector-effect` fait compter ces
  // pointillés en pixels d'écran — le tiret couvrait 640 pixels d'une courbe
  // qui en occupe 918. Le dernier tiers manquait sur tous les écrans, sans la
  // moindre erreur : la courbe avait juste l'air de s'arrêter là.
  //
  // Aucun contrôle ne pouvait le voir. Celui-ci le peut.
  const pointilles = await pageV
    .locator('[data-courbe] [data-trace="ligne"]')
    .evaluate((el) => getComputedStyle(el).strokeDasharray);
  verifier(
    pointilles === "none",
    "aucun pointillé n'ampute la courbe",
    `stroke-dasharray: ${pointilles}`
  );

  // Le volet d'ouverture finit grand ouvert. S'il restait en chemin, la courbe
  // serait coupée exactement de la même façon, et tout aussi silencieusement.
  const volet = pageV.locator("[data-courbe] clipPath rect").first();
  await volet.evaluate((el) =>
    Promise.all(el.getAnimations().map((a) => a.finished))
  );
  const ouverture = await volet.evaluate((el) => {
    // `none` — pas d'animation du tout : le rectangle est entier, donc ouvert.
    const t = getComputedStyle(el).transform;
    return t === "none" ? 1 : new DOMMatrixReadOnly(t).a;
  });
  verifier(
    ouverture === 1,
    "le volet qui découvre la courbe finit grand ouvert",
    `échelle horizontale ${ouverture}`
  );

  await ctxV.close();

  // ═══════════ 5. Le livreur — sa paie, et rien d'autre (§25)

  const paie = await lire(
    `SELECT t.type, t.amount, t."createdAt"
       FROM "Transaction" t
       JOIN "Order" o ON o.id = t."orderId"
       JOIN "Delivery" d ON d."orderId" = o.id
      WHERE t.type = 'DRIVER_PAYOUT' AND d."driverId" = ?`,
    livreur.id
  );

  const paieAttendue = serieAttendue(paie).reduce((s, v) => s + v, 0);

  const ctxL = await navigateur.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const pageL = await ctxL.newPage();
  await connecter(pageL, "livreur@koli.ci");

  const carteL = carteDe(pageL);
  verifier(
    (await pageL.locator("[data-courbe]").count()) === 1,
    "le tableau de bord livreur porte une courbe"
  );

  if (fraisDeBordure(paie)) {
    inapplicable(
      "le total du livreur dit ce que porte le registre",
      "une écriture est à moins de deux minutes de minuit"
    );
  } else {
    const affiche = await totalAffiche(carteL);
    verifier(
      affiche === paieAttendue,
      "le total du livreur dit ce que porte le registre",
      `écran ${affiche}, base ${paieAttendue}`
    );
  }

  const texteL = await pageL.evaluate(() => document.body.innerText);

  // Le montant de la marchandise libérée au vendeur ne doit apparaître nulle
  // part chez le livreur — c'est le §25, et c'est aussi ce qu'un livreur
  // pourrait monnayer.
  const marchandise = ecritures
    .filter((l) => l.type === "FUNDS_RELEASED")
    .reduce((s, l) => s + l.amount, 0);
  const enFCFA = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  verifier(
    !texteL.includes(enFCFA(marchandise)),
    "l'écran du livreur ne porte pas la valeur de la marchandise (§25)",
    enFCFA(marchandise)
  );
  verifier(
    !/commission/i.test(texteL),
    "il n'y voit pas non plus la commission KOLI (§25)"
  );

  await ctxL.close();

  // ═══════════ 6. Un compte sans mouvement le dit — et n'invente rien

  const vide = await lireUne(
    `SELECT s.id FROM "SellerProfile" s JOIN "User" u ON u.id = s."userId"
      WHERE u.email = ?`,
    "vendeur2@koli.ci"
  );
  const mouvements = await lire(
    `SELECT t.id FROM "Transaction" t JOIN "Order" o ON o.id = t."orderId"
      WHERE o."sellerId" = ? AND t."createdAt" >= ?`,
    vide.id,
    minuitMoins(JOURS - 1)
  );

  if (mouvements.length > 0) {
    inapplicable(
      "un compte sans mouvement le dit au lieu d'inventer une échelle",
      `vendeur2@koli.ci a ${mouvements.length} écriture(s) sur la période`
    );
  } else {
    const ctxN = await navigateur.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const pageN = await ctxN.newPage();
    await connecter(pageN, "vendeur2@koli.ci");

    const carteN = await carteDe(pageN).innerText();
    verifier(
      /Aucun mouvement sur la période/i.test(carteN),
      "un compte sans mouvement le dit, au lieu d'une courbe plate sans un mot"
    );
    // `Math.max(…, 1)` protège d'une division par zéro. S'il fuyait jusqu'à
    // l'écran, le premier écran d'un nouveau vendeur annoncerait « 1 FCFA ».
    verifier(
      !/(^|\s)1 FCFA/.test(carteN),
      "et n'affiche pas « 1 FCFA », qui est un chiffre qui n'existe pas"
    );

    await ctxN.close();
  }
} finally {
  await navigateur.close();
  for (const id of aNettoyer) {
    await ecrire('DELETE FROM "Order" WHERE id = ?', id);
  }
  if (aNettoyer.length > 0) {
    console.log(`\n  · ${aNettoyer.length} fixture(s) effacee(s)`);
  }
  await fermer();
}

console.log("");
console.log(
  echecs === 0
    ? "Les courbes disent ce que porte le registre, nettes de commission, et le livreur n'y voit que sa paie."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
