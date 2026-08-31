/**
 * Les vignettes d'activité de la vitrine — disent-elles ce que porte le
 * registre ?
 *
 * Elles annonçaient six phrases écrites à la main, marquées « exemple » et
 * retenues hors ligne par une garde. Elles lisent maintenant la base
 * (`lib/notifications/activite.ts`) : une inscription affichée est une
 * inscription qui a eu lieu.
 *
 * Ce contrôle a donc changé de nature. Il ne vérifie plus que six chaînes
 * connues s'affichent — il confronte L'ÉCRAN AU REGISTRE, comme le reste de la
 * campagne. C'est le seul contrôle qui puisse encore attraper le retour d'un
 * texte inventé.
 *
 * Six choses sont éprouvées :
 *
 *  1. Chaque annonce affichée correspond à une ligne de la base.
 *  2. Aucune ne porte le mot « exemple » — la mention n'a plus d'objet, et sa
 *     réapparition signalerait un retour en arrière.
 *  3. Les noms sont ABRÉGÉS : « Awa K. », jamais le nom complet. Ce sont de
 *     vraies personnes et cette page est publique.
 *  4. La phrase se lit en entier — `truncate` coupe en silence, sans erreur.
 *  5. La carte tient dans l'écran à 320 px. Un élément `fixed` n'allonge pas
 *     la page : le contrôle de défilement du §8 ne le verrait pas.
 *  6. WCAG 2.2.2 — le bouton fait 44 px, et masquer est définitif.
 *
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-annonces.mjs
 */
import { chromium } from "playwright";
import { lire, fermer } from "./base-donnees.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SELECTEUR = "div.fixed.bottom-4.left-4";
const FENETRE_JOURS = 14;

