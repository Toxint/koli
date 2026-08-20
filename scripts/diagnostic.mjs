/**
 * Diagnostic : ce que le navigateur voit REELLEMENT sur chaque page.
 *
 * Capture les erreurs console, les exceptions JavaScript, les requetes en
 * echec, et mesure la quantite de texte effectivement rendue. Une page qui
 * repond 200 mais s'affiche blanche passe inapercue d'un simple test HTTP.
 */

import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const PAGES = [
  "/",
  "/connexion",
  "/inscription",
  "/comment-ca-marche",
  "/pour-les-vendeurs",
  "/aide",
  "/conditions",
  "/confidentialite",
];

const navigateur = await chromium.launch();

for (const chemin of PAGES) {
  const contexte = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await contexte.newPage();

  const erreurs = [];
  page.on("console", (m) => {
    if (m.type() === "error") erreurs.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => erreurs.push(`exception: ${e.message.slice(0, 200)}`));
  page.on("requestfailed", (r) =>
    erreurs.push(`requete KO: ${r.url().slice(0, 90)}`)
  );

  let statut = "?";
  try {
    const reponse = await page.goto(`${BASE}${chemin}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    statut = reponse?.status() ?? "?";
  } catch (e) {
    erreurs.push(`navigation: ${e.message.slice(0, 120)}`);
  }

  // Laisse le temps a l'hydratation de planter, le cas echeant.
  await page.waitForTimeout(1500);

  const mesure = await page.evaluate(() => {
    const texte = (document.body?.innerText ?? "").trim();
    return {
      caracteres: texte.length,
      elements: document.body?.querySelectorAll("*").length ?? 0,
      boutons: document.querySelectorAll("button, a[href]").length,
      debut: texte.slice(0, 60).replace(/\s+/g, " "),
    };
  });

  const vide = mesure.caracteres < 40;
  const marque = vide || erreurs.length ? "✗" : "✓";

  console.log(
    `${marque} ${chemin.padEnd(22)} ${String(statut).padEnd(4)} ` +
      `${String(mesure.caracteres).padStart(5)} car. ` +
      `${String(mesure.boutons).padStart(3)} liens`
  );
  if (vide) console.log(`    !! PAGE VIDE — « ${mesure.debut} »`);
  for (const e of [...new Set(erreurs)].slice(0, 4)) {
    console.log(`    ${e}`);
  }

  await contexte.close();
}

await navigateur.close();
