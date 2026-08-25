/**
 * Phase 20 — Factures (§38).
 *
 * La pièce elle-même existait déjà : émise dans la transaction du paiement,
 * consultable à `/facture/<référence>`, avec les douze mentions du §38 (déjà
 * vérifiées par `verif:parcours`). Ce que ce test protège, c'est ce qui
 * manquait :
 *
 *  1. Les factures se consultent ENSEMBLE — le vendeur n'en atteignait une que
 *     depuis la ligne de sa commande, le client que depuis son lien de paiement.
 *  2. Le CLOISONNEMENT : une facture porte le nom, le téléphone et l'adresse
 *     d'un client. La laisser fuir est une fuite de données personnelles.
 *  3. La NUMÉROTATION est séquentielle, sans doublon, et remise à zéro chaque
 *     année.
 *  4. Un client retrouve ses reçus même s'il a acheté SANS COMPTE.
 *
 * Usage :
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-factures.mjs
 */

import { chromium } from "playwright";
import { lire, lireUne, ecrire } from "./base-donnees.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

const un = lireUne;
const tous = lire;

/**
 * L'instant courant, tel que Postgres l'attend.
 *
 * Du temps de SQLite, Prisma stockait les `DateTime` en TEXTE ISO-8601 et il
 * fallait reproduire ce format au caractère près. Postgres a un vrai type
 * `timestamp` : le pilote convertit une date ISO, et le suffixe `+00:00`
 * bricolé n'a plus lieu d'être.
 */
const maintenantISO = () => new Date().toISOString();

/**
 * Fixtures posées EN BASE, et non par l'interface.
 *
 * Deux situations doivent être vérifiées mais n'existent pas dans le jeu de
 * données : une facture appartenant à un autre vendeur, et un achat fait SANS
 * COMPTE. Les créer par le parcours complet coûterait dix minutes de clics
 * pour tester une lecture — or c'est bien la lecture, et son cloisonnement,
 * qui est en jeu ici. Le chemin d'écriture est couvert par `verif:parcours`.
 *
 * Tout est préfixé `fx-fac-` et supprimé à la fin : un test qui laisse des
 * traces fausse les suivants.
 */
const PREFIXE_FIXTURE = "fx-fac-";
let numeroFixture = 900000;

async function poserFacture({ sellerId, customerId, buyerPhone, buyerName, montant }) {
  const suffixe = `${Date.now()}-${numeroFixture}`;
  const orderId = `${PREFIXE_FIXTURE}o-${suffixe}`;
  const reference = `KOLI-FX${String(numeroFixture).slice(-6)}`;
  const quand = maintenantISO();

  await ecrire(
    `INSERT INTO "Order"
       (id, reference, "sellerId", "customerId", "buyerName", "buyerPhone",
        "buyerCountry", "buyerCity", "buyerAddress", "deliveryFee", currency,
        status, "createdAt", "updatedAt")
     VALUES (?, ?, ?, ?, ?, ?, 'Côte d''Ivoire', 'Abidjan', 'Cocody', 0,
             'XOF', 'COMPLETED', ?, ?)`,
    orderId,
    reference,
    sellerId,
    customerId,
    buyerName,
    buyerPhone,
    quand,
    quand
  );

  await ecrire(
    `INSERT INTO "Payment" (id, "orderId", provider, status, amount, "createdAt", "confirmedAt")
     VALUES (?, ?, 'TEST', 'SUCCEEDED', ?, ?, ?)`,
    `${PREFIXE_FIXTURE}p-${suffixe}`,
    orderId,
    montant,
    quand,
    quand
  );

  // Numéro hors de la plage réelle (rang 9xxxxx) : il ne peut pas entrer en
  // collision avec la numérotation de l'application.
  const numero = `FAC-${new Date().getFullYear()}-${String(numeroFixture).padStart(6, "0")}`;
  await ecrire(
    `INSERT INTO "Invoice" (id, "orderId", number, "createdAt") VALUES (?, ?, ?, ?)`,
    `${PREFIXE_FIXTURE}i-${suffixe}`,
    orderId,
    numero,
    quand
  );

  numeroFixture += 1;
  return { orderId, reference, numero };
}

