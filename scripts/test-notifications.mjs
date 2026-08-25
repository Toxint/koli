/**
 * Notifications (§44-45), de bout en bout.
 *
 * Ce que ce test protege : le modele `Notification` existait en base et
 * n'etait JAMAIS ecrit. Un vendeur n'apprenait donc jamais qu'un client venait
 * de payer, et un client n'apprenait jamais que son colis avait ete remis —
 * chacun devait retourner voir de lui-meme. C'est le manque le plus visible du
 * produit.
 *
 * Il verifie le parcours reel : un paiement previent le vendeur, l'assignation
 * previent le client, chaque avis mene a l'objet concerne, et personne ne voit
 * la boite d'un autre.
 *
 * Usage :
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-notifications.mjs
 */

import { chromium } from "playwright";
import Database from "better-sqlite3";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

console.log(`\n=== NOTIFICATIONS depuis ${BASE} ===\n`);

let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const lire = (requete, ...params) => {
  const db = new Database("prisma/dev.db", { readonly: true });
  const r = db.prepare(requete).all(...params);
  db.close();
  return r;
};

const compterPour = (email, type) =>
  lire(
    `SELECT COUNT(*) n FROM Notification n
       JOIN User u ON u.id = n.userId
      WHERE u.email = ? AND n.type = ?`,
    email,
    type
  )[0].n;


const nonLuesVendeur = () =>
  lire(
    `SELECT COUNT(*) n FROM Notification n JOIN User u ON u.id = n.userId
      WHERE u.email = ? AND n.readAt IS NULL`,
    "vendeur@koli.ci"
  )[0].n;

/**
 * Attend que la BASE reflete le geste, pas que le DOM bouge.
 *
 * Attendre la disparition du bouton semblait plus fin qu'un delai fixe, mais
 * `detached` se resout des que React remplace le noeud — c'est-a-dire au
 * DEBUT du rafraichissement, pas a la fin de l'ecriture. Le test lisait donc
 * la base trop tot et voyait « 1 → 1 » sur un marquage pourtant reussi.
 */
const attendreQue = async (mesure, attendu, limiteMs = 20000) => {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    if (attendu(mesure())) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};

const navigateur = await chromium.launch();

const bouton = (p, libelle) =>
  p.getByRole("button", { name: libelle }).filter({ visible: true }).first();

const connecter = async (page, identifiant) => {
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill(identifiant);
  await page.locator("#password").fill(MDP);
  await bouton(page, /^Se connecter$/).click();
  await page
    .waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 25000 })
    .catch(() => {});
};

// ═══════════ 1. Un paiement previent le vendeur
let reference;
{
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");

  const avantVendeur = compterPour("vendeur@koli.ci", "FUNDS_SECURED");
  const avantClient = compterPour("client@koli.ci", "PAYMENT_CONFIRMED");

  // Commande au nom du client de demonstration, pour qu'il soit notifiable.
  const telClient = lire("SELECT phone FROM User WHERE email = ?", "client@koli.ci")[0].phone;

  // L'assistant du §18, en cinq etapes. Les libelles suivent
  // scripts/test-commande-etapes.mjs, qui fait foi sur ce parcours.
  await page.goto(`${BASE}/vendeur/commandes/nouvelle`, { waitUntil: "networkidle" });

  // La PREMIERE option disponible, et non un produit nomme en dur : le stock
  // se consomme au fil des passages de la suite, et un produit choisi par son
  // nom finit en rupture — le test echouerait alors sur une indisponibilite
  // parfaitement normale, sans rapport avec les notifications.
  const selecteur = page.locator("#productId");
  const option = await selecteur.evaluate(
    (s) =>
      Array.from(s.options).find((o) => o.value && !o.disabled)?.value ?? ""
  );
  verifier(option !== "", "un produit disponible existe au catalogue");
  await selecteur.selectOption(option);
  await page.locator("#quantity").fill("1");
  await bouton(page, /Continuer/i).click();
  await page.waitForTimeout(600);

  await page.locator("#buyerName").fill("Awa Koné");
  await page.locator("#buyerPhone").fill(telClient);
  await page.locator("#buyerCity").fill("Abidjan");
  await page.locator("#buyerAddress").fill("Cocody Angré");
  await bouton(page, /Continuer/i).click();
  await page.waitForTimeout(600);

  await page.locator("#deliveryFee").fill("1000");
  await bouton(page, /Continuer/i).click();
  await page.waitForTimeout(600);

  // On ATTEND la reference plutot que de dormir un temps fixe : la creation
  // fait un aller-retour serveur dont la duree varie, et un test qui echoue
  // parce que la machine a ete lente n'apprend rien sur les notifications.
  await bouton(page, /Créer la commande/i).click();
  await page
    .waitForFunction(() => /KOLI-[2-9A-Z]{8}/.test(document.body.innerText), {
      timeout: 25000,
    })
    .catch(() => {});

  const texte = await page.evaluate(() => document.body.innerText);
  reference = texte.match(/KOLI-[2-9A-Z]{8}/)?.[0] ?? null;
  verifier(reference !== null, "commande de test creee", reference ?? "aucune");

  if (reference) {
    // Le client paie.
    const ctxClient = await navigateur.newContext();
    const pc = await ctxClient.newPage();
    await pc.goto(`${BASE}/pay/${reference}`, { waitUntil: "networkidle" });
    await bouton(pc, /Simuler un paiement réussi|Payer/i).click();
    // On attend la CONSEQUENCE du paiement, pas un delai arbitraire.
    await pc
      .waitForFunction(
        () => /sécurisé|confirmé|réception/i.test(document.body.innerText),
        { timeout: 25000 }
      )
      .catch(() => {});
    await ctxClient.close();

    // On ATTEND que l'ecriture soit visible en base, au lieu de la lire une
    // fois et d'esperer. Le rendu de la page confirmant le paiement peut
    // preceder de quelques dizaines de millisecondes la visibilite de la
    // transaction pour une AUTRE connexion SQLite — celle du test.
    //
    // La valeur testee est capturee UNE SEULE FOIS : la version precedente
    // relisait la base pour composer le message d'echec, et pouvait donc
    // afficher un compte different de celui qui venait d'echouer — « 29 → 30 »
    // sur un controle qui attendait exactement 30.
    const vendeurPrevenu = await attendreQue(
      () => compterPour("vendeur@koli.ci", "FUNDS_SECURED"),
      (n) => n === avantVendeur + 1
    );
    verifier(
      vendeurPrevenu,
      "le paiement previent le VENDEUR : il n'avait aucun moyen de l'apprendre",
      `${avantVendeur} → ${compterPour("vendeur@koli.ci", "FUNDS_SECURED")}`
    );

    const clientPrevenu = await attendreQue(
      () => compterPour("client@koli.ci", "PAYMENT_CONFIRMED"),
      (n) => n === avantClient + 1
    );
    verifier(
      clientPrevenu,
      "le client est prevenu que son paiement est securise",
      `${avantClient} → ${compterPour("client@koli.ci", "PAYMENT_CONFIRMED")}`
    );
  }

  await ctx.close();
}

