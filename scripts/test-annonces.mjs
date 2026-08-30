/**
 * Les vignettes d'activité de la vitrine — ce qu'elles disent, et à qui.
 *
 * Elles annoncent qu'une personne vient de s'inscrire, qu'un vendeur vient
 * d'être payé. Trois choses peuvent mal tourner sans qu'aucune erreur ne
 * s'affiche, et ce sont les trois que ce fichier mesure :
 *
 *   1. LA PHRASE EST COUPÉE. `truncate` tronque en silence : la ligne se
 *      termine par des points de suspension, la page reste valide, et personne
 *      ne le voit tant qu'on ne regarde pas cette carte en particulier. C'est
 *      arrivé à 17 rem — « Awa K. vient de créer son com… ». On mesure donc
 *      `scrollWidth` contre `clientWidth`, annonce par annonce.
 *
 *   2. LA CARTE DÉBORDE. Un élément `fixed` n'allonge pas la page, donc le
 *      contrôle de défilement horizontal du §8 ne le verrait pas — mais à
 *      320 px il serait coupé par le bord de l'écran.
 *
 *   3. LE MOUVEMENT NE S'ARRÊTE PAS. WCAG 2.2.2 : un contenu qui se met à jour
 *      seul au-delà de cinq secondes doit pouvoir être masqué, et
 *      `prefers-reduced-motion` doit figer la rotation. Deux comportements
 *      qu'on ne déclenche jamais par accident en travaillant.
 *
 * On tourne assez longtemps pour voir les SIX annonces (cycle de 7,6 s), et on
 * ne juge que celles dont l'opacité dépasse 0,9 : la carte est montée avant
 * d'être visible — c'est la condition pour que sa transition d'entrée ait un
 * état de départ — et son texte serait donc lisible dans le DOM alors qu'il ne
 * l'est pas à l'écran.
 *
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-annonces.mjs
 *
 * ⚠ Les vignettes sont soumises à `exemplesTemoignagesAutorises()` : sans
 * `RACCOURCIS_DEMO=1` dans `.env.local`, elles n'existent pas et ce contrôle
 * le DIT au lieu de passer au vert — un contrôle qui ne peut pas s'exercer et
 * qui se tait vaut moins que pas de contrôle.
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/** Les six annonces du composant. Le compte est vérifié, pas supposé. */
const ATTENDUES = 6;

let echecs = 0;
function verifier(ok, quoi, detail = "") {
  console.log(
    `  ${ok ? "✓" : "✗"} ${quoi}${detail ? ` — ${detail}` : ""}`
  );
  if (!ok) echecs++;
}

console.log(`\n=== VIGNETTES D'ACTIVITÉ depuis ${BASE} ===\n`);

const nav = await chromium.launch();

/** Le sélecteur de la carte. `data-*` serait plus stable — à faire si elle bouge. */
const SELECTEUR = "div.fixed.bottom-4.left-4";

async function parcourir(largeur) {
  const ctx = await nav.newContext({ viewport: { width: largeur, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });

  const fermer = page.getByRole("button", { name: /Masquer les annonces/ });

  // Absente ? On le dit, et on s'arrête là pour cette largeur.
  if ((await fermer.count()) === 0) {
    verifier(
      false,
      `${largeur} px · les vignettes sont montées`,
      "aucune trouvée — RACCOURCIS_DEMO=1 est-il dans .env.local ?"
    );
    await ctx.close();
    return;
  }

  const carte = page.locator(SELECTEUR);
  const vues = new Set();

  // 40 relevés à 1,5 s couvrent 60 s, pour un tour complet de 3,5 + 6 × 7,6 s.
  for (let tour = 0; tour < 40; tour++) {
    const m = await carte.evaluate((el) => {
      const lignes = el.querySelectorAll("p");
      const detail = lignes[lignes.length - 1];
      return {
        opacite: Number(getComputedStyle(el).opacity),
        texte: detail.textContent,
        tronquee: detail.scrollWidth > detail.clientWidth + 1,
        deborde: el.getBoundingClientRect().right > window.innerWidth + 1,
      };
    });

    if (m.opacite > 0.9 && !vues.has(m.texte)) {
      vues.add(m.texte);
      verifier(!m.tronquee, `${largeur} px · « ${m.texte} » se lit en entier`);
      verifier(!m.deborde, `${largeur} px · « ${m.texte} » tient dans l'écran`);
    }
    await page.waitForTimeout(1500);
  }

  verifier(
    vues.size === ATTENDUES,
    `${largeur} px · les ${ATTENDUES} annonces sont passées`,
    `${vues.size} vue(s)`
  );

  // §74 : la cible tactile. Une croix qu'on rate au pouce est pire que rien.
  const cible = await fermer.boundingBox();
  verifier(
    cible.width >= 44 && cible.height >= 44,
    `${largeur} px · le bouton de fermeture fait au moins 44 px`,
    `${Math.round(cible.width)}×${Math.round(cible.height)}`
  );

  // WCAG 2.2.2 : masquer, et que ce soit définitif. Neuf secondes couvrent un
  // cycle entier — si la vignette devait revenir, elle serait revenue.
  await fermer.click();
  await page.waitForTimeout(9000);
  verifier(
    (await carte.count()) === 0,
    `${largeur} px · une fois fermée, la vignette ne revient pas`
  );

  await ctx.close();
}

await parcourir(1280);
await parcourir(320);

// Mouvement réduit : une annonce, la première, et elle ne tourne plus.
const ctxR = await nav.newContext({
  viewport: { width: 1280, height: 800 },
  reducedMotion: "reduce",
});
const pageR = await ctxR.newPage();
await pageR.goto(BASE, { waitUntil: "networkidle" });
const carteR = pageR.locator(SELECTEUR);

if ((await carteR.count()) === 0) {
  verifier(
    false,
    "mouvement réduit · la vignette est montée",
    "aucune trouvée — RACCOURCIS_DEMO=1 est-il dans .env.local ?"
  );
} else {
  await carteR.waitFor({ state: "visible", timeout: 10000 });
  const avant = await carteR.innerText();
  // Onze secondes : plus d'un cycle. Si elle tournait, elle aurait tourné.
  await pageR.waitForTimeout(11000);
  const apres = await carteR.innerText();
  verifier(
    avant === apres,
    "mouvement réduit · l'annonce ne tourne pas",
    `« ${avant.split("\n").pop()} »`
  );
  verifier(
    avant.includes("Awa K."),
    "mouvement réduit · c'est la PREMIÈRE annonce qui reste, pas une au hasard"
  );
}
await ctxR.close();

await nav.close();

console.log(
  echecs === 0
    ? "\nLes vignettes se lisent en entier, tiennent dans l'écran, et savent s'arrêter.\n"
    : `\n${echecs} problème(s).\n`
);
process.exit(echecs === 0 ? 0 : 1);