async function nettoyerFixtures() {
  // L'ordre importe : Invoice et Payment référencent Order.
  await ecrire(`DELETE FROM "Invoice" WHERE id LIKE '${PREFIXE_FIXTURE}%'`);
  await ecrire(`DELETE FROM "Payment" WHERE id LIKE '${PREFIXE_FIXTURE}%'`);
  await ecrire(`DELETE FROM "Order" WHERE id LIKE '${PREFIXE_FIXTURE}%'`);
}

console.log(`\n=== FACTURES depuis ${BASE} ===\n`);

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
  await page
    .waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 25000 })
    .catch(() => {});
  await page.waitForTimeout(600);
};

const texte = (page) => page.evaluate(() => document.body.innerText);
const numerosAffiches = (page) =>
  page
    .locator("ul[data-factures] li")
    .evaluateAll((els) =>
      els.map((e) => (e.innerText.match(/FAC-\d{4}-\d{6}/) ?? [""])[0])
    );

try {
  // Restes d'une exécution interrompue : on repart d'une base propre.
  (await nettoyerFixtures());

  const idVendeurPrincipal = (await un(
    `SELECT s.id FROM "SellerProfile" s JOIN "User" u ON u.id = s."userId"
      WHERE u.email = 'vendeur@koli.ci'`
  )).id;
  const clientCompte = (await un(
    `SELECT u.phone, c.id AS profil FROM "User" u
       JOIN "CustomerProfile" c ON c."userId" = u.id
      WHERE u.email = 'client@koli.ci'`
  ));
  const autreVendeur = (await un(
    `SELECT id FROM "SellerProfile" WHERE id <> ? LIMIT 1`,
    idVendeurPrincipal
  ));

  // Facture d'un concurrent : elle ne doit JAMAIS apparaître au vendeur.
  const factureConcurrent = autreVendeur
    ? (await poserFacture({
        sellerId: autreVendeur.id,
        customerId: null,
        buyerName: "Client du concurrent",
        buyerPhone: "+2250700000001",
        montant: 33000,
      }))
    : null;

  // Achat SANS COMPTE au nom du client : `customerId` nul, seul le téléphone
  // rattache. C'est la situation de la majorité du public visé.
  const factureInvitee = (await poserFacture({
    sellerId: idVendeurPrincipal,
    customerId: null,
    buyerName: "Achat invité",
    buyerPhone: clientCompte.phone,
    montant: 12000,
  }));

  // ═══════════ 1. La numérotation, telle qu'elle est REELLEMENT en base
  const facturesBase = (await tous(
    `SELECT number FROM "Invoice" ORDER BY number ASC`
  )).map((f) => f.number);

  verifier(
    facturesBase.length > 0,
    "des factures existent en base",
    `${facturesBase.length}`
  );
  verifier(
    facturesBase.every((n) => /^FAC-\d{4}-\d{6}$/.test(n)),
    "toutes respectent le format FAC-AAAA-NNNNNN",
    facturesBase.find((n) => !/^FAC-\d{4}-\d{6}$/.test(n)) ?? ""
  );

  // Le doublon est le vrai danger : un trou se constate et s'explique, un
  // numero reutilise invalide le registre.
  const doublons = facturesBase.filter((n, i) => facturesBase.indexOf(n) !== i);
  verifier(doublons.length === 0, "aucun numero en double", doublons.join(", "));

  // Une facture par paiement abouti, ni plus ni moins.
  const paiementsAboutis = (await un(
    `SELECT COUNT(*) n FROM "Payment" WHERE status = 'SUCCEEDED'`
  )).n;
  verifier(
    facturesBase.length === paiementsAboutis,
    "une facture par paiement abouti, exactement",
    `${facturesBase.length} factures / ${paiementsAboutis} paiements`
  );

  // Chaque annee repart de 1 : deux annees ne partagent aucun numero.
  const parAnnee = new Map();
  for (const n of facturesBase) {
    const annee = n.slice(4, 8);
    parAnnee.set(annee, [...(parAnnee.get(annee) ?? []), Number(n.slice(-6))]);
  }
  for (const [annee, rangs] of parAnnee) {
    verifier(
      Math.min(...rangs) === 1,
      `l'annee ${annee} commence bien au rang 1`,
      `min = ${Math.min(...rangs)}`
    );
  }

  // ═══════════ 2. Le vendeur voit ses factures ensemble
  const ctxVendeur = await navigateur.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const vendeur = await ctxVendeur.newPage();
  await connecter(vendeur, "vendeur@koli.ci");

  const pageVendeur = await vendeur.goto(`${BASE}/vendeur/factures`, {
    waitUntil: "networkidle",
  });
  verifier(pageVendeur.status() === 200, "la page Factures du vendeur existe");
  verifier(
    /Factures/i.test(await texte(vendeur)),
    "« Factures » figure au menu du vendeur (§10)"
  );

  const affichees = await numerosAffiches(vendeur);
  verifier(affichees.length > 0, "des factures sont listees", `${affichees.length}`);
  verifier(
    affichees.every(Boolean),
    "chaque ligne porte son numero de facture"
  );

  // Tri decroissant : la plus recente en premier, ce qu'on attend d'un
  // historique. Le format a zeros completes rend le tri alphabetique correct.
  const trie = [...affichees].sort().reverse();
  verifier(
    JSON.stringify(affichees) === JSON.stringify(trie),
    "les factures sont listees de la plus recente a la plus ancienne",
    affichees.slice(0, 3).join(" | ")
  );

  // ═══════════ 3. Cloisonnement : les factures d'un vendeur lui appartiennent
  const idVendeur = idVendeurPrincipal;

  const siennes = new Set(
    (await tous(
      `SELECT i.number FROM "Invoice" i
         JOIN "Order" o ON o.id = i."orderId"
        WHERE o."sellerId" = ?`,
      idVendeur
    )).map((r) => r.number)
  );
  verifier(
    affichees.every((n) => siennes.has(n)),
    "il ne voit QUE ses propres factures",
    affichees.filter((n) => !siennes.has(n)).join(", ")
  );

  // La facture du concurrent existe bel et bien (fixture posee plus haut) :
  // le test ne peut donc pas passer par simple absence de donnees.
  verifier(
    factureConcurrent !== null,
    "une facture concurrente existe pour eprouver le cloisonnement"
  );

  if (factureConcurrent) {
    verifier(
      !affichees.includes(factureConcurrent.numero),
      "la facture d'un concurrent n'apparait pas dans la liste",
      factureConcurrent.numero
    );

    // Chercher son numero exact est la tentative la plus directe : c'est ce
    // que ferait quelqu'un qui l'aurait vu passer.
    await vendeur.goto(
      `${BASE}/vendeur/factures?q=${encodeURIComponent(factureConcurrent.numero)}`,
      { waitUntil: "networkidle" }
    );
    const resultats = await numerosAffiches(vendeur);
    verifier(
      !resultats.includes(factureConcurrent.numero),
      "chercher le numero d'un concurrent ne le fait pas apparaitre",
      resultats.join(", ")
    );

    // Et la piece elle-meme ? Elle s'atteint par la reference, qui fait office
    // de capacite d'acces (choix documente, §38) : le vendeur qui possede la
    // reference peut l'ouvrir. Ce qu'on verifie, c'est qu'il ne peut pas la
    // DECOUVRIR — sa liste ne la lui donne pas.
    await vendeur.goto(`${BASE}/vendeur/factures`, { waitUntil: "networkidle" });
    verifier(
      !(await texte(vendeur)).includes(factureConcurrent.reference),
      "la reference du concurrent n'est pas davantage divulguee"
    );
  }

  // ═══════════ 4. La recherche fonctionne, et reste cloisonnee
  const sienne = affichees[0];
  await vendeur.goto(`${BASE}/vendeur/factures?q=${encodeURIComponent(sienne)}`, {
    waitUntil: "networkidle",
  });
  const trouvee = await numerosAffiches(vendeur);
  verifier(
    trouvee.length === 1 && trouvee[0] === sienne,
    "la recherche par numero trouve la bonne facture",
    trouvee.join(", ")
  );

  // ═══════════ 5. Le client retrouve ses recus
  const ctxClient = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
  });
  const client = await ctxClient.newPage();
  await connecter(client, "client@koli.ci");

  const pageClient = await client.goto(`${BASE}/client/factures`, {
    waitUntil: "networkidle",
  });
  verifier(pageClient.status() === 200, "la page Mes reçus du client existe");

  const texteClient = await texte(client);
  verifier(
    /Mes reçus/i.test(texteClient),
    "elle parle de « reçus » et non de « factures » : le client a payé, il ne doit rien"
  );

  const telClient = (await un(
    `SELECT phone FROM "User" WHERE email = 'client@koli.ci'`
  )).phone;
  const sesRecus = new Set(
    (await tous(
      `SELECT i.number FROM "Invoice" i
         JOIN "Order" o ON o.id = i."orderId"
        WHERE o."buyerPhone" = ?
           OR o."customerId" = (SELECT c.id FROM "CustomerProfile" c
                                JOIN "User" u ON u.id = c."userId"
                               WHERE u.email = 'client@koli.ci')`,
      telClient
    )).map((r) => r.number)
  );

  const recusAffiches = await numerosAffiches(client);
  verifier(
    recusAffiches.every((n) => sesRecus.has(n)),
    "il ne voit QUE ses propres reçus",
    recusAffiches.filter((n) => !sesRecus.has(n)).join(", ")
  );

  // Le rattachement par telephone est la raison d'etre de cette page : sans
  // lui, tous les achats en mode invite resteraient invisibles.
  verifier(
    recusAffiches.includes(factureInvitee.numero),
    "un achat fait SANS COMPTE apparait, rattache par le telephone",
    `cherche ${factureInvitee.numero} parmi ${recusAffiches.join(", ")}`
  );

  // Le symetrique : ce meme achat invite ne doit pas remonter chez un autre
  // client qui n'a pas ce numero.
  if (factureConcurrent) {
    verifier(
      !recusAffiches.includes(factureConcurrent.numero),
      "le recu d'un autre acheteur ne remonte pas ici",
      factureConcurrent.numero
    );
  }

  // La contrepartie affichee doit etre le VENDEUR : afficher l'acheteur
  // donnerait une liste ou chaque ligne porte son propre nom.
  if (recusAffiches.length > 0) {
    verifier(
      /Vendeur\s*:/i.test(texteClient),
      "chaque reçu nomme le vendeur, pas le client lui-meme"
    );
  }

  // ═══════════ 6. La pièce elle-meme reste atteignable et complete
  const reference = (await un(
    `SELECT o.reference FROM "Invoice" i JOIN "Order" o ON o.id = i."orderId"
      WHERE o."sellerId" = ? LIMIT 1`,
    idVendeur
  )).reference;

  const piece = await vendeur.goto(`${BASE}/facture/${reference}`, {
    waitUntil: "networkidle",
  });
  verifier(piece.status() === 200, "la facture s'ouvre depuis la liste");

  const textePiece = await texte(vendeur);
  for (const [motif, nom] of [
    [/FAC-\d{4}-\d{6}/, "numero de facture"],
    [/KOLI-[2-9A-Z]{8}/, "numero de commande"],
    [/livraison/i, "livraison"],
    [/total/i, "total"],
  ]) {
    verifier(motif.test(textePiece), `le §38 exige « ${nom} » : present`);
  }

  // ═══════════ 6 bis. Telecharger et partager le recu
  //
  // Le besoin : un client n'arrive pas a ouvrir son recu, il faut pouvoir le
  // lui renvoyer par WhatsApp ou par SMS depuis le telephone qu'on a en main.
  {
    const boutonTelecharger = vendeur
      .getByRole("button", { name: /^Télécharger$/ })
      .filter({ visible: true });
    const boutonPartager = vendeur
      .getByRole("button", { name: /^Partager$/ })
      .filter({ visible: true });

    verifier(
      (await boutonTelecharger.count()) > 0,
      "un bouton « Télécharger » figure sur le recu"
    );
    verifier(
      (await boutonPartager.count()) > 0,
      "un bouton « Partager » figure sur le recu"
    );

    await boutonPartager.first().click();
    await vendeur.waitForTimeout(400);

    const whatsapp = await vendeur
      .locator("a[href^='https://wa.me']")
      .first()
      .getAttribute("href");
    verifier(whatsapp !== null, "un envoi par WhatsApp est propose");

    const sms = await vendeur
      .locator("a[href^='sms:']")
      .first()
      .getAttribute("href");
    verifier(sms !== null, "un envoi par SMS est propose");

    // LE point critique : le message doit porter l'origine REELLEMENT visitee.
    // Une adresse en dur renverrait un destinataire de 192.168.x.x vers
    // « localhost », c'est-a-dire vers son propre telephone — le lien partage
    // serait alors systematiquement mort.
    const origine = new URL(BASE).origin;
    const messageWhatsapp = decodeURIComponent(whatsapp ?? "");
    // Le detail montre le lien REELLEMENT produit : sans lui, l'echec se lit
    // « ...Chic », ce qui n'apprend rien sur ce qui a ete partage.
    //
    // On lit le corps du message, pas l'adresse entiere : celle-ci commence
    // par « https://wa.me/?text=... », si bien que chercher la premiere URL y
    // trouvait wa.me au lieu du lien du recu.
    const corps = messageWhatsapp.slice(messageWhatsapp.indexOf("?text=") + 6);
    const lienDansMessage =
      corps.match(/https?:\/\/\S+/)?.[0] ?? "aucun lien";
    verifier(
      lienDansMessage.startsWith(`${origine}/facture/`),
      "le lien partage porte l'origine reellement visitee",
      `partage : ${lienDansMessage} — attendu sur ${origine}`
    );
    verifier(
      messageWhatsapp.includes(reference),
      "le message cite la reference de la commande"
    );
    verifier(
      decodeURIComponent(sms ?? "").includes(`${origine}/facture/`),
      "le SMS porte le meme lien"
    );

    // Le lien reste visible et selectionnable : hors contexte securise, la
    // copie automatique echoue, et l'utilisateur ne doit pas etre bloque.
    const champ = vendeur.locator("input[readonly]").first();
    verifier(
      (await champ.count()) > 0 &&
        (await champ.inputValue()).startsWith(origine),
      "le lien reste affiche et selectionnable a la main"
    );

    // Ces commandes ne doivent pas partir a l'impression.
    const masque = await vendeur.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (e) => e.textContent.trim() === "Télécharger"
      );
      return b?.closest(".imprimer-masquer") !== null;
    });
    verifier(masque, "les boutons sont exclus de l'impression du recu");
  }

  // ═══════════ 6 ter. Le schema `sms:` differe entre iOS et Android
  //
  // iOS attend `&body=`, Android `?body=`. Se tromper ouvre l'application de
  // messagerie avec un message VIDE — une panne silencieuse, invisible en
  // developpement puisque le lien s'ouvre quand meme.
  for (const [systeme, ua, motif] of [
    [
      "Android",
      "Mozilla/5.0 (Linux; Android 13; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
      "sms:?body=",
    ],
    [
      "iPhone",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "sms:&body=",
    ],
  ]) {
    const ctx = await navigateur.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: ua,
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/facture/${reference}`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: /^Partager$/ }).click();
    await p.waitForTimeout(400);

    const href =
      (await p.locator("a[href^='sms:']").first().getAttribute("href")) ?? "";
    verifier(
      href.startsWith(motif),
      `le lien SMS utilise le bon schema sur ${systeme}`,
      href.slice(0, 12)
    );
    await ctx.close();
  }

  // ═══════════ 7. Une reference inexistante ne revele rien
  const introuvable = await vendeur.goto(`${BASE}/facture/KOLI-ZZZZZZZZ`, {
    waitUntil: "networkidle",
  });
  verifier(
    introuvable.status() === 404,
    "une reference inconnue rend 404, sans indice",
    String(introuvable.status())
  );

  // ═══════════ 8. Un visiteur non connecte n'entre pas dans les listes
  const ctxAnonyme = await navigateur.newContext();
  const anonyme = await ctxAnonyme.newPage();
  await anonyme.goto(`${BASE}/vendeur/factures`, { waitUntil: "networkidle" });
  verifier(
    !new URL(anonyme.url()).pathname.startsWith("/vendeur"),
    "un visiteur non connecte est renvoye a la connexion",
    new URL(anonyme.url()).pathname
  );
  await ctxAnonyme.close();
} finally {
  // Les fixtures sont retirées quoi qu'il arrive : un test qui laisse des
  // traces fausse les suivants — et ici, ce seraient de fausses factures.
  (await nettoyerFixtures());

  await navigateur.close();
}

console.log("");
console.log(
  echecs === 0
    ? "Les factures se consultent ensemble, restent cloisonnees et numerotees sans doublon."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
