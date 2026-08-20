import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DOSSIER = ".diagnostic";
await mkdir(DOSSIER, { recursive: true });

const LARGEURS = [
  { nom: "mobile", w: 390, h: 844 },
  { nom: "tablette", w: 768, h: 1024 },
  { nom: "desktop", w: 1440, h: 900 },
];

const PAGES = ["/", "/connexion", "/inscription"];

const navigateur = await chromium.launch();

for (const l of LARGEURS) {
  console.log(`\n--- ${l.nom} (${l.w}px) ---`);
  for (const chemin of PAGES) {
    const ctx = await navigateur.newContext({
      viewport: { width: l.w, height: l.h },
    });
    const page = await ctx.newPage();

    const erreurs = [];
    page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 200)));
    page.on("console", (m) => {
      if (m.type() === "error") erreurs.push(m.text().slice(0, 200));
    });

    await page.goto(`${BASE}${chemin}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const m = await page.evaluate(() => {
      const b = document.body;
      const texte = (b?.innerText ?? "").trim();
      const r = b?.getBoundingClientRect();
      return {
        car: texte.length,
        hauteur: Math.round(r?.height ?? 0),
        champs: document.querySelectorAll("input").length,
        boutons: document.querySelectorAll("button").length,
        extrait: texte.slice(0, 70).replace(/\s+/g, " "),
      };
    });

    const nom = chemin === "/" ? "accueil" : chemin.slice(1);
    await page.screenshot({
      path: `${DOSSIER}/${nom}-${l.nom}.png`,
      fullPage: true,
    });

    const souci = m.car < 40 || m.hauteur < 100;
    console.log(
      `${souci ? "✗" : "✓"} ${chemin.padEnd(14)} ${String(m.car).padStart(5)} car. ` +
        `${String(m.hauteur).padStart(5)}px haut. ${m.champs} champs ${m.boutons} boutons`
    );
    if (souci) console.log(`    « ${m.extrait} »`);
    for (const e of [...new Set(erreurs)].slice(0, 3)) {
      console.log(`    erreur : ${e}`);
    }

    await ctx.close();
  }
}

await navigateur.close();
console.log(`\nCaptures dans ${DOSSIER}/`);