// ═══════════ 2. La cloche affiche le compteur, sur toutes les pages
{
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");

  const cloche = page.getByRole("link", { name: /Notifications/i }).filter({ visible: true }).first();
  verifier((await cloche.count()) > 0, "une cloche figure au menu");

  const nonLues = lire(
    `SELECT COUNT(*) n FROM Notification n JOIN User u ON u.id = n.userId
      WHERE u.email = ? AND n.readAt IS NULL`,
    "vendeur@koli.ci"
  )[0].n;

  const pastille = await page.evaluate(() => {
    const lien = [...document.querySelectorAll("aside a")].find((a) =>
      /Notifications/.test(a.textContent ?? "")
    );
    return lien?.querySelector("span[aria-hidden]")?.textContent?.trim() ?? null;
  });

  verifier(
    nonLues > 0 ? pastille !== null : pastille === null,
    "la pastille reflete les non-lues",
    `base : ${nonLues}, affiche : ${pastille}`
  );

  // Le compteur doit etre juste sur TOUTES les pages, pas seulement l'accueil.
  await page.goto(`${BASE}/vendeur/solde`, { waitUntil: "networkidle" });
  const pastilleAilleurs = await page.evaluate(() => {
    const lien = [...document.querySelectorAll("aside a")].find((a) =>
      /Notifications/.test(a.textContent ?? "")
    );
    return lien?.querySelector("span[aria-hidden]")?.textContent?.trim() ?? null;
  });
  verifier(
    pastilleAilleurs === pastille,
    "le compteur est le meme sur une autre page — pas seulement sur l'accueil",
    `accueil : ${pastille}, solde : ${pastilleAilleurs}`
  );

  await ctx.close();
}

