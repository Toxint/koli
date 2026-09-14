/**
 * Le VERSEMENT au vendeur (§43), de bout en bout.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  C'est le seul acte de KOLI qui fait SORTIR de l'argent. Il ne se        │
 * │  rejoue pas et ne s'annule pas.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les regles pures sont eprouvees dans `lib/__tests__/versement.test.ts`, sans
 * base. Ce script eprouve ce qu'aucun test unitaire ne peut voir : que l'ECRAN
 * et le REGISTRE disent la meme chose, que la demande GELE le solde, que le
 * reglement laisse une trace, et qu'un vendeur ne voit que ses versements.
 *
 * On lit la BASE a chaque etape, jamais le seul ecran : un ecran peut annoncer
 * « demande enregistree » pendant que la base ne porte rien, et l'inverse.
 *
 * ── Ses propres donnees, et elles seules ────────────────────────────────────
 *
 * Il repere ses versements par des numeros de destination RESERVES. Il efface
 * ceux d'une execution precedente AVANT de commencer, et les siens a la fin :
 * un versement PAYE laisse en base diminuerait le solde du vendeur de
 * demonstration, et ferait echouer `verif:courbes` ou `verif:parcours` pour une
 * raison etrangere a ce qu'ils verifient.
 *
 * Usage :
 *   node scripts/test-versements.mjs
 */

import { chromium } from "playwright";
import { lire, lireUne, ecrire, fermer } from "./base-donnees.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

/* Numeros RESERVES a ce controle. Aucun compte de demonstration ne les porte :
   c'est ce qui permet d'effacer SES versements et aucun autre. */
const NUMERO_PAYE = "+2250799000401";
const NUMERO_REFUSE = "+2250799000402";
const NUMEROS = [NUMERO_PAYE, NUMERO_REFUSE];

/* Le nom du TITULAIRE accompagne desormais chaque numero : c'est lui que
   l'administration compare avant d'envoyer, et seul lui trahit deux chiffres
   inverses. */
const TITULAIRE_PAYE = "Controle Versement";
const TITULAIRE_REFUSE = "Controle Refus";
const OPERATEUR = "Orange Money";

/* Le numero d'un CONCURRENT, pose a la main : c'est la destination qu'un
   vendeur hostile tenterait de se faire attribuer, ou d'attribuer a un autre. */
const NUMERO_CONCURRENT = "+2250799000403";

console.log(`\n=== VERSEMENTS AUX VENDEURS depuis ${BASE} ===\n`);

let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const effacerLesMiens = async () => {
  /*
   * Les AVIS d'abord, les versements ensuite.
   *
   * `Notification.entityId` est une chaine, pas une clef etrangere : rien ne la
   * supprime en cascade. Effacer le versement d'abord laisserait un avis
   * orphelin — exactement le cas qui a fait ecrire `MOTIF_COMMANDE_ABSENTE`,
   * et qu'on n'a pas besoin de fabriquer a chaque campagne.
   */
  const miens = await lire(`SELECT id FROM "Payout" WHERE phone = ANY(?)`, [
    ...NUMEROS,
    NUMERO_CONCURRENT,
  ]);
  if (miens.length > 0) {
    await ecrire(
      `DELETE FROM "Notification" WHERE "entityType" = 'Payout' AND "entityId" = ANY(?)`,
      miens.map((v) => v.id)
    );
  }

  await ecrire(`DELETE FROM "Payout" WHERE phone = ANY(?)`, [
    ...NUMEROS,
    NUMERO_CONCURRENT,
  ]);
  await ecrire(`DELETE FROM "PayoutAccount" WHERE phone = ?`, NUMERO_CONCURRENT);
  /* Les numeros ENREGISTRES aussi : sans cela, la seconde execution trouverait
     les comptes de la premiere et le controle « on peut en enregistrer un »
     passerait sans rien enregistrer. Un controle qui ne peut pas echouer ne
     protege rien (§8). */
  await ecrire(`DELETE FROM "PayoutAccount" WHERE phone = ANY(?)`, NUMEROS);
};

const vendeur = await lireUne(
  `SELECT s.id FROM "SellerProfile" s JOIN "User" u ON u.id = s."userId"
    WHERE u.email = ?`,
  "vendeur@koli.ci"
);
if (!vendeur) {
  console.log("  ✗ le vendeur de demonstration est absent — lancer npm run base:preparer");
  process.exit(1);
}

