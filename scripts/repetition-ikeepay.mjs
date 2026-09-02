/**
 * REPETITION GENERALE : toute la chaine en mode `ikeepay`, sans un franc.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  iKeePay n'a pas de bac a sable pour l'encaissement. Le premier essai     │
 * │  chez eux est un vrai debit, sur un vrai numero.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce script est ce qui remplace ce bac a sable. Il exerce **tout ce qui nous
 * appartient** — le tunnel, l'adresse d'encaissement, le rappel, la mise sous
 * sequestre, le refus d'un rappel forge — en ne laissant a iKeePay que ce que
 * personne ne peut simuler a leur place : debiter un telephone.
 *
 * **Elle ne sort pas du poste.** Le serveur ne contacte jamais iKeePay, et
 * l'appel que le navigateur ferait vers leur tunnel est coupe (voir plus bas).
 * Elle peut donc tourner avec de vraies clefs sans rien declencher chez eux.
 *
 * Ce qu'il PROUVE :
 *   · le mode reel ne rend plus aucun bouton de simulation ;
 *   · aucune mention « aucun paiement reel » ne subsiste a l'ecran ;
 *   · l'adresse du tunnel porte la bonne clef publique et le BON MONTANT,
 *     recalcule par le serveur et non par le navigateur ;
 *   · un rappel authentique met les fonds sous sequestre ;
 *   · un rappel FORGE — le scenario reel, l'acheteur qui lit sa reference sur
 *     le lien de paiement — ne fait avancer strictement rien.
 *
 * Ce qu'il ne prouve PAS, et il faut le dire : qu'iKeePay poste bien son rappel
 * a la forme attendue, et qu'il l'envoie tout court. Cela ne se saura qu'au
 * premier vrai paiement.
 *
 * Prealable :
 *   1. PAYMENT_MODE=ikeepay et les clefs dans .env.local
 *   2. npm run build            (le mode est lu a la CONSTRUCTION)
 *   3. npx next start -H 0.0.0.0 -p 3000
 *   4. npm run ikeepay:repetition
 */

import { chromium } from "playwright";
import { chargerEnv } from "./env.mjs";
import { ecrire, lire, lireUne, fermer } from "./base-donnees.mjs";

chargerEnv();

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const JETON = process.env.IKEEPAY_WEBHOOK_TOKEN?.trim() ?? "";
const CLE_PUBLIQUE = process.env.IKEEPAY_PUBLIC_KEY?.trim() ?? "";
const MODE = (process.env.PAYMENT_MODE ?? "test").trim().toLowerCase();

console.log(`\n=== REPETITION iKeePay depuis ${BASE} ===\n`);

let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

/*
 * On refuse de tourner en mode test, et ce n'est pas une coquetterie.
 *
 * En `test`, tous les controles ci-dessous passeraient — en n'exercant rien du
 * tout : les boutons de simulation seraient absents parce qu'ils sont ailleurs,
 * le rappel serait accepte par un AUTRE fournisseur. Une repetition qui rend
 * vert sans avoir joue la piece est pire que pas de repetition.
 */
if (MODE !== "ikeepay") {
  console.log(`  PAYMENT_MODE vaut "${MODE}".`);
  console.log("");
  console.log("  Cette repetition n'a de sens qu'en mode `ikeepay` : c'est le");
  console.log("  fournisseur reel qu'elle exerce. En `test`, elle passerait au");
  console.log("  vert sans rien avoir verifie.");
  console.log("");
  console.log("  Pour l'executer :");
  console.log("    1. PAYMENT_MODE=ikeepay dans .env.local");
  console.log("    2. npm run build      ← le mode est lu a la construction");
  console.log("    3. relancer le serveur, puis ce script.");
  console.log("");
  await fermer();
  process.exit(2);
}

if (!JETON || JETON.length < 32) {
  console.log("  IKEEPAY_WEBHOOK_TOKEN absent ou trop court.");
  console.log("  npm run ikeepay:verifier pour le detail.\n");
  await fermer();
  process.exit(2);
}

