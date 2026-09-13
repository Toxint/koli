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

console.log(`\n=== VERSEMENTS AUX VENDEURS depuis ${BASE} ===\n`);

let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const effacerLesMiens = () =>
  ecrire(`DELETE FROM "Payout" WHERE phone = ANY(?)`, NUMEROS);

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
  { montant, telephone, operateur = "Orange Money", sansGardeNavigateur = false }
) => {
  await page.goto(`${BASE}/vendeur/solde`, { waitUntil: "networkidle" });
  if ((await page.locator("#montant").count()) === 0) {
    return { formulaire: false, texte: "" };
  }
  if (sansGardeNavigateur) {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll("#montant, #telephone")) {
        el.removeAttribute("min");
        el.removeAttribute("max");
        el.removeAttribute("required");
      }
    });
  }
  await page.locator("#montant").fill(String(montant));
  await page.locator("#telephone").fill(telephone);
  if (await page.locator("#operateur").count()) {
    await page.locator("#operateur").fill(operateur);
  }
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

try {
  // ═══════════ 1. Le vendeur demande
  const { ctx: ctxV, page: pageV } = await connecter("vendeur@koli.ci");

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