await effacerLesMiens();

/** Le registre des versements de ce vendeur, lu en base. */
const versementsDe = (numero) =>
  lire(
    `SELECT id, amount, currency, status, "providerRef", reason, "processedBy", "processedAt"
       FROM "Payout" WHERE "sellerId" = ? AND phone = ? ORDER BY "requestedAt"`,
    vendeur.id,
    numero
  );

const traceDe = async (action, id) =>
  (
    await lire(
      `SELECT id FROM "AuditLog" WHERE action = ? AND "entityId" = ?`,
      action,
      id
    )
  ).length;

const navigateur = await chromium.launch();

const connecter = async (identifiant) => {
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill(identifiant);
  await page.locator("#password").fill(MDP);
  await page
    .getByRole("button", { name: /^Se connecter$/ })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 30000 })
    .catch(() => {});
  return { ctx, page };
};

/**
 * Soumet une demande depuis la page Solde et rend ce que l'ecran a repondu.
 *
 * ⚠ DEUX pieges, rencontres a la premiere execution :
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  1. `[role="alert"]` attrape d'abord l'ANNONCEUR DE ROUTE de Next.js :  │
 * │     un element vide que Next pose sur chaque page, avec ce meme role.   │
 * │     Le controle lisait « aucun message » sur un formulaire qui         │
 * │     repondait tres bien. On vise donc le PARAGRAPHE du formulaire.      │
 * │                                                                          │
 * │  2. Le champ porte `min=4000`. 3 999 n'etait donc refuse que par le     │
 * │     NAVIGATEUR — la requete ne partait jamais, et le controle           │
 * │     « prouvait » une garde serveur qu'il n'exercait pas.                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `sansGardeNavigateur` retire `min`, `max` et `required` avant l'envoi : c'est
 * exactement ce que ferait un client hostile, en une ligne dans la console. La
 * seule garde qui compte est celle de l'ACTION, qui relit le solde en base.
 *
 * ⚠ Apres une demande REUSSIE, la page se revalide et le formulaire est
 * remplace par « Versement en cours » : le message de succes peut ne jamais
 * etre visible. Le succes se prouve donc par ce bloc et par la base.
 */
const demander = async (
  page,
  { montant, telephone, sansGardeNavigateur = false }
) => {
  await page.goto(`${BASE}/vendeur/solde`, { waitUntil: "networkidle" });
  if ((await page.locator("#montant").count()) === 0) {
    return { formulaire: false, texte: "" };
  }
  if (sansGardeNavigateur) {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll("#montant")) {
        el.removeAttribute("min");
        el.removeAttribute("max");
        el.removeAttribute("required");
      }
    });
  }
  await page.locator("#montant").fill(String(montant));

  /* Le numero se CHOISIT depuis le 14 septembre 2026 : on coche celui dont
     l'etiquette porte le numero voulu. Cliquer l'ETIQUETTE et non la radio —
     c'est ce qu'un doigt atteint. */
  const choix = page
    .locator("label[data-choix-compte]")
    .filter({ hasText: telephone })
    .first();
  if (await choix.count()) await choix.click();

  await page.getByRole("button", { name: /Demander un versement/ }).click();

  const reponse = page
    .locator('section p[role="alert"], section p[role="status"]')
    .or(page.getByRole("heading", { name: /Versement en cours/ }))
    .first();
  await reponse.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  return {
    formulaire: true,
    texte: (await reponse.textContent().catch(() => "")) ?? "",
  };
};

/**
 * Enregistre un numero de retrait DEPUIS L'ECRAN, comme le ferait un vendeur.
 *
 * ⚠ Le formulaire vit dans un `<details>` NATIF : on clique le `summary`
 * plutot que d'ouvrir l'element par script. Forcer `open` ferait passer le
 * controle en cessant de dire ce qu'un doigt peut faire — meme raison que le
 * clic sur l'etiquette plutot que sur la radio dans `verif:sansjs`.
 */