let echecs = 0;
const verifier = (ok, quoi, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${quoi}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const inapplicable = (quoi, pourquoi) =>
  console.log(`  ~ ${quoi} — non éprouvé : ${pourquoi}`);

console.log(`\n=== VIGNETTES D'ACTIVITÉ depuis ${BASE} ===\n`);

/**
 * Ce que la base porte, selon la MÊME règle que le composant.
 *
 * On recopie la règle plutôt que d'importer le module : celui-ci passe par
 * Prisma et le client Next, que ce script n'a pas. Recopier une règle est un
 * risque connu — c'est pourquoi on ne recopie que la SÉLECTION (quoi, sur
 * quelle fenêtre), et jamais la mise en forme, qui est justement ce qu'on
 * vérifie à l'écran.
 */
const depuis = new Date(Date.now() - FENETRE_JOURS * 24 * 60 * 60 * 1000);

const inscrits = await lire(
  `SELECT name, "createdAt" FROM "User"
    WHERE "createdAt" >= ? AND status = 'ACTIVE'
      AND role IN ('CLIENT','SELLER','DRIVER')
    ORDER BY "createdAt" DESC LIMIT 6`,
  depuis
);

const verses = await lire(
  `SELECT u.name, t.amount, t."createdAt"
     FROM "Transaction" t
     JOIN "Order" o ON o.id = t."orderId"
     JOIN "SellerProfile" sp ON sp.id = o."sellerId"
     JOIN "User" u ON u.id = sp."userId"
    WHERE t.type = 'FUNDS_RELEASED' AND t."createdAt" >= ?
    ORDER BY t."createdAt" DESC LIMIT 6`,
  depuis
);

/** Le prénom seul suffit à reconnaître : le nom, lui, ne doit PAS apparaître. */
const prenom = (n) => String(n).trim().split(/\s+/)[0];
const nomDeFamille = (n) => {
  const m = String(n).trim().split(/\s+/);
  return m.length > 1 ? m[m.length - 1] : null;
};

const attendus = [...inscrits, ...verses];
console.log(
  `  base : ${inscrits.length} inscription(s), ${verses.length} versement(s) ` +
    `sur ${FENETRE_JOURS} jours\n`
);

const navigateur = await chromium.launch();

async function parcourir(largeur) {
  const ctx = await navigateur.newContext({ viewport: { width: largeur, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });

  const carte = page.locator(SELECTEUR);

  /*
   * Rien en base = rien à l'écran. C'est le comportement voulu, et il se
   * vérifie : une vitrine qui annonce une activité qu'elle n'a pas est
   * exactement le défaut qu'on vient de retirer.
   */
  if (attendus.length === 0) {
    verifier(
      (await carte.count()) === 0,
      `${largeur} px · rien en base, donc rien ne s'affiche`
    );
    await ctx.close();
    return;
  }

  if ((await carte.count()) === 0) {
    verifier(false, `${largeur} px · la vignette est montée`, "introuvable");
    await ctx.close();
    return;
  }

  const vues = new Set();

  // Le cycle fait 7,6 s ; 40 relevés à 1,5 s couvrent largement six annonces.
  for (let tour = 0; tour < 40; tour++) {
    const m = await carte.evaluate((el) => {
      const lignes = el.querySelectorAll("p");
      const detail = lignes[lignes.length - 1];
      return {
        opacite: Number(getComputedStyle(el).opacity),
        texte: detail.textContent ?? "",
        entier: el.innerText,
        tronquee: detail.scrollWidth > detail.clientWidth + 1,
        deborde: el.getBoundingClientRect().right > window.innerWidth + 1,
      };
    });

    // Seules comptent les annonces réellement VISIBLES : la carte est montée
    // avant d'être révélée, et son texte serait lisible dans le DOM alors
    // qu'il ne l'est pas à l'écran.
    if (m.opacite > 0.9 && !vues.has(m.texte)) {
      vues.add(m.texte);
      verifier(!m.tronquee, `${largeur} px · « ${m.texte} » se lit en entier`);
      verifier(!m.deborde, `${largeur} px · « ${m.texte} » tient dans l'écran`);
      verifier(
        !/exemple/i.test(m.entier),
        `${largeur} px · « ${m.texte} » ne porte pas la mention « exemple »`
      );

      // Le fond du contrôle : cette phrase correspond-elle à quelqu'un ?
      const correspond = attendus.some((a) =>
        m.texte.includes(prenom(a.name))
      );
      verifier(
        correspond,
        `${largeur} px · « ${m.texte} » correspond à une ligne du registre`
      );
    }
    await page.waitForTimeout(1500);
  }

  verifier(
    vues.size > 0,
    `${largeur} px · au moins une annonce est passée`,
    `${vues.size} vue(s)`
  );

  /*
   * Le NOM DE FAMILLE ne doit apparaître nulle part.
   *
   * Ce sont de vraies personnes et cette page est publique. Le composant
   * abrège en « Awa K. » ; si quelqu'un retire l'abréviation un jour, c'est ce
   * contrôle qui le dira — et personne d'autre.
   */
  const noms = attendus.map((a) => nomDeFamille(a.name)).filter(Boolean);
  const fuite = noms.find((n) => n.length > 1 && [...vues].some((v) => v.includes(n)));
  verifier(!fuite, `${largeur} px · aucun nom de famille n'est affiché en entier`, fuite ?? "");

  const cible = await page
    .getByRole("button", { name: /Masquer les annonces/ })
    .boundingBox();
  verifier(
    cible !== null && cible.width >= 44 && cible.height >= 44,
    `${largeur} px · le bouton de fermeture fait au moins 44 px`,
    cible ? `${Math.round(cible.width)}×${Math.round(cible.height)}` : "absent"
  );

  await page.getByRole("button", { name: /Masquer les annonces/ }).click();
  await page.waitForTimeout(9000);
  verifier(
    (await carte.count()) === 0,
    `${largeur} px · une fois fermée, la vignette ne revient pas`
  );

  await ctx.close();
}

await parcourir(1280);
await parcourir(320);

// ── Mouvement réduit : une annonce, la première, et elle ne tourne plus.
if (attendus.length === 0) {
  inapplicable("mouvement réduit", "aucune activité en base");
} else {
  const ctx = await navigateur.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  const carte = page.locator(SELECTEUR);

  if ((await carte.count()) === 0) {
    verifier(false, "mouvement réduit · la vignette est montée", "introuvable");
  } else {
    await carte.waitFor({ state: "visible", timeout: 10000 });
    const avant = await carte.innerText();
    await page.waitForTimeout(11000);
    verifier(
      avant === (await carte.innerText()),
      "mouvement réduit · l'annonce ne tourne pas",
      `« ${avant.split("\n").pop()} »`
    );
  }
  await ctx.close();
}

await navigateur.close();
await fermer();

console.log(
  echecs === 0
    ? "\nLes vignettes disent ce que porte le registre, se lisent en entier, et savent s'arrêter.\n"
    : `\n${echecs} problème(s).\n`
);
process.exit(echecs === 0 ? 0 : 1);
