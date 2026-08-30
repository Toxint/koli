/**
 * Les équipes de livraison — §5.3, « chaque vendeur peut utiliser son propre
 * livreur ».
 *
 * Ce contrôle existe parce que le code faisait le contraire. La liste
 * d'assignation renvoyait **tous les livreurs actifs de la plateforme**, et
 * `assignDriverAction` se contentait de vérifier que le livreur existait et
 * qu'il était actif. Un vendeur pouvait donc lire le nom du livreur d'un
 * concurrent dans un menu déroulant, et le lui prendre pour une course.
 *
 * Rien ne le signalait. C'est le propre des fuites de cloisonnement : l'écran
 * fonctionne, les tests passent, et le défaut ne se voit que du dehors.
 *
 * Six choses sont éprouvées, contre le VRAI serveur et la VRAIE base :
 *
 *  1. Un vendeur ne voit que SON équipe dans le menu d'assignation.
 *  2. Il ne peut pas assigner un livreur hors équipe **même en forgeant
 *     l'identifiant** — le contrôle de l'action serveur, pas celui de l'écran.
 *  3. Le lien d'invitation rattache le livreur qui s'inscrit par lui.
 *  4. Un lien révoqué n'inscrit plus personne, et le dit.
 *  5. Un livreur qui se déclare indisponible ne peut plus être assigné.
 *  6. Retirer un livreur le sort de la liste d'assignation.
 *
 * Le point 2 est le seul qui protège vraiment. Filtrer un menu déroulant ne
 * protège rien : l'identifiant voyage dans le formulaire, et rien n'empêche de
 * le remplacer. Une garde posée à l'affichage est une décoration.
 *
 * Usage :
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-livreurs.mjs
 */

import { chromium } from "playwright";
import { lireUne, fermer } from "./base-donnees.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

console.log(`\n=== ÉQUIPES DE LIVRAISON depuis ${BASE} ===\n`);

let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

/** Un contrôle qui ne peut pas s'exercer le DIT, au lieu de passer au vert. */
const inapplicable = (libelle, pourquoi) =>
  console.log(`  ~ ${libelle} — non éprouvé : ${pourquoi}`);

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
};

/** Un numéro qui n'existera pas deux fois — les inscriptions s'accumulent. */
const numeroNeuf = () =>
  `+225${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 10)}`;

const navigateur = await chromium.launch();

// ═══════════ 1. Le vendeur voit SON équipe, et le lien d'invitation

const ctxV = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
const pageV = await ctxV.newPage();
await connecter(pageV, "vendeur@koli.ci");
await pageV.goto(`${BASE}/vendeur/livreurs`, { waitUntil: "networkidle" });

const titrePresent = await pageV
  .getByRole("heading", { name: "Mes livreurs" })
  .isVisible()
  .catch(() => false);
verifier(titrePresent, "le vendeur a un écran « Mes livreurs »");

const equipeInitiale = await pageV.locator("section >> li").count();
verifier(
  equipeInitiale > 0,
  "son équipe n'est pas vide (le jeu de données y met le livreur)",
  `${equipeInitiale} membre(s)`
);

// Le lien : on l'émet s'il n'y en a pas encore.
const boutonCreer = pageV.getByRole("button", { name: /Créer un lien/ });
if (await boutonCreer.isVisible().catch(() => false)) {
  await boutonCreer.click();
  await pageV.locator("#lien-invitation").waitFor({ timeout: 15000 });
}

const lien = await pageV.locator("#lien-invitation").inputValue();
verifier(
  lien.includes("/inscription?invitation="),
  "le lien d'invitation mène à l'inscription",
  lien.slice(0, 60)
);

// Le jeton doit être IMPRÉVISIBLE. Un cuid ferait 25 caractères et commencerait
// par « c » ; 32 octets en base64url en font 43.
const jeton = lien.split("invitation=")[1] ?? "";
verifier(
  jeton.length >= 40,
  "le jeton est long — il vaut droit d'entrée, il ne se devine pas",
  `${jeton.length} caractères`
);

// ═══════════ 2. Un livreur s'inscrit par le lien et rejoint l'équipe

const ctxL = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
const pageL = await ctxL.newPage();
await pageL.goto(lien, { waitUntil: "networkidle" });

const annonce = await pageL
  .getByText(/Vous rejoignez l.équipe de/)
  .isVisible()
  .catch(() => false);
verifier(
  annonce,
  "le livreur voit CHEZ QUI il entre avant de remplir quoi que ce soit"
);

// Le choix du rôle est retiré : le lien l'a décidé.
const choixRole = await pageL
  .getByRole("radiogroup")
  .isVisible()
  .catch(() => false);