const enregistrerCompte = async (page, { telephone, titulaire, surnom }) => {
  /*
   * ⚠ JAMAIS l'ancre `#numeros-de-retrait` ici, et cela a coûté un faux
   * diagnostic.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │  Une navigation qui ne differe que par le FRAGMENT ne recharge rien :   │
   * │  la page reste celle d'avant, avec l'etat React de la tentative         │
   * │  precedente — et son message d'erreur encore affiche.                   │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * Le controle lisait alors le message de l'essai PRECEDENT : « un numero
   * sans titulaire est refuse » echouait en citant le refus du numero trop
   * court. On recharge donc pour de bon, et l'on attend que le message CHANGE.
   */
  await page.goto(`${BASE}/vendeur/solde`, { waitUntil: "networkidle" });
  const bloc = page.locator("#numeros-de-retrait");
  const ajout = bloc.locator("> details").last();
  if (!(await ajout.evaluate((d) => d.open).catch(() => false))) {
    await ajout.locator("> summary").click();
  }

  const form = ajout.locator("form");
  await form.locator("[name=telephone]").fill(telephone);
  await form.locator("[name=titulaire]").fill(titulaire ?? "");
  if (surnom) await form.locator("[name=surnom]").fill(surnom);

  /* La liste des operateurs vient du PAYS du vendeur : c'est un `select` quand
     le pays est connu, un champ libre sinon. */
  const operateur = form.locator("[name=operateur]");
  const balise = await operateur.evaluate((e) => e.tagName.toLowerCase());
  if (balise === "select") await operateur.selectOption(OPERATEUR);
  else await operateur.fill(OPERATEUR);

  const reponse = form.locator('p[role="alert"], p[role="status"]').first();
  /* Ce qui est DEJA a l'ecran avant l'envoi : on attend autre chose que cela,
     jamais « qu'un message soit visible » — il l'etait peut-etre deja. */
  const avant = (await reponse.textContent().catch(() => "")) ?? "";

  await form.getByRole("button", { name: /Enregistrer ce numéro/ }).click();

  for (let i = 0; i < 60; i++) {
    const texte = (await reponse.textContent().catch(() => "")) ?? "";
    if (texte && texte !== avant) return texte;
    await new Promise((r) => setTimeout(r, 250));
  }
  return "";
};

/** Les numeros enregistres par ce vendeur, lus en base. */
const comptesDe = (numero) =>
  lire(
    `SELECT id, phone, "holderName", operator, label, "isDefault"
       FROM "PayoutAccount" WHERE "sellerId" = ? AND phone = ?`,
    vendeur.id,
    numero
  );