// ═══════════════════════════════════════════════ La fixture
//
// On la note AVANT de l'inserer : une erreur sur la seconde insertion laisserait
// sinon une commande orpheline que le menage ignore. C'est arrive une fois.
const aNettoyer = [];
const suffixe = Date.now().toString(36).toUpperCase().slice(-8);
const idCommande = `rep-ikee-o-${suffixe}`;
const idPaiement = `rep-ikee-p-${suffixe}`;
const REFERENCE = `KOLI-REP${suffixe}`;
const MONTANT = 1000;

const vendeur = await lireUne(`SELECT id FROM "SellerProfile" LIMIT 1`);
if (!vendeur) {
  console.log("  Aucun vendeur en base — npm run base:preparer.\n");
  await fermer();
  process.exit(2);
}

/**
 * Pose la commande, sa ligne et son paiement en attente.
 *
 * Enfermee dans une fonction appelee DEPUIS le try : posee au niveau du
 * module, une erreur en cours de route echappait au `finally` et laissait une
 * commande orpheline en base. C'est arrive des le premier essai, sur un nom
 * de colonne devine au lieu d'etre lu.
 */
async function poserLaFixture() {
  // Note AVANT insertion : une erreur sur la seconde laisserait sinon une
  // commande que le menage ne connait pas.
  aNettoyer.push(idCommande);

  await ecrire(
    `INSERT INTO "Order" (id, reference, "sellerId", "buyerName", "buyerPhone",
       "buyerCountry", "buyerCity", "buyerAddress", "deliveryFee", status,
       "createdAt", "updatedAt")
     VALUES (?, ?, ?, 'Repetition iKeePay', '+2250700000098', 'Cote d''Ivoire',
       'Abidjan', 'Adresse de repetition', 0, 'PAYMENT_PENDING', now(), now())`,
    idCommande,
    REFERENCE,
    vendeur.id
  );

  // `OrderItem.productId` est une clef etrangere OBLIGATOIRE : la ligne de
  // commande designe un vrai produit, on n'en invente pas.
  const produit = await lireUne(`SELECT id FROM "Product" LIMIT 1`);
  if (!produit) {
    throw new Error("aucun produit en base — npm run base:preparer");
  }

  await ecrire(
    `INSERT INTO "OrderItem" (id, "orderId", "productId", quantity, "unitPrice")
     VALUES (?, ?, ?, 1, ?)`,
    `rep-ikee-i-${suffixe}`,
    idCommande,
    produit.id,
    MONTANT
  );

  await ecrire(
    // `Payment` n'a pas de `updatedAt` : on lit le schema, on ne le devine pas.
    `INSERT INTO "Payment" (id, "orderId", provider, status, amount, "providerRef",
       "createdAt")
     VALUES (?, ?, 'IKEEPAY', 'PENDING', ?, ?, now())`,
    idPaiement,
    idCommande,
    MONTANT,
    // `providerRef` = notre propre reference : le tunnel n'a pas d'appel serveur
    // a l'initiation, iKeePay ne connait la commande qu'au rappel.
    REFERENCE
  );

  /*
   * Le sequestre est cree VIDE avec la commande, et le paiement ne fait que le
   * marquer securise : `lib/payments/actions.ts` fait `fund.update`, pas
   * `upsert`. Une fixture sans cette ligne ne reproduit donc pas une vraie
   * commande — elle en fabrique une qui n'existe nulle part.
   */
  await ecrire(
    `INSERT INTO "Fund" (id, "orderId", "sellerId", amount, secured, released)
     VALUES (?, ?, ?, ?, false, false)`,
    `rep-ikee-f-${suffixe}`,
    idCommande,
    vendeur.id,
    MONTANT
  );
}

const statutPaiement = async () =>
  (await lireUne(`SELECT status FROM "Payment" WHERE id = ?`, idPaiement))?.status;

const sequestre = async () =>
  await lireUne(`SELECT secured, amount FROM "Fund" WHERE "orderId" = ?`, idCommande);

const rappeler = async (corps, jeton) =>
  fetch(
    `${BASE}/api/paiements/rappel${
      jeton === null ? "" : `?jeton=${encodeURIComponent(jeton)}`
    }`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: corps,
    }
  );

const navigateur = await chromium.launch();