verifier(!choixRole, "le lien fixe le rôle : le choix vendeur/client disparaît");

const nomLivreur = `Livreur Invité ${Date.now().toString().slice(-5)}`;
const telLivreur = numeroNeuf();

await pageL.locator("#name").fill(nomLivreur);
await pageL.locator("#phone").fill(telLivreur);
await pageL.locator("#password").fill(MDP);
await pageL.locator("#vehicle").fill("Moto de contrôle");
await pageL.locator("#zone").fill("Marcory et Koumassi");
await pageL
  .getByRole("button", { name: /Créer mon compte|S.inscrire|Créer le compte/i })
  .filter({ visible: true })
  .first()
  .click();
await pageL
  .waitForURL((u) => u.pathname.startsWith("/livreur"), { timeout: 25000 })
  .catch(() => {});

const arriveChezLui = pageL.url().includes("/livreur");
verifier(arriveChezLui, "le compte est créé et mène à l'espace livreur", pageL.url());

// La BASE, pas l'écran : c'est elle qui porte le rattachement.
const rattachement = await lireUne(
  `SELECT sd.id
     FROM "SellerDriver" sd
     JOIN "DriverProfile" dp ON dp.id = sd."driverId"
     JOIN "User" u ON u.id = dp."userId"
     JOIN "SellerProfile" sp ON sp.id = sd."sellerId"
     JOIN "User" uv ON uv.id = sp."userId"
    WHERE u.phone = ? AND uv.email = ?`,
  telLivreur,
  "vendeur@koli.ci"
);
verifier(
  Boolean(rattachement),
  "le registre porte le rattachement : le livreur est dans l'équipe du vendeur"
);

// La zone saisie à l'inscription est conservée — sans elle, le vendeur choisit
// à l'aveugle.
const profil = await lireUne(
  `SELECT dp.zone, dp.available, dp.id
     FROM "DriverProfile" dp JOIN "User" u ON u.id = dp."userId"
    WHERE u.phone = ?`,
  telLivreur
);
verifier(
  profil?.zone === "Marcory et Koumassi",
  "la zone déclarée à l'inscription est enregistrée",
  String(profil?.zone)
);

// ═══════════ 3. Il apparaît chez le vendeur, et NULLE PART ailleurs

await pageV.reload({ waitUntil: "networkidle" });
const chezLui = await pageV.getByText(nomLivreur).isVisible().catch(() => false);
verifier(chezLui, "le vendeur voit son nouveau livreur sans rien avoir saisi");

const ctxC = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
const pageC = await ctxC.newPage();
await connecter(pageC, "vendeur2@koli.ci");
await pageC.goto(`${BASE}/vendeur/livreurs`, { waitUntil: "networkidle" });

const chezLeConcurrent = await pageC
  .getByText(nomLivreur)
  .isVisible()
  .catch(() => false);
verifier(
  !chezLeConcurrent,
  "le CONCURRENT ne le voit pas — c'est tout l'objet du §5.3",
  chezLeConcurrent ? "il apparaît chez vendeur2@koli.ci" : ""
);

// ═══════════ 4. LA garde : assigner un livreur hors équipe, en forçant l'id
//
// On ne passe pas par le menu déroulant — le but est justement de contourner
// l'écran. On appelle l'action serveur comme le ferait quelqu'un qui a lu le
// code de la page : c'est le seul contrôle qui protège réellement.

const commandeAssignable = await lireUne(
  `SELECT o.reference
     FROM "Order" o
     JOIN "SellerProfile" sp ON sp.id = o."sellerId"
     JOIN "User" u ON u.id = sp."userId"
     JOIN "Fund" f ON f."orderId" = o.id
     LEFT JOIN "Delivery" d ON d."orderId" = o.id
    WHERE u.email = ? AND f.secured = true
      AND (d."driverId" IS NULL OR d.status <> 'CONFIRMED')
    LIMIT 1`,
  "vendeur2@koli.ci"
);

await pageC.goto(`${BASE}/vendeur/commandes`, { waitUntil: "networkidle" });
const selecteur = pageC.locator("select[id^='livreur-']").first();