try {
  // ═══════════ 0. Le vendeur enregistre ses numéros, une fois pour toutes
  const { ctx: ctxV, page: pageV } = await connecter("vendeur@koli.ci");

  const tropCourt = await enregistrerCompte(pageV, {
    telephone: "07",
    titulaire: TITULAIRE_PAYE,
  });
  verifier(
    /numéro Mobile Money/i.test(tropCourt),
    "un numéro trop court est refusé, avec un message qui dit lequel",
    tropCourt || "aucun message"
  );
  verifier(
    (await lire(`SELECT id FROM "PayoutAccount" WHERE phone = ?`, "07")).length === 0,
    "…et rien n'est enregistré"
  );

  const sansTitulaire = await enregistrerCompte(pageV, {
    telephone: NUMERO_PAYE,
    titulaire: "",
  });
  verifier(
    /titulaire/i.test(sansTitulaire),
    "un numéro sans nom de titulaire est refusé",
    sansTitulaire || "aucun message"
  );
  verifier(
    (await comptesDe(NUMERO_PAYE)).length === 0,
    "…et rien n'est enregistré non plus"
  );

  const enregistre = await enregistrerCompte(pageV, {
    telephone: NUMERO_PAYE,
    titulaire: TITULAIRE_PAYE,
    surnom: "contrôle",
  });
  let comptePaye = [];
  for (let i = 0; i < 40 && comptePaye.length === 0; i++) {
    comptePaye = await comptesDe(NUMERO_PAYE);
    if (comptePaye.length === 0) await new Promise((r) => setTimeout(r, 250));
  }
  verifier(
    comptePaye.length === 1 && comptePaye[0].holderName === TITULAIRE_PAYE,
    "un numéro complet est enregistré, avec le nom du titulaire",
    `${comptePaye.length} ligne(s), écran : ${enregistre}`
  );
  verifier(
    comptePaye[0]?.isDefault === true,
    "le PREMIER numéro devient celui proposé en premier, sans qu'on le demande"
  );
  verifier(
    comptePaye[0]
      ? (await traceDe("SELLER_PAYOUT_ACCOUNT_SAVED", comptePaye[0].id)) === 1
      : false,
    "l'enregistrement laisse une trace au journal d'audit"
  );

  const doublon = await enregistrerCompte(pageV, {
    telephone: NUMERO_PAYE.replace("+225", ""),
    titulaire: TITULAIRE_PAYE,
  });
  verifier(
    /déjà enregistré/i.test(doublon),
    "le MÊME numéro écrit sans indicatif est reconnu comme un doublon",
    doublon || "aucun message"
  );

  await enregistrerCompte(pageV, {
    telephone: NUMERO_REFUSE,
    titulaire: TITULAIRE_REFUSE,
  });
  let compteRefus = [];
  for (let i = 0; i < 40 && compteRefus.length === 0; i++) {
    compteRefus = await comptesDe(NUMERO_REFUSE);
    if (compteRefus.length === 0) await new Promise((r) => setTimeout(r, 250));
  }
  verifier(
    compteRefus.length === 1,
    "un second numéro peut être enregistré"
  );

  /*
   * ⚠ Le numero ne se SAISIT plus dans le formulaire de retrait.
   *
   * C'est le sens meme de la demande du 14 septembre 2026. Si un champ libre
   * revenait, le vendeur retaperait son numero — et la garde « il CHOISIT en
   * relisant » disparaitrait sans qu'aucun test ne tombe.
   */
  await pageV.goto(`${BASE}/vendeur/solde`, { waitUntil: "networkidle" });
  /* ⚠ La question porte sur le formulaire de RETRAIT, pas sur la page : celle
     d'enregistrement d'un numéro en porte un, légitimement. Chercher dans
     `body` accuserait la mauvaise. */
  verifier(
    (await pageV.locator("form:has(#montant) [name=telephone]").count()) === 0,
    "le formulaire de retrait ne redemande plus le numéro : il le fait choisir"
  );
  verifier(
    (await pageV.locator("label[data-choix-compte]").count()) === 2,
    "les deux numéros enregistrés sont proposés au choix",
    `${await pageV.locator("label[data-choix-compte]").count()} proposé(s)`
  );

  /*
   * ═══ Le DÉTOURNEMENT, éprouvé pendant que le formulaire existe encore ═══
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │  L'identifiant du compte voyage dans le formulaire. Ne le filtrer qu'à  │
   * │  l'affichage ne protégerait rien : il se remplace en une ligne dans la  │
   * │  console, et l'argent d'un vendeur partirait sur le numéro d'un autre.  │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * Le compte du concurrent est posé À LA MAIN en base : sans lui, le contrôle
   * ne pourrait s'exercer que si le second vendeur avait justement un solde —
   * c'est-à-dire au hasard du jeu de données. Un contrôle qui ne s'exerce
   * qu'une fois sur deux finit par ne rien prouver.
   */
  const concurrent = await lireUne(
    `SELECT s.id FROM "SellerProfile" s JOIN "User" u ON u.id = s."userId"
      WHERE u.email = ?`,
    "vendeur2@koli.ci"
  );
  let compteVole = null;
  if (concurrent) {
    await ecrire(
      `INSERT INTO "PayoutAccount" (id, "sellerId", phone, operator, "holderName", "isDefault", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, false, now(), now())`,
      `ctrl-compte-vole-${Date.now()}`,
      concurrent.id,
      NUMERO_CONCURRENT,
      OPERATEUR,
      "Vendeur Concurrent"
    );
    compteVole = await lireUne(
      `SELECT id FROM "PayoutAccount" WHERE phone = ?`,
      NUMERO_CONCURRENT
    );
  }

  if (compteVole) {
    await pageV.goto(`${BASE}/vendeur/solde`, { waitUntil: "networkidle" });
    await pageV.evaluate((id) => {
      const form = document.querySelector("#montant")?.closest("form");
      if (!form) return;
      for (const r of form.querySelectorAll('input[name="compteId"]')) {
        r.checked = false;
        r.disabled = true;
      }
      const injecte = document.createElement("input");
      injecte.type = "hidden";
      injecte.name = "compteId";
      injecte.value = id;
      form.appendChild(injecte);
    }, compteVole.id);
    await pageV.locator("#montant").fill("4000");
    await pageV.getByRole("button", { name: /Demander un versement/ }).click();

    let detourne = [];
    for (let i = 0; i < 20; i++) {
      detourne = await lire(`SELECT id FROM "Payout" WHERE phone = ?`, NUMERO_CONCURRENT);
      if (detourne.length > 0) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    verifier(
      detourne.length === 0,
      "le numéro d'un AUTRE vendeur, injecté dans le formulaire, ne reçoit rien",
      `${detourne.length} versement(s) détourné(s) vers ${NUMERO_CONCURRENT}`
    );
    const refusInjection = await pageV
      .locator('section p[role="alert"]')
      .first()
      .textContent()
      .catch(() => "");
    verifier(
      /Choisissez le numéro/i.test(refusInjection ?? ""),
      "…et le refus DIT ce qui manque, au lieu d'échouer en silence",
      refusInjection || "aucun message"
    );
  } else {
    console.log(
      "  · le détournement n'a pas pu être éprouvé : pas de second vendeur en base"
    );
  }

  // ═══════════ 1. Le vendeur demande

  const sousLeMinimum = await demander(pageV, {
    montant: 3999,
    telephone: NUMERO_PAYE,
    sansGardeNavigateur: true,
  });
  verifier(
    /minimum/i.test(sousLeMinimum.texte),
    "3 999 est refusé PAR LE SERVEUR, attributs du navigateur retirés",
    sousLeMinimum.texte || "aucun message"
  );
  verifier(
    (await versementsDe(NUMERO_PAYE)).length === 0,
    "…et rien n'est écrit en base pour une demande refusée"
  );

  /* Plus que ce qu'on possède : le serveur relit le solde en base, il ne croit
     pas le `max` du champ — que ce contrôle vient de retirer. */
  const tropGros = await demander(pageV, {
    montant: 900_000_000,
    telephone: NUMERO_PAYE,
    sansGardeNavigateur: true,
  });
  verifier(
    /dépasse/i.test(tropGros.texte),
    "un montant supérieur au solde est refusé par le serveur",
    tropGros.texte || "aucun message"
  );

  const accepte = await demander(pageV, { montant: 5000, telephone: NUMERO_PAYE });
  let apresDemande = [];
  for (let i = 0; i < 40 && apresDemande.length === 0; i++) {
    apresDemande = await versementsDe(NUMERO_PAYE);
    if (apresDemande.length === 0) await new Promise((r) => setTimeout(r, 250));
  }
  verifier(
    apresDemande.length === 1 && apresDemande[0].status === "PENDING",
    "une demande valide crée UN versement en attente",
    `${apresDemande.length} ligne(s), écran : ${accepte.texte}`
  );
  verifier(
    apresDemande[0]?.amount === 5000 && apresDemande[0]?.currency === "XOF",
    "le montant et la devise sont ceux demandés, figés à la demande",
    JSON.stringify(apresDemande[0] ?? {})
  );
  verifier(
    apresDemande[0] ? (await traceDe("SELLER_PAYOUT_REQUESTED", apresDemande[0].id)) === 1 : false,
    "la demande laisse UNE trace au journal d'audit"
  );

  /*
   * ═══ L'ADMINISTRATION est PREVENUE ═══
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │  Sans cet avis, un vendeur attend son argent pendant qu'une demande    │
   * │  dort dans une file que personne n'a pensé à ouvrir.                    │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * On lit la BASE : le courriel lui-même ne part pas ici — `admin@koli.ci`
   * est une adresse de démonstration, et le canal l'écarte exprès (§8). Ce qui
   * se vérifie, c'est que l'avis est ECRIT, pour le bon destinataire.
   */
  let avisAdmin = [];
  if (apresDemande[0]) {
    for (let i = 0; i < 40 && avisAdmin.length === 0; i++) {
      avisAdmin = await lire(
        `SELECT n.id, u.role FROM "Notification" n JOIN "User" u ON u.id = n."userId"
          WHERE n.type = 'PAYOUT_REQUESTED' AND n."entityId" = ?`,
        apresDemande[0].id
      );
      if (avisAdmin.length === 0) await new Promise((r) => setTimeout(r, 250));
    }
  }
  verifier(
    avisAdmin.length > 0 && avisAdmin.every((a) => a.role === "ADMIN"),
    "la demande prévient l'administration, et elle SEULE",
    `${avisAdmin.length} avis, rôles : ${[...new Set(avisAdmin.map((a) => a.role))].join(", ") || "aucun"}`
  );

  /*
   * La demande GELE le solde.
   *
   * Sans cette garde, deux demandes successives videraient le meme solde deux
   * fois : la seconde serait acceptee avant que la premiere ne soit executee.
   */
  const seconde = await demander(pageV, { montant: 5000, telephone: NUMERO_PAYE });
  const texteGel = await pageV.evaluate(() => document.body.innerText);
  verifier(
    !seconde.formulaire && /Versement en cours/i.test(texteGel),
    "une demande en attente remplace le formulaire : on n'invite pas à en faire une seconde",
    seconde.formulaire ? "le formulaire est encore proposé" : "bloc « en cours » absent"
  );
  /*
   * ⚠ La garde SERVEUR contre la seconde demande n'est pas exercee ici : le
   * formulaire n'existe plus, rien ne peut etre soumis depuis l'ecran. Elle
   * est eprouvee par `lib/__tests__/versement.test.ts` (« refuse une seconde
   * demande quand une est deja en cours »), et `demanderVersementAction` la
   * calcule depuis la base. Le dire vaut mieux que laisser croire que ce
   * controle la couvre.
   */
  verifier(
    (await versementsDe(NUMERO_PAYE)).length === 1,
    "…et il n'existe toujours qu'une ligne"
  );

  // ═══════════ 2. Cloisonnement
  const { ctx: ctxV2, page: pageV2 } = await connecter("vendeur2@koli.ci");
  await pageV2.goto(`${BASE}/vendeur/solde`, { waitUntil: "networkidle" });
  const texteV2 = await pageV2.evaluate(() => document.body.innerText);
  verifier(
    !texteV2.includes(NUMERO_PAYE),
    "un autre vendeur ne voit pas ce versement"
  );
  /* Les NUMEROS sont cloisonnes comme le reste : ils disent ou part l'argent,
     et un concurrent n'a rien a y lire. */
  verifier(
    (await pageV2.locator(`[data-compte-retrait]`).count()) === 0 ||
      !texteV2.includes(TITULAIRE_PAYE),
    "un autre vendeur ne voit pas les numéros de retrait enregistrés"
  );

  await ctxV2.close();

  const { ctx: ctxC, page: pageC } = await connecter("client@koli.ci");
  await pageC.goto(`${BASE}/admin/versements`, { waitUntil: "domcontentloaded" });
  verifier(
    !new URL(pageC.url()).pathname.startsWith("/admin"),
    "un client est renvoyé hors de la file des versements",
    new URL(pageC.url()).pathname
  );
  await ctxC.close();

  // ═══════════ 3. L'administration exécute
  const { ctx: ctxA, page: pageA } = await connecter("admin@koli.ci");
  await pageA.goto(`${BASE}/admin/versements?q=${encodeURIComponent(NUMERO_PAYE)}`, {
    waitUntil: "networkidle",
  });
  const ligne = pageA.locator("tbody tr", { hasText: NUMERO_PAYE }).first();
  verifier(
    (await ligne.count()) === 1,
    "la demande apparaît dans la file de l'administration"
  );

  const reference = `TEST-VERS-${Date.now()}`;
  await ligne.getByRole("button", { name: /Marquer versé/ }).click();
  await ligne.getByLabel(/Référence du transfert/).fill(reference);
  await ligne.getByRole("button", { name: /Confirmer le versement/ }).click();

  // On attend la BASE, pas l'ecran : c'est elle qui fait foi.
  let paye;
  for (let i = 0; i < 40; i++) {
    paye = (await versementsDe(NUMERO_PAYE))[0];
    if (paye?.status !== "PENDING") break;
    await new Promise((r) => setTimeout(r, 250));
  }
  verifier(paye?.status === "PAID", "le versement passe à « versé »", paye?.status);
  verifier(
    paye?.providerRef === reference,
    "la référence du transfert est conservée — c'est elle qui rapproche du relevé",
    String(paye?.providerRef)
  );
  verifier(
    Boolean(paye?.processedBy) && Boolean(paye?.processedAt),
    "on sait QUI a exécuté, et QUAND"
  );
  /*
   * ═══ Le VENDEUR apprend que son argent est parti ═══
   *
   * C'est l'aboutissement de toute la promesse de KOLI. Il s'affiche dans ses
   * notifications et part par courriel — ici encore, l'adresse de
   * demonstration est ecartee par le canal, donc on lit la base.
   */
  let avisVendeur = [];
  if (paye) {
    for (let i = 0; i < 40 && avisVendeur.length === 0; i++) {
      avisVendeur = await lire(
        `SELECT n.id, u.role FROM "Notification" n JOIN "User" u ON u.id = n."userId"
          WHERE n.type = 'PAYOUT_PAID' AND n."entityId" = ?`,
        paye.id
      );
      if (avisVendeur.length === 0) await new Promise((r) => setTimeout(r, 250));
    }
  }
  verifier(
    avisVendeur.length === 1 && avisVendeur[0].role === "SELLER",
    "le versement exécuté prévient le VENDEUR, et lui seul",
    `${avisVendeur.length} avis, rôles : ${[...new Set(avisVendeur.map((a) => a.role))].join(", ") || "aucun"}`
  );

  verifier(
    paye ? (await traceDe("SELLER_PAYOUT_SETTLED", paye.id)) === 1 : false,
    "l'exécution laisse UNE trace au journal d'audit"
  );

  await pageA.goto(`${BASE}/admin/versements?q=${encodeURIComponent(NUMERO_PAYE)}`, {
    waitUntil: "networkidle",
  });
  verifier(
    (await pageA
      .locator("tbody tr", { hasText: NUMERO_PAYE })
      .getByRole("button", { name: /Marquer versé/ })
      .count()) === 0,
    "un versement exécuté n'offre plus aucune action — il ne se rejoue pas"
  );

  // ═══════════ 4. Le vendeur le voit, et le solde a bougé
  await pageV.goto(`${BASE}/vendeur/solde`, { waitUntil: "networkidle" });
  const texteV = await pageV.evaluate(() => document.body.innerText);
  verifier(
    texteV.includes(NUMERO_PAYE) && /Versé/.test(texteV),
    "le vendeur voit son versement, marqué « versé »"
  );

  // ═══════════ 5. Un refus rend le solde
  const demandeARefuser = await demander(pageV, {
    montant: 4000,
    telephone: NUMERO_REFUSE,
  });
  const enAttente = (await versementsDe(NUMERO_REFUSE))[0];
  verifier(
    enAttente?.status === "PENDING",
    "exactement 4 000 est accepté — le minimum est inclus",
    demandeARefuser.texte
  );

  await pageA.goto(`${BASE}/admin/versements?q=${encodeURIComponent(NUMERO_REFUSE)}`, {
    waitUntil: "networkidle",
  });
  const ligneR = pageA.locator("tbody tr", { hasText: NUMERO_REFUSE }).first();
  await ligneR.getByRole("button", { name: /^Refuser$/ }).click();

  /* Motif vide : le champ est `required`, le navigateur refuse l'envoi. On le
     prouve par la BASE — le versement doit rester en attente. */
  await ligneR.getByRole("button", { name: /Confirmer le refus/ }).click();
  await pageA.waitForTimeout(800);
  verifier(
    (await versementsDe(NUMERO_REFUSE))[0]?.status === "PENDING",
    "un refus SANS motif ne part pas"
  );

  await ligneR.getByLabel(/Motif du refus/).fill("Numéro Mobile Money inconnu");
  await ligneR.getByRole("button", { name: /Confirmer le refus/ }).click();
  let refuse;
  for (let i = 0; i < 40; i++) {
    refuse = (await versementsDe(NUMERO_REFUSE))[0];
    if (refuse?.status !== "PENDING") break;
    await new Promise((r) => setTimeout(r, 250));
  }
  verifier(
    refuse?.status === "REJECTED" && /inconnu/.test(refuse?.reason ?? ""),
    "le refus est enregistré avec son motif",
    `${refuse?.status} / ${refuse?.reason}`
  );

  const enCours = await lire(
    `SELECT COUNT(*)::int AS n FROM "Payout" WHERE "sellerId" = ? AND status = 'PENDING'`,
    vendeur.id
  );
  verifier(
    enCours[0].n === 0,
    "après le refus, plus rien n'est gelé : le vendeur peut redemander"
  );

  await ctxA.close();
  await ctxV.close();
} finally {
  await navigateur.close();
  await effacerLesMiens();
  await fermer();
}

console.log(
  echecs === 0
    ? "\nLe versement se demande, gèle le solde, s'exécute avec sa trace, et reste cloisonné.\n"
    : `\n${echecs} probleme(s).\n`
);
process.exit(echecs > 0 ? 1 : 0);