try {
  await poserLaFixture();

  // ═══════════ 1. L'ecran de paiement, en mode reel
  const ctx = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
  });

  /*
   * On coupe l'appel vers iKeePay, et on garde l'adresse.
   *
   * Le SERVEUR ne les contacte jamais : `initiate()` ne fait que batir une
   * adresse, sans appel reseau. Le NAVIGATEUR, lui, chargeait cette adresse des
   * le clic sur « Payer » — la repetition ouvrait donc leur vraie page de
   * paiement, avec la vraie clef publique, a chaque execution.
   *
   * Rien n'y etait preleve : personne ne saisit de numero ni d'OTP. Mais on
   * coupe quand meme, pour trois raisons :
   *
   *   · une repetition doit etre reproductible, et une page distante ne l'est
   *     pas ;
   *   · le VPN de ce poste rend l'appel lent, et le test attendrait pour rien ;
   *   · on ne laisse pas de traces chez un prestataire pour un essai a blanc.
   *
   * L'attribut `src` reste lisible : c'est lui qu'on verifie, pas ce qu'il
   * ramene.
   */
  const hoteTunnel = new URL(
    process.env.IKEEPAY_CHECKOUT_URL?.trim() ||
      "https://ikeepay.com/checkout/v1/inline"
  ).host;
  await ctx.route(`**://${hoteTunnel}/**`, (r) => r.abort());

  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 160)));

  await page.goto(`${BASE}/pay/${REFERENCE}`, { waitUntil: "networkidle" });

  const texte = await page.evaluate(() => document.body.innerText);

  verifier(
    !/aucun (paiement|argent) r[ée]el|mode test/i.test(texte),
    "aucune mention « mode test » a l'ecran",
    (texte.match(/[^.]*(aucun (paiement|argent) r[ée]el|mode test)[^.]*/i) ?? [
      "",
    ])[0].trim()
  );

  /*
   * Les boutons de simulation doivent etre ABSENTS DU DOCUMENT, pas masques.
   * Un bouton cache se reaffiche en une ligne dans les outils de developpement
   * — et celui-la marque une commande payee.
   */
  const simulations = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .map((b) => b.textContent?.trim() ?? "")
      .filter((t) => /simuler|succ[eè]s|[ée]chec/i.test(t))
  );
  verifier(
    simulations.length === 0,
    "aucun bouton de simulation dans le document",
    simulations.join(" / ")
  );

  // ═══════════ 2. L'adresse du tunnel
  /*
   * Le tunnel ne s'affiche qu'apres un clic, et c'est voulu : l'habillage reste
   * masque jusqu'a `ikeepay-ready`, pour ne pas montrer un rectangle blanc au
   * milieu de la page pendant le chargement. Sur reseau mobile lent, ce blanc
   * dure et se lit comme une panne.
   */
  const ouvrir = page
    .getByRole("button", { name: /^Payer / })
    .filter({ visible: true })
    .first();

  verifier(
    (await ouvrir.count()) > 0,
    "un bouton ouvre le tunnel de paiement",
    "aucun bouton « Payer … »"
  );

  if ((await ouvrir.count()) > 0) await ouvrir.click();

  const src = await page
    .locator("iframe")
    .first()
    .getAttribute("src", { timeout: 15000 })
    .catch(() => null);

  verifier(Boolean(src), "le tunnel iKeePay est rendu", "aucune iframe");

  if (src) {
    const u = new URL(src);
    verifier(u.protocol === "https:", "le tunnel est servi en https", u.protocol);
    verifier(
      u.searchParams.get("pk") === CLE_PUBLIQUE && CLE_PUBLIQUE.length > 0,
      "l'adresse porte notre clef publique"
    );
    verifier(
      u.searchParams.get("order_id") === REFERENCE,
      "l'adresse porte la reference de la commande",
      u.searchParams.get("order_id") ?? "aucune"
    );
    /*
     * LE controle du montant.
     *
     * Il part du SERVEUR, recalcule depuis les lignes de la commande. Le
     * prendre du navigateur reviendrait a laisser le payeur choisir combien il
     * paie — et ce serait invisible : la page afficherait le bon prix.
     */
    verifier(
      Number(u.searchParams.get("amount")) === MONTANT,
      "l'adresse porte le montant recalcule par le serveur",
      `${u.searchParams.get("amount")} au lieu de ${MONTANT}`
    );
  }

  verifier(erreurs.length === 0, "aucune erreur JavaScript", erreurs[0] ?? "");
  await ctx.close();

  // ═══════════ 3. Un rappel FORGE ne fait avancer personne
  //
  // C'est le scenario reel : l'acheteur ouvre le lien de paiement, y lit la
  // reference, et tente de marquer sa commande payee sans payer.
  const corps = JSON.stringify({
    event: "payment.success",
    data: {
      order_id: REFERENCE,
      amount: MONTANT,
      currency: "XOF",
      status: "completed",
    },
  });

  {
    const r = await rappeler(corps, "jeton-invente-par-l-acheteur-aaaaaaaaaaaa");
    verifier(
      (await statutPaiement()) === "PENDING",
      "un rappel au mauvais jeton ne paie rien",
      `statut ${await statutPaiement()} (HTTP ${r.status})`
    );
  }

  {
    const r = await rappeler(corps, null);
    verifier(
      (await statutPaiement()) === "PENDING",
      "un rappel SANS jeton ne paie rien",
      `statut ${await statutPaiement()} (HTTP ${r.status})`
    );
  }

  // ═══════════ 4. Un rappel authentique met les fonds sous sequestre
  {
    const r = await rappeler(corps, JETON);
    verifier(
      r.status === 200,
      "le rappel authentique est accepte",
      `HTTP ${r.status}`
    );

    const statut = await statutPaiement();
    verifier(statut === "SUCCEEDED", "le paiement passe a SUCCEEDED", statut);

    const f = await sequestre();
    verifier(Boolean(f), "un sequestre est cree", "aucune ligne dans Fund");
    verifier(f?.secured === true, "les fonds sont SECURISES", String(f?.secured));
    verifier(
      Number(f?.amount) === MONTANT,
      "le sequestre porte le montant paye",
      `${f?.amount} au lieu de ${MONTANT}`
    );

    const o = await lireUne(
      `SELECT status FROM "Order" WHERE id = ?`,
      idCommande
    );
    verifier(
      o?.status !== "PAYMENT_PENDING",
      "la commande a quitte « en attente de paiement »",
      o?.status ?? "?"
    );
  }

  // ═══════════ 5. Rejoue : le meme rappel ne double pas le sequestre
  //
  // Les agregateurs REJOUENT leurs rappels quand ils n'ont pas eu de 200 assez
  // vite. Sans idempotence, un client paierait une fois et le vendeur serait
  // credite deux.
  {
    await rappeler(corps, JETON);
    const lignes = await lire(
      `SELECT id FROM "Fund" WHERE "orderId" = ?`,
      idCommande
    );
    verifier(
      lignes.length === 1,
      "un rappel rejoue ne cree pas un second sequestre",
      `${lignes.length} lignes`
    );
  }

  // ═══════════ 6. Une reference inconnue ne renseigne pas l'appelant
  {
    const r = await rappeler(
      JSON.stringify({
        event: "payment.success",
        data: {
          order_id: "KOLI-NEXISTEPAS",
          amount: 500,
          currency: "XOF",
          status: "completed",
        },
      }),
      JETON
    );
    const t = await r.text();
    verifier(
      r.status === 200 && !/introuvable|inconnu|not.?found/i.test(t),
      "une reference inconnue ne revele pas qu'elle est inconnue",
      `HTTP ${r.status} — ${t.slice(0, 60)}`
    );
  }
} finally {
  await navigateur.close();
  for (const id of aNettoyer) {
    await ecrire('DELETE FROM "Order" WHERE id = ?', id);
  }
  console.log(`\n  · ${aNettoyer.length} fixture(s) effacee(s)`);
  await fermer();
}

console.log("");
if (echecs === 0) {
  console.log(
    "Toute la chaine tient en mode reel — sauf ce qu'iKeePay seul peut prouver :"
  );
  console.log("qu'ils envoient bien leur rappel, et a la forme attendue.");
} else {
  console.log(`${echecs} probleme(s). NE PAS encaisser tant qu'ils subsistent.`);
}
process.exit(echecs > 0 ? 1 : 0);