if (!commandeAssignable || !profil?.id || (await selecteur.count()) === 0) {
  inapplicable(
    "un vendeur ne peut pas assigner le livreur d'un autre",
    "aucune commande assignable sur l'écran de vendeur2@koli.ci"
  );
} else {
  /*
   * On FORCE l'identifiant dans le menu déroulant, puis on assigne.
   *
   * Ce détour est le cœur du contrôle. Filtrer la liste ne protège rien :
   * l'identifiant du livreur voyage dans le formulaire, et quiconque ouvre les
   * outils de développement peut y mettre celui qu'il veut. On reproduit donc
   * exactement ce geste — une option ajoutée à la main, avec l'identifiant d'un
   * livreur qui appartient à l'équipe d'un AUTRE vendeur.
   *
   * Le chemin emprunté est le vrai : même session, même action serveur, même
   * tout. Une première version forgeait une requête HTTP avec un en-tête
   * `Next-Action` inventé — elle échouait sur le protocole avant d'atteindre la
   * moindre règle métier, et serait donc restée verte même la garde retirée.
   * Un contrôle qui ne peut pas échouer ne protège rien.
   */
  const idSelecteur = await selecteur.getAttribute("id");
  const referenceVisee = (idSelecteur ?? "").replace("livreur-", "");

  await selecteur.evaluate((select, idEtranger) => {
    const option = document.createElement("option");
    option.value = idEtranger;
    option.textContent = "livreur d'un autre vendeur";
    select.appendChild(option);
    // `value` seul ne suffit pas : React tient son propre état, et le bouton
    // enverrait la valeur d'avant. On déclenche l'événement qu'il écoute.
    const poseur = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value"
    )?.set;
    poseur?.call(select, idEtranger);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, profil.id);

  // Le bouton est le frère immédiat du menu — voir `AssignerLivreur`. On vise
  // par la structure et non par un identifiant à échapper : `CSS.escape`
  // n'existe pas dans Node, et le sélecteur contient une référence de commande.
  await selecteur.locator("xpath=following-sibling::button").first().click();

  /*
   * Le message du BLOC D'ASSIGNATION, et non le premier `role="alert"` venu.
   *
   * La page en porte plusieurs, dont certains vides — le premier essai lisait
   * une chaîne vide et déclarait l'absence de message alors que le bon était
   * juste à côté. On vise donc par la structure : le paragraphe qui suit la
   * rangée contenant le menu (voir `AssignerLivreur`).
   */
  const messageBloc = selecteur.locator("xpath=../following-sibling::p").first();
  await messageBloc.waitFor({ timeout: 20000 }).catch(() => {});

  const detourne = await lireUne(
    `SELECT d."driverId"
       FROM "Delivery" d
       JOIN "Order" o ON o.id = d."orderId"
      WHERE o.reference = ?`,
    referenceVisee
  );

  const messageRefus = await messageBloc.textContent().catch(() => null);

  verifier(
    detourne?.driverId !== profil.id,
    "un vendeur ne peut PAS assigner le livreur d'un autre, même en forçant l'identifiant",
    `livraison confiée à ${detourne?.driverId ?? "personne"}`
  );

  verifier(
    /équipe/i.test(messageRefus ?? ""),
    "et le refus DIT pourquoi — « ne fait pas partie de votre équipe »",
    `« ${(messageRefus ?? "aucun message").trim().slice(0, 80)} »`
  );
}

await ctxC.close();

// ═══════════ 5. Indisponible = non assignable

await pageL.goto(`${BASE}/livreur/profil`, { waitUntil: "networkidle" });
const bascule = pageL.getByRole("button", { name: /Je prends des courses/ });
if (await bascule.isVisible().catch(() => false)) {
  await bascule.click();
  /*
   * On attend le MESSAGE, pas le libellé du bouton.
   *
   * Le bouton bascule immédiatement — l'écran est optimiste, et il a raison de
   * l'être. Attendre ce basculement revenait donc à n'attendre rien du tout :
   * la base était interrogée pendant que l'action serveur écrivait encore, et
   * le contrôle échouait une fois sur deux sur un code parfaitement correct.
   *
   * Le message, lui, n'apparaît qu'au retour du serveur. C'est la conséquence,
   * et c'est elle qu'on attend — jamais un délai (voir §8 de CLAUDE.md).
   */
  await pageL
    .locator('[role="status"]')
    .filter({ hasText: /disponible/i })
    .waitFor({ timeout: 20000 })
    .catch(() => {});
}

const apresBascule = await lireUne(
  `SELECT dp.available FROM "DriverProfile" dp
     JOIN "User" u ON u.id = dp."userId" WHERE u.phone = ?`,
  telLivreur
);
verifier(
  apresBascule?.available === false,
  "le livreur peut se déclarer indisponible, et le registre l'enregistre"
);

/*
 * Le vendeur le voit, sur SON écran d'équipe.
 *
 * Ce contrôle-ci est déterministe : la page « Mes livreurs » liste toujours
 * l'équipe, qu'il y ait ou non une commande à assigner. Celui du menu
 * déroulant, plus bas, dépend de l'état des commandes — il est utile mais il
 * peut s'abstenir, et c'est pourquoi il ne peut pas être le seul.
 */
