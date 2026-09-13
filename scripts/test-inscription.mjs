/**
 * Reproduit le parcours reel signale : creer un compte, puis se connecter avec.
 *
 * Usage :
 *   BASE_URL=http://172.20.10.7:3000 node scripts/test-inscription.mjs
 */

import { chromium } from "playwright";
import { lireUne, fermer } from "./base-donnees.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

// Suffixe unique : le test doit pouvoir etre rejoue sans se heurter a
// l'unicite du telephone et de l'e-mail.
const marque = Date.now().toString().slice(-7);
const COMPTE = {
  nom: "Test Nouveau Vendeur",
  telephone: `+22507${marque}`,
  email: `test${marque}@exemple.ci`,
  motDePasse: "MotDePasseTest2026",
  boutique: "Boutique de test",
};

console.log(`\n=== INSCRIPTION puis CONNEXION depuis ${BASE} ===\n`);
console.log(`  compte : ${COMPTE.email} / ${COMPTE.telephone}\n`);

const navigateur = await chromium.launch();
let echecs = 0;

const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

// ------------------------------------------------------------ 1. Inscription
{
  const ctx = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 140)));

  await page.goto(`${BASE}/inscription`, { waitUntil: "networkidle" });

  await page.locator("#name").fill(COMPTE.nom);
  await page.locator("#phone").fill(COMPTE.telephone);
  await page.locator("#email").fill(COMPTE.email);
  await page.locator("#password").fill(COMPTE.motDePasse);
  const boutique = page.locator("#businessName");
  if (await boutique.count()) await boutique.fill(COMPTE.boutique);

  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(5000);

  const url = new URL(page.url()).pathname;
  const cookies = await ctx.cookies();
  const session = cookies.find((c) => c.name === "koli_session");
  const texte = await page.evaluate(() => document.body.innerText.trim());

  verifier(
    url === "/vendeur/dashboard",
    "l'inscription mene directement a l'espace vendeur",
    `URL : ${url}`
  );
  verifier(session != null, "le cookie de session est conserve");
  verifier(texte.length > 40, "la page affiche du contenu", `${texte.length} car.`);
  verifier(erreurs.length === 0, "aucune erreur JavaScript", erreurs[0] ?? "");

  await ctx.close();
}

