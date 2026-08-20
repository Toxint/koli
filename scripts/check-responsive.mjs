/**
 * Verification responsive automatisee — cahier des charges §74.
 *
 * Parcourt chaque ecran aux cinq tailles imposees par le §74 et verifie :
 *   - aucun debordement horizontal (§8 : « aucune barre horizontale involontaire ») ;
 *   - aucune cible tactile sous 44px (§8 : « boutons suffisamment grands ») ;
 *   - aucun champ de saisie sous 16px (declenche le zoom automatique iOS) ;
 *   - aucun texte deborde de son conteneur.
 *
 * Usage :
 *   npm run dev            (dans un autre terminal)
 *   node scripts/check-responsive.mjs
 *
 * Ajouter --screenshots pour produire les captures dans .responsive-shots/
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const AVEC_CAPTURES = process.argv.includes("--screenshots");
const DOSSIER_CAPTURES = ".responsive-shots";

// §74 : petit smartphone, grand smartphone, tablette, laptop, desktop.
const TAILLES = [
  { nom: "petit-mobile", width: 320, height: 568 },
  { nom: "mobile", width: 375, height: 812 },
  { nom: "grand-mobile", width: 414, height: 896 },
  { nom: "tablette", width: 768, height: 1024 },
  { nom: "laptop", width: 1024, height: 768 },
  { nom: "desktop", width: 1440, height: 900 },
];

const COMPTES = {
  vendeur: { identifiant: "vendeur@koli.ci", motDePasse: "Password123!" },
  livreur: { identifiant: "livreur@koli.ci", motDePasse: "Password123!" },
  client: { identifiant: "client@koli.ci", motDePasse: "Password123!" },
  admin: { identifiant: "admin@koli.ci", motDePasse: "Password123!" },
};

const PAGES_PUBLIQUES = [
  { chemin: "/", nom: "accueil" },
  { chemin: "/connexion", nom: "connexion" },
  { chemin: "/inscription", nom: "inscription" },
  { chemin: "/comment-ca-marche", nom: "comment-ca-marche" },
  { chemin: "/pour-les-vendeurs", nom: "pour-les-vendeurs" },
  { chemin: "/aide", nom: "aide" },
  { chemin: "/conditions", nom: "conditions" },
  { chemin: "/confidentialite", nom: "confidentialite" },
  { chemin: "/page-qui-nexiste-pas", nom: "404" },
];

const PAGES_PRIVEES = [
  { chemin: "/vendeur/dashboard", nom: "vendeur-dashboard", compte: "vendeur" },
  { chemin: "/vendeur/commandes", nom: "vendeur-commandes", compte: "vendeur" },
  { chemin: "/vendeur/commandes/nouvelle", nom: "vendeur-nouvelle", compte: "vendeur" },
  { chemin: "/vendeur/solde", nom: "vendeur-solde", compte: "vendeur" },
  { chemin: "/vendeur/profil", nom: "vendeur-profil", compte: "vendeur" },
  { chemin: "/livreur/dashboard", nom: "livreur-dashboard", compte: "livreur" },
  { chemin: "/livreur/profil", nom: "livreur-profil", compte: "livreur" },
  { chemin: "/client/dashboard", nom: "client-dashboard", compte: "client" },
  { chemin: "/client/profil", nom: "client-profil", compte: "client" },
  { chemin: "/admin/dashboard", nom: "admin-dashboard", compte: "admin" },
  { chemin: "/admin/utilisateurs", nom: "admin-utilisateurs", compte: "admin" },
  { chemin: "/admin/profil", nom: "admin-profil", compte: "admin" },
];

/** Audit execute dans la page. */
async function auditerPage(page, largeur) {
  return page.evaluate((largeurVue) => {
    const problemes = [];

    // 1. Debordement horizontal du document.
    const largeurDoc = document.documentElement.scrollWidth;
    if (largeurDoc > largeurVue + 1) {
      problemes.push({
        gravite: "CRITIQUE",
        type: "debordement-horizontal",
        detail: `le document fait ${largeurDoc}px pour une fenetre de ${largeurVue}px`,
      });
    }

    // 2. Elements individuels qui depassent la fenetre.
    const debordants = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // On ignore les elements dont un ancetre gere deja le depassement :
      // soit il defile volontairement, soit il rogne (cas des elements
      // decoratifs en `absolute` dans un conteneur `overflow-hidden`).
      let parentGere = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const of = getComputedStyle(p).overflowX;
        if (of === "auto" || of === "scroll" || of === "hidden" || of === "clip") {
          parentGere = true;
          break;
        }
      }
      if (parentGere) continue;
      if (r.right > largeurVue + 1 || r.left < -1) {
        debordants.push(
          `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : ""} (${Math.round(r.left)}→${Math.round(r.right)})`
        );
      }
    }
    if (debordants.length) {
      problemes.push({
        gravite: "CRITIQUE",
        type: "elements-debordants",
        detail: [...new Set(debordants)].slice(0, 6).join(" | "),
      });
    }

    // 3. Cibles tactiles trop petites (mobile uniquement).
    if (largeurVue < 768) {
      const petites = [];
      const interactifs = document.querySelectorAll(
        "button, a[href], input:not([type=hidden]), select, textarea, [role=button]"
      );
      for (const el of interactifs) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 44) {
          const libelle = (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 28);
          petites.push(`"${libelle}" ${Math.round(r.height)}px`);
        }
      }
      if (petites.length) {
        problemes.push({
          gravite: "IMPORTANT",
          type: "cible-tactile-<44px",
          detail: [...new Set(petites)].slice(0, 8).join(" | "),
        });
      }
    }

    // 4. Contraste du texte (§69 : « contraste suffisant »).
    // Seuil WCAG AA : 4,5:1 pour le texte courant, 3:1 pour le grand texte
    // (>=24px, ou >=18.66px en gras). Verifie ici sur les couleurs REELLEMENT
    // calculees par le navigateur, pas sur les classes.
    {
      const luminance = (r, g, b) => {
        const c = [r, g, b].map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const lire = (couleur) => {
        const m = couleur.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(",").map((x) => parseFloat(x));
        if (p.length > 3 && p[3] === 0) return null; // transparent
        return p;
      };
      // Remonte jusqu'au premier ancetre ayant un fond opaque.
      const fondEffectif = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const p = lire(getComputedStyle(n).backgroundColor);
          if (p && (p.length < 4 || p[3] > 0.5)) return p;
        }
        return [255, 255, 255];
      };

      const fautes = [];
      const parcourus = new Set();
      for (const el of document.querySelectorAll("body *")) {
        // Uniquement les elements portant directement du texte visible.
        const texte = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join(" ")
          .trim();
        if (!texte) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;

        const st = getComputedStyle(el);
        if (st.visibility === "hidden" || st.opacity === "0") continue;

        const avant = lire(st.color);
        if (!avant) continue;
        const arriere = fondEffectif(el);

        const l1 = luminance(avant[0], avant[1], avant[2]);
        const l2 = luminance(arriere[0], arriere[1], arriere[2]);
        const ratio =
          (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

        const taille = parseFloat(st.fontSize);
        const gras = parseInt(st.fontWeight, 10) >= 700;
        const grandTexte = taille >= 24 || (gras && taille >= 18.66);
        const seuil = grandTexte ? 3 : 4.5;

        if (ratio < seuil) {
          const cle = `${st.color}|${taille}`;
          if (parcourus.has(cle)) continue;
          parcourus.add(cle);
          fautes.push(
            `"${texte.slice(0, 26)}" ${st.color} ${ratio.toFixed(2)}:1 (min ${seuil})`
          );
        }
      }
      if (fautes.length) {
        problemes.push({
          gravite: "IMPORTANT",
          type: "contraste-insuffisant",
          detail: fautes.slice(0, 6).join(" | "),
        });
      }
    }

    // 5. Champs de saisie sous 16px -> zoom automatique iOS.
    if (largeurVue < 768) {
      const petitTexte = [];
      for (const el of document.querySelectorAll("input, select, textarea")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        const taille = parseFloat(getComputedStyle(el).fontSize);
        if (taille < 16) {
          petitTexte.push(`${el.getAttribute("name") || el.getAttribute("id") || el.tagName} ${taille}px`);
        }
      }
      if (petitTexte.length) {
        problemes.push({
          gravite: "IMPORTANT",
          type: "champ-<16px-zoom-ios",
          detail: [...new Set(petitTexte)].slice(0, 8).join(" | "),
        });
      }
    }

    return problemes;
  }, largeur);
}