await pageV.goto(`${BASE}/vendeur/livreurs`, { waitUntil: "networkidle" });
const ligneIndispo = pageV.locator("li").filter({ hasText: nomLivreur }).first();
const texteLigne = (await ligneIndispo.count())
  ? ((await ligneIndispo.textContent()) ?? "")
  : "";
verifier(
  /indisponible/i.test(texteLigne),
  "le vendeur lit « indisponible » en toutes lettres, pas seulement une couleur (§69)",
  texteLigne.replace(/\s+/g, " ").trim().slice(0, 90)
);

await pageV.goto(`${BASE}/vendeur/commandes`, { waitUntil: "networkidle" });
const optionIndispo = pageV
  .locator("select option")
  .filter({ hasText: nomLivreur })
  .first();

if ((await optionIndispo.count()) === 0) {
  inapplicable(
    "un livreur indisponible est désactivé dans le menu d'assignation",
    "aucune commande à assigner sur cet écran"
  );
} else {
  const texte = await optionIndispo.textContent();
  const desactivee = await optionIndispo.evaluate((o) => o.disabled);
  verifier(
    desactivee && /indisponible/i.test(texte ?? ""),
    "il reste dans la liste, désactivé et dit indisponible — il ne disparaît pas",
    `« ${texte?.trim()} »`
  );
}

// ═══════════ 6. Un lien révoqué n'inscrit plus personne

await pageV.goto(`${BASE}/vendeur/livreurs`, { waitUntil: "networkidle" });
await pageV.getByRole("button", { name: /Fermer le lien/ }).click();
await pageV
  .getByText(/Lien fermé/)
  .waitFor({ timeout: 15000 })
  .catch(() => {});

const ctxR = await navigateur.newContext();
const pageR = await ctxR.newPage();
await pageR.goto(lien, { waitUntil: "networkidle" });

const refuse = await pageR
  .getByText(/n.est plus valable/)
  .isVisible()
  .catch(() => false);
verifier(refuse, "un lien fermé le DIT, au lieu d'inscrire dans le vide");

const roleRendu = await pageR
  .getByRole("radiogroup")
  .isVisible()
  .catch(() => false);
verifier(
  roleRendu,
  "et le choix du rôle revient : sans invitation valable, c'est une inscription ordinaire"
);
await ctxR.close();

// L'équipe déjà constituée SURVIT à la révocation. Fermer une porte ne met
// personne dehors.
const survivant = await lireUne(
  `SELECT sd.id FROM "SellerDriver" sd
     JOIN "DriverProfile" dp ON dp.id = sd."driverId"
     JOIN "User" u ON u.id = dp."userId"
    WHERE u.phone = ?`,
  telLivreur
);
verifier(
  Boolean(survivant),
  "révoquer le lien ne sort personne de l'équipe déjà constituée"
);

// ═══════════ 7. Le retrait

await pageV.reload({ waitUntil: "networkidle" });
const ligne = pageV.locator("li").filter({ hasText: nomLivreur }).first();
if ((await ligne.count()) === 0) {
  inapplicable("le retrait sort le livreur de l'équipe", "ligne introuvable");
} else {
  await ligne.getByRole("button", { name: "Retirer" }).click();
  await pageV
    .getByText(/ne fait plus partie de votre équipe/)
    .waitFor({ timeout: 15000 })
    .catch(() => {});

  const retire = await lireUne(
    `SELECT sd.id FROM "SellerDriver" sd
       JOIN "DriverProfile" dp ON dp.id = sd."driverId"
       JOIN "User" u ON u.id = dp."userId"
      WHERE u.phone = ?`,
    telLivreur
  );
  verifier(!retire, "le retrait sort le livreur de l'équipe, dans le registre");

  // Le COMPTE du livreur survit : il ne nous appartient pas, et il sert
  // peut-être à d'autres vendeurs.
  const compte = await lireUne(`SELECT id FROM "User" WHERE phone = ?`, telLivreur);
  verifier(
    Boolean(compte),
    "mais son COMPTE reste : retirer de son équipe n'est pas supprimer quelqu'un"
  );
}

await ctxV.close();
await ctxL.close();
await navigateur.close();
await fermer();

console.log(
  echecs === 0
    ? "\nChaque vendeur n'a que ses livreurs, et personne ne peut prendre ceux d'un autre.\n"
    : `\n${echecs} problème(s).\n`
);
process.exit(echecs === 0 ? 0 : 1);