// ------------------------------------------------- 2. Deconnexion / reconnexion
{
  const ctx = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 140)));

  // Navigateur vierge : on se connecte avec le compte tout juste cree.
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill(COMPTE.email);
  await page.locator("#password").fill(COMPTE.motDePasse);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(5000);

  const url = new URL(page.url()).pathname;
  verifier(
    url === "/vendeur/dashboard",
    "connexion par e-mail avec le compte cree",
    `URL : ${url}`
  );

  // Le telephone doit fonctionner aussi comme identifiant.
  const ctx2 = await navigateur.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page2.locator("#identifier").fill(COMPTE.telephone);
  await page2.locator("#password").fill(COMPTE.motDePasse);
  await page2.locator('button[type="submit"]').first().click();
  await page2.waitForTimeout(5000);
  verifier(
    new URL(page2.url()).pathname === "/vendeur/dashboard",
    "connexion par telephone avec le meme compte",
    `URL : ${new URL(page2.url()).pathname}`
  );
  await ctx2.close();

  // Un mauvais mot de passe doit produire un message VISIBLE.
  const ctx3 = await navigateur.newContext();
  const page3 = await ctx3.newPage();
  await page3.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page3.locator("#identifier").fill(COMPTE.email);
  await page3.locator("#password").fill("mauvais-mot-de-passe");
  await page3.locator('button[type="submit"]').first().click();
  await page3.waitForTimeout(4000);
  const alerte = await page3.locator('[role="alert"]').first().count();
  const texte3 = await page3.evaluate(() => document.body.innerText);
  verifier(
    alerte > 0 && /incorrect|tentative/i.test(texte3),
    "un mot de passe errone affiche bien un message d'erreur"
  );
  await ctx3.close();

  verifier(erreurs.length === 0, "aucune erreur JavaScript", erreurs[0] ?? "");
  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Le pays annonce sa MONNAIE, et elle survit a la troncature
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │  Ce champ ne demande pas une adresse : il fixe la monnaie de tous les    │
// │  prix du vendeur.                                                        │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Deux pays de la liste s'appellent « Congo » et n'ont pas la meme monnaie :
// Brazzaville en FCFA, Kinshasa en FC, quatre fois d'ecart sur la valeur. Un
// commercant de Kinshasa qui se trompe de ligne saisit ses prix dans une
// monnaie qui n'est pas la sienne, et ne s'en apercoit qu'a la premiere vente.
//
// ⚠ UN MENU FERME TRONQUE EN SILENCE. Mesure a 320 px : 184 px de place, et
// « Republique Democratique du Congo » en fait 320 a lui seul. Le symbole
// place APRES le nom etait donc le premier morceau coupe — le garde-fou
// disparaissait pour le seul vendeur qu'il vise. Il vient desormais en tete.
//
// Ce controle ne verifie pas que le libelle EXISTE : il verifie que la
// monnaie reste LISIBLE une fois le menu ferme, sur le plus petit ecran.
{
  const ctx = await navigateur.newContext({ viewport: { width: 320, height: 740 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/inscription`, { waitUntil: "networkidle" });

  const lire = async (pays) => {
    await page.locator("#country").selectOption(pays);
    return page.evaluate(() => {
      const s = document.querySelector("#country");
      const st = getComputedStyle(s);
      const c = document.createElement("canvas").getContext("2d");
      c.font = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
      // 20 px pour la fleche du menu, qui recouvre la fin du texte.
      const dispo =
        s.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight) - 20;
      const texte = s.options[s.selectedIndex].textContent.trim();
      let visible = "";
      for (const ch of texte) {
        if (c.measureText(visible + ch).width > dispo) break;
        visible += ch;
      }
      return visible;
    });
  };

  const aide = await page
    .locator("#aide-pays")
    .textContent()
    .catch(() => "");
  verifier(
    /monnaie/i.test(aide ?? ""),
    "le champ Pays DIT qu'il fixe la monnaie",
    (aide ?? "").replace(/s+/g, " ").trim().slice(0, 52)
  );

  /*
   * ⚠ Le contrat a CHANGE le 12 septembre 2026 : seuls les sept pays de la zone
   * franc CFA sont proposes aux VENDEURS.
   *
   * Ce bloc eprouvait « Kinshasa annonce FC — et non FCFA ». Kinshasa n'est
   * plus dans la liste, par decision : iKeePay regle en dollars, et le risque
   * de change du franc congolais (21 % sur un mauvais mois) depasse ce que la
   * commission couvre. Le controle ne disparait pas, il se retourne : ce qui
   * protegeait le vendeur de Kinshasa d'une erreur de ligne, c'est maintenant
   * l'ABSENCE de la ligne.
   *
   * La lecon de la troncature reste vraie — Brazzaville doit toujours annoncer
   * FCFA menu ferme — et elle vaut aussi pour le pays de l'ACHETEUR
   * (FormulaireCommande), ou les deux Congo cohabitent encore.
   */
  const OUVERTS = [
    "Bénin", "Burkina Faso", "Cameroun", "Côte d'Ivoire",
    "Gabon", "République du Congo", "Sénégal",
  ];
  const proposes = await page.evaluate(() =>
    [...document.querySelector("#country").options].map((o) => o.value).filter(Boolean)
  );
  const manquants = OUVERTS.filter((n) => !proposes.includes(n));
  const enTrop = proposes.filter((n) => !OUVERTS.includes(n));
  verifier(
    manquants.length === 0 && enTrop.length === 0,
    "les vendeurs se voient proposer EXACTEMENT les sept pays du franc CFA",
    [
      manquants.length ? "manquants : " + manquants.join(", ") : "",
      enTrop.length ? "en trop : " + enTrop.join(", ") : "",
    ].filter(Boolean).join(" / ")
  );
  verifier(
    !proposes.includes("République Démocratique du Congo"),
    "Kinshasa n'est plus proposé aux vendeurs — le franc congolais n'est pas ouvert"
  );

  const brazza = await lire("République du Congo");
  verifier(
    brazza.startsWith("FCFA"),
    "Brazzaville annonce toujours FCFA, menu fermé et tronqué",
    "« " + brazza + " »"
  );

  // Et tous les autres, pour que l'ajout d'un pays ne casse rien en silence.
  const pays = await page.evaluate(() =>
    [...document.querySelector("#country").options].map((o) => o.value)
  );
  const muets = [];
  for (const p of pays) {
    const vu = await lire(p);
    // Le symbole doit tenir AVANT le tiret : sinon il a ete coupe.
    if (!vu.includes(" — ")) muets.push(`${p} → « ${vu} »`);
  }
  verifier(
    muets.length === 0,
    `la monnaie survit a la troncature pour les ${pays.length} pays`,
    muets.slice(0, 2).join(" | ")
  );

  await ctx.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// La devise CHOISIE l'emporte sur celle du pays
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │  Le pays ne dit pas toujours la monnaie. A Kinshasa, une part            │
// │  importante du commerce s'affiche en dollars.                            │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Le champ vit dans le bloc VENDEUR : un client ou un livreur ne fixe aucun
// prix. On l'eprouve SANS JavaScript, parce que c'est le CSS qui montre ce
// bloc selon le role coche — et que si cela cassait, un vendeur sur reseau
// lent ne verrait jamais la question.
{
  const ctx = await navigateur.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/inscription`, { waitUntil: "domcontentloaded" });

  verifier(await page.locator("#currency").isVisible(), "le vendeur voit le champ Devise");

  await page.locator('label:has(input[value="CLIENT"])').click();
  verifier(
    !(await page.locator("#currency").isVisible()),
    "un client ne le voit pas — il ne fixe aucun prix"
  );
  await page.locator('label:has(input[value="SELLER"])').click();

  const options = await page.evaluate(() =>
    [...document.querySelector("#currency").options].map((o) => ({
      v: o.value,
      t: o.textContent.trim(),
    }))
  );

  /*
   * La PREMIERE option vaut la chaine vide, et c'est elle qui compte.
   *
   * Elle n'ecrit rien en base, et `deviseDuVendeur` retombe alors sur le
   * pays. Si elle portait « XOF », un vendeur qui ne repond pas a la question
   * verrait son repli — revisable — se figer en decision.
   */
  verifier(
    options[0]?.v === "" && /pays/i.test(options[0]?.t ?? ""),
    "la premiere option est « celle de mon pays », et vaut le VIDE",
    options[0]?.t ?? "aucune"
  );
  /*
   * ⚠ Le dollar ETAIT propose — « un usage, pas un pays ». Il ne l'est plus,
   * depuis le 12 septembre 2026 : rien ne prouve qu'iKeePay l'accepte dans son
   * tunnel, et un vendeur qui le choisirait aurait des acheteurs incapables de
   * payer. Seuls les deux francs CFA restent au choix.
   */
  const valeurs = options.map((o) => o.v).filter(Boolean).sort();
  verifier(
    valeurs.join(",") === "XAF,XOF",
    "seuls les deux francs CFA sont au choix — ni le dollar, ni une autre monnaie",
    valeurs.join(", ") || "aucune"
  );
  await ctx.close();
}

// Ce qui compte vraiment : ce que le SERVEUR accepte, et ce qui arrive en base.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │  Filtrer une liste ne protege rien : le pays et la devise voyagent dans  │
// │  le formulaire. Un client hostile ajoute l'option en une ligne.          │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Les deux attaques ci-dessous RAJOUTENT a la main une option retiree de
// l'interface, et verifient qu'aucun compte n'est cree. C'est la garde de
// `registerAction`, pas celle du menu, qui doit tenir.
//
// ⚠ La devise se lit en BASE, pas a l'ecran : XOF et XAF s'affichent tous deux
// « FCFA », l'etiquette du prix ne peut pas les distinguer. Or c'est cette
// colonne qui decidera dans quelle monnaie le vendeur sera VERSE.
{
  const creer = async ({ pays = null, devise = null, injecterPays = null, injecterDevise = null }) => {
    const ctx = await navigateur.newContext();
    const page = await ctx.newPage();
    const telephone = `+22507${Date.now().toString().slice(-8)}`;
    await page.goto(`${BASE}/inscription`, { waitUntil: "networkidle" });
    await page.locator("#name").fill("Essai Devise");
    await page.locator("#phone").fill(telephone);
    await page.locator("#password").fill("MotDePasseDevise1");
    await page.locator("#businessName").fill("Boutique essai");

    if (injecterPays || injecterDevise) {
      await page.evaluate(([p, d]) => {
        for (const [id, v] of [["country", p], ["currency", d]]) {
          if (!v) continue;
          const o = document.createElement("option");
          o.value = v;
          o.textContent = v;
          document.getElementById(id).appendChild(o);
        }
      }, [injecterPays, injecterDevise]);
    }

    await page.locator("#country").selectOption(injecterPays ?? pays);
    const d = injecterDevise ?? devise;
    if (d !== null) await page.locator("#currency").selectOption(d);
    await page.getByRole("button", { name: /Créer mon compte/i }).click();

    /*
     * On attend une CONSEQUENCE, et on la SONDE plutot que de courser deux
     * attentes : une course se resout au premier rejet, et une navigation en
     * cours fait rejeter `waitForURL` (§8, « Un Promise.race entre une
     * navigation et un texte est PIEGE »). Chaque tour relit l'etat reel.
     */
    let alerte = "";
    for (let i = 0; i < 60; i++) {
      const url = page.url();
      if (new URL(url).pathname.startsWith("/vendeur")) break;
      alerte = await page
        /* Le refus s affiche AU-DESSUS du <form>, dans la meme carte — pas
           dedans. `form [role=alert]` ne le voyait donc jamais, et le controle
           annonçait « aucun message » sur un serveur qui refusait tres bien.
           `div` et le filtre sur le texte ecartent l annonceur de route de
           Next, qui porte le meme role et reste vide. */
        .locator("div[role=alert]")
        .filter({ hasText: /\S/ })
        .first()
        .textContent({ timeout: 500 })
        .catch(() => "");
      if (alerte) break;
      await page.waitForTimeout(500);
    }

    const profil = await lireUne(
      `SELECT s.currency, s.country FROM "SellerProfile" s JOIN "User" u ON u.id = s."userId" WHERE u.phone = ?`,
      telephone
    );
    let etiquette = "";
    if (profil) {
      await page.goto(`${BASE}/vendeur/produits/nouveau`, { waitUntil: "domcontentloaded" });
      etiquette = ((await page.locator('label[for="price"]').textContent().catch(() => "")) ?? "")
        .replace(/\s+/g, " ")
        .trim();
    }
    await ctx.close();
    return { profil, alerte: (alerte ?? "").replace(/\s+/g, " ").trim(), etiquette };
  };

  const ivoirien = await creer({ pays: "Côte d'Ivoire" });
  verifier(
    Boolean(ivoirien.profil) && ivoirien.etiquette.includes("FCFA"),
    "Côte d'Ivoire sans choix : le compte est créé, ses prix sont en FCFA",
    ivoirien.alerte || ivoirien.etiquette || "aucun compte"
  );

  const choixXaf = await creer({ pays: "Côte d'Ivoire", devise: "XAF" });
  verifier(
    choixXaf.profil?.currency === "XAF",
    "le choix d'un franc CFA arrive en base, tel quel",
    String(choixXaf.profil?.currency ?? choixXaf.alerte)
  );

  const kinshasa = await creer({ injecterPays: "République Démocratique du Congo" });
  verifier(
    !kinshasa.profil,
    "ATTAQUE — un pays hors zone rajouté à la main : AUCUN compte n'est créé"
  );
  verifier(
    /franc CFA/i.test(kinshasa.alerte),
    "…et le refus dit pourquoi",
    kinshasa.alerte.slice(0, 80) || "aucun message"
  );

  const dollar = await creer({ pays: "Côte d'Ivoire", injecterDevise: "USD" });
  verifier(
    !dollar.profil,
    "ATTAQUE — le dollar rajouté à la main : AUCUN compte n'est créé"
  );
  verifier(
    /franc CFA/i.test(dollar.alerte),
    "…et le refus dit pourquoi",
    dollar.alerte.slice(0, 80) || "aucun message"
  );
}

await navigateur.close();
await fermer();

console.log("");
console.log(
  echecs === 0
    ? "Inscription et connexion fonctionnent de bout en bout."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