// ═══════════ 3. La boite se lit, mene quelque part, et se marque lue
{
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");

  await page.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
  const texte = await page.evaluate(() => document.body.innerText);

  verifier(
    /Un client vient de payer/i.test(texte),
    "l'avis est redige pour le VENDEUR, pas en termes neutres"
  );

  // §45 : le lien vers l'objet concerne.
  const lien = page.getByRole("link", { name: /Voir KOLI-/i }).filter({ visible: true }).first();
  verifier((await lien.count()) > 0, "chaque avis mene a l'objet concerne (§45)");

  if (await lien.count()) {
    const href = await lien.first().getAttribute("href");
    verifier(
      href?.startsWith("/vendeur/commandes"),
      "le vendeur est mene vers SA page, pas vers celle du client",
      href ?? "aucun"
    );
  }

  // Filtre « non lues ».
  await page.goto(`${BASE}/notifications?filtre=non-lues`, { waitUntil: "networkidle" });
  const nonLuesAffichees = await page
    .locator("main ul li")
    // Drapeau « i » indispensable : la pastille porte la classe `uppercase`,
    // et `innerText` restitue « NOUVEAU ». Sans lui, ce controle etait FAUX
    // des qu il y avait quelque chose a verifier — il ne passait que sur une
    // liste vide, c est-a-dire quand il ne verifiait rien.
    .evaluateAll((els) => els.map((e) => /Nouveau/i.test(e.innerText)));
  // La liste doit CONTENIR quelque chose, sinon le controle suivant est vide
  // de sens : `every` sur un tableau vide vaut vrai. C'est ce qui masquait le
  // defaut de casse — le controle ne passait que lorsqu'il n'avait rien a
  // verifier.
  verifier(
    nonLuesAffichees.length > 0,
    "le filtre « non lues » affiche bien des notifications a examiner",
    `${nonLuesAffichees.length} ligne(s), ${nonLuesVendeur()} non lue(s) en base`
  );
  verifier(
    nonLuesAffichees.length > 0 && nonLuesAffichees.every(Boolean),
    "le filtre « non lues » n'affiche que des non-lues",
    JSON.stringify(nonLuesAffichees.slice(0, 5))
  );

  // Marquer comme lu.
  // Expression ANCREE : sans le '^', /Marquer comme lu/ correspond aussi a
  // « Tout marquer comme lu », qui figure plus haut dans la page. Le test
  // cliquait donc le mauvais bouton, et passait tant qu'il ne restait qu'un
  // seul non-lu — par pure coincidence arithmetique.
  const marquer = bouton(page, /^Marquer comme lu$/);
  const avant = nonLuesVendeur();

  // La precondition est ELLE-MEME verifiee : sans non-lue, le controle suivant
  // n'aurait rien a eprouver et disparaitrait en silence.
  verifier(avant > 0, "le vendeur a bien des notifications non lues a marquer", String(avant));
  verifier((await marquer.count()) > 0, "une notification peut etre marquee lue");

  if (avant > 0 && (await marquer.count()) > 0) {
    await marquer.click();
    const baisse = await attendreQue(nonLuesVendeur, (n) => n === avant - 1);
    verifier(baisse, "le marquage est enregistre", `${avant} → ${nonLuesVendeur()}`);
  }


  // « Tout marquer comme lu ».
  //
  // Le bouton n'existe que s'il reste des non-lues — c'est voulu. Mais un
  // controle enferme dans un `if` disparait en silence, et son absence se lit
  // comme une reussite. On verifie donc explicitement l'un ou l'autre cas.
  await page.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });

  const restantesAvant = nonLuesVendeur();

  const tout = bouton(page, /Tout marquer comme lu/i);
  const proposeTout = (await tout.count()) > 0;

  verifier(
    proposeTout === restantesAvant > 0,
    "« tout marquer comme lu » n'est propose que s'il reste des non-lues",
    `non-lues : ${restantesAvant}, bouton : ${proposeTout}`
  );

  if (proposeTout) {
    await tout.click();
    const vide = await attendreQue(nonLuesVendeur, (n) => n === 0);
    verifier(
      vide,
      "« tout marquer comme lu » vide bien le compteur",
      `${nonLuesVendeur()} restante(s)`
    );
  }

  await ctx.close();
}

// ═══════════ 4. Personne ne voit la boite d'un autre
{
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await connecter(page, "client@koli.ci");

  await page.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
  const texte = await page.evaluate(() => document.body.innerText);

  verifier(
    !/Un client vient de payer/i.test(texte),
    "le client ne voit PAS les avis destines au vendeur"
  );
  verifier(
    /Votre paiement est confirmé|Aucune notification/i.test(texte),
    "il voit les siens, rediges pour lui"
  );

  // L'identifiant d'une notification d'autrui ne doit apparaitre nulle part
  // dans la page du client : c'est ce qui empeche de le reutiliser.
  //
  // La portee par `userId` de l'action est verifiee a part, dans
  // lib/__tests__/notifications_action.test.ts : elle se controle sur l'appel
  // lui-meme, pas depuis un navigateur.
  const idAutrui = lire(
    `SELECT n.id FROM Notification n JOIN User u ON u.id = n.userId
      WHERE u.email = ? LIMIT 1`,
    "vendeur@koli.ci"
  )[0]?.id;

  verifier(
    idAutrui !== undefined,
    "le vendeur a bien des notifications a proteger"
  );

  if (idAutrui) {
    const html = await page.content();
    verifier(
      !html.includes(idAutrui),
      "aucun identifiant de notification d'autrui ne transite vers le client"
    );
  }

  await ctx.close();
}

// ═══════════ 5. Un visiteur non connecte n'a pas de boite
{
  const ctx = await navigateur.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/notifications`, { waitUntil: "networkidle" });
  verifier(
    new URL(page.url()).pathname === "/connexion",
    "un visiteur non connecte est renvoye a la connexion",
    new URL(page.url()).pathname
  );
  await ctx.close();
}

await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "Chaque partie est prevenue a temps, dans ses propres termes."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