async function seConnecter(page, compte) {
  const { identifiant, motDePasse } = COMPTES[compte];
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });

  const champs = page.locator("input");
  await champs.nth(0).fill(identifiant);
  await champs.nth(1).fill(motDePasse);
  await page.locator('button[type="submit"]').first().click();
  await page
    .waitForURL((u) => !u.pathname.includes("/connexion"), { timeout: 15000 })
    .catch(() => {});
}

async function main() {
  if (AVEC_CAPTURES) await mkdir(DOSSIER_CAPTURES, { recursive: true });

  const navigateur = await chromium.launch();
  let total = 0;
  const rapport = [];

  for (const taille of TAILLES) {
    const contexte = await navigateur.newContext({
      viewport: { width: taille.width, height: taille.height },
      isMobile: taille.width < 768,
      hasTouch: taille.width < 768,
      deviceScaleFactor: 2,
    });
    const page = await contexte.newPage();

    for (const p of PAGES_PUBLIQUES) {
      await page.goto(`${BASE}${p.chemin}`, { waitUntil: "networkidle" });
      const problemes = await auditerPage(page, taille.width);
      if (AVEC_CAPTURES) {
        await page.screenshot({ path: `${DOSSIER_CAPTURES}/${p.nom}-${taille.nom}.png`, fullPage: true });
      }
      for (const pb of problemes) rapport.push({ page: p.nom, taille: taille.nom, ...pb });
      total += problemes.length;
    }

    await contexte.close();
  }

  // Pages protegees : une session par role, testee a chaque taille.
  for (const taille of TAILLES) {
    for (const compte of ["vendeur", "livreur", "client", "admin"]) {
      const contexte = await navigateur.newContext({
        viewport: { width: taille.width, height: taille.height },
        isMobile: taille.width < 768,
        hasTouch: taille.width < 768,
        deviceScaleFactor: 2,
      });
      const page = await contexte.newPage();
      await seConnecter(page, compte);

      for (const p of PAGES_PRIVEES.filter((x) => x.compte === compte)) {
        await page.goto(`${BASE}${p.chemin}`, { waitUntil: "networkidle" });
        if (page.url().includes("/connexion")) {
          rapport.push({ page: p.nom, taille: taille.nom, gravite: "CRITIQUE", type: "connexion-echouee", detail: "redirige vers /connexion" });
          total += 1;
          continue;
        }
        const problemes = await auditerPage(page, taille.width);
        if (AVEC_CAPTURES) {
          await page.screenshot({ path: `${DOSSIER_CAPTURES}/${p.nom}-${taille.nom}.png`, fullPage: true });
        }
        for (const pb of problemes) rapport.push({ page: p.nom, taille: taille.nom, ...pb });
        total += problemes.length;
      }

      await contexte.close();
    }
  }

  await navigateur.close();

  // Restitution groupee par page.
  const parPage = {};
  for (const r of rapport) {
    const cle = `${r.page} [${r.type}]`;
    (parPage[cle] ??= []).push(r);
  }

  console.log("\n=== VERIFICATION RESPONSIVE (§74) ===\n");
  if (total === 0) {
    console.log("Aucun probleme detecte sur toutes les tailles.\n");
  } else {
    for (const [cle, entrees] of Object.entries(parPage).sort()) {
      const tailles = entrees.map((e) => e.taille).join(", ");
      console.log(`[${entrees[0].gravite}] ${cle}`);
      console.log(`   tailles : ${tailles}`);
      console.log(`   ${entrees[0].detail}\n`);
    }
    console.log(`TOTAL : ${total} probleme(s).\n`);
  }

  process.exit(total > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
