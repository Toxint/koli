/**
 * Rappel du fournisseur de paiement (§29, §52), contre le serveur reel.
 *
 * Ce que ce test protege : la route `/api/paiements/rappel` est la PORTE
 * D'ENTREE la plus dangereuse du systeme. Un rappel accepte sans preuve
 * d'origine permettrait a quiconque connait une reference de marquer une
 * commande payee — donc de faire expedier un colis sans jamais payer.
 *
 * Il eprouve aussi ce qui distingue un point d'entree correct d'un point
 * d'entree bavard : la reponse ne doit pas reveler quelles references
 * existent.
 *
 * Usage :
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-rappel-paiement.mjs
 */

import { createHmac } from "node:crypto";
import { lire, lireUne, ecrire } from "./base-donnees.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? "secret-de-test-koli";

console.log(`\n=== RAPPEL DE PAIEMENT depuis ${BASE} ===\n`);

let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

/**
 * Pose une reference fournisseur sur un paiement en attente.
 *
 * C'est exactement ce que fait `initiate` dans l'application. Sans elle, les
 * deux derniers controles n'auraient rien a examiner : en mode test le
 * fournisseur repond immediatement, donc aucun paiement ne reste EN ATTENTE
 * avec une reference — la situation meme que les rappels asynchrones creent.
 *
 * On la fabrique donc, plutot que d'annoncer un controle qui ne verifie rien.
 */
const preparerPaiementEnAttente = async () => {
  const cible = await lireUne(
    `SELECT id, amount FROM "Payment" WHERE status = 'PENDING' LIMIT 1`
  );

  if (!cible) return null;

  const ref = `test_rappel_${Date.now()}`;
  await ecrire('UPDATE "Payment" SET "providerRef" = ? WHERE id = ?', ref, cible.id);

  return { id: cible.id, amount: cible.amount, providerRef: ref };
};

const signer = (corps) =>
  createHmac("sha256", SECRET).update(corps, "utf8").digest("hex");

const rappeler = async (corps, entetes = {}) =>
  fetch(`${BASE}/api/paiements/rappel`, {
    method: "POST",
    headers: { "content-type": "application/json", ...entetes },
    body: corps,
  });

// ═══════════ 1. Aucune signature : refus
{
  const corps = JSON.stringify({ providerRef: "peu-importe", status: "SUCCEEDED" });
  const r = await rappeler(corps);

  verifier(
    r.status === 401,
    "un rappel SANS signature est refuse",
    `statut ${r.status}`
  );
}

// ═══════════ 2. Signature fabriquee : refus
{
  const corps = JSON.stringify({ providerRef: "peu-importe", status: "SUCCEEDED" });
  const r = await rappeler(corps, { "x-koli-signature": "0".repeat(64) });

  verifier(r.status === 401, "une signature fabriquee est refusee", `statut ${r.status}`);
}

// ═══════════ 3. Corps modifie apres signature : refus
{
  const original = JSON.stringify({ providerRef: "r", status: "FAILED", amount: 100 });
  const falsifie = JSON.stringify({ providerRef: "r", status: "SUCCEEDED", amount: 100 });
  const r = await rappeler(falsifie, { "x-koli-signature": signer(original) });

  verifier(
    r.status === 401,
    "un corps modifie apres signature est refuse",
    `statut ${r.status}`
  );
}

// ═══════════ 4. LE POINT CRITIQUE : un rappel forge ne fait payer personne
{
  // On cible une VRAIE commande encore en attente de paiement.
  const cible = (await lire(
    `SELECT p.id, p.status, o.reference FROM "Payment" p
       JOIN "Order" o ON o.id = p."orderId"
      WHERE p.status = 'PENDING' LIMIT 1`
  ))[0];

  if (!cible) {
    verifier(false, "une commande en attente existe pour eprouver le forgeage");
  } else {
    const avant = cible.status;
    const corps = JSON.stringify({
      providerRef: `test_${cible.reference}_forge`,
      status: "SUCCEEDED",
      amount: 999999,
    });

    // Sans signature valide.
    const r = await rappeler(corps, { "x-koli-signature": "f".repeat(64) });

    const apres = (await lire(`SELECT status FROM "Payment" WHERE id = ?`, cible.id))[0].status;

    verifier(r.status === 401, "le rappel forge est rejete", `statut ${r.status}`);
    verifier(
      apres === avant,
      "et le paiement n'a PAS bouge",
      `${avant} → ${apres}`
    );
  }
}

// ═══════════ 5. Signature valide, reference inconnue : rien ne fuit
{
  const corps = JSON.stringify({
    providerRef: "reference-qui-n-existe-pas",
    status: "SUCCEEDED",
    amount: 100,
  });
  const r = await rappeler(corps, { "x-koli-signature": signer(corps) });
  const contenu = await r.text();

  verifier(r.status === 200, "une reference inconnue rend 200", `statut ${r.status}`);

  // Le point : la reponse ne doit pas dire si la reference existait. Sinon ce
  // point d'entree devient un oracle — on apprend quelles references sont
  // valides en observant les reponses.
  verifier(
    !/introuvable|inconnu|not found/i.test(contenu),
    "et ne revele PAS que la reference est inconnue",
    contenu.slice(0, 60)
  );
}

// ═══════════ 6. Un etat inconnu n'entre pas en base
{
  const corps = JSON.stringify({
    providerRef: "r",
    status: "JE_FAIS_CE_QUE_JE_VEUX",
    amount: 1,
  });
  const r = await rappeler(corps, { "x-koli-signature": signer(corps) });

  verifier(
    r.status === 401,
    "un etat inconnu est refuse a la porte",
    `statut ${r.status}`
  );
}

// ═══════════ 7. Signature valide sur un paiement reel : l'etat suit
{
  const cible = (await preparerPaiementEnAttente());

  if (!cible) {
    verifier(false, "un paiement en attente existe pour eprouver le rappel");
  } else {
    const corps = JSON.stringify({
      providerRef: cible.providerRef,
      status: "AWAITING_CUSTOMER",
      amount: cible.amount,
    });
    const r = await rappeler(corps, { "x-koli-signature": signer(corps) });
    const apres = (await lire(`SELECT status FROM "Payment" WHERE id = ?`, cible.id))[0].status;

    verifier(r.status === 200, "un rappel signe est accepte");
    verifier(
      apres === "AWAITING_CUSTOMER",
      "l'etat du paiement suit le rappel",
      apres
    );

    // Rejeu : les agregateurs renvoient leurs rappels. Le meme, deux fois, ne
    // doit rien casser.
    const r2 = await rappeler(corps, { "x-koli-signature": signer(corps) });
    const apres2 = (await lire(`SELECT status FROM "Payment" WHERE id = ?`, cible.id))[0].status;
    verifier(
      r2.status === 200 && apres2 === "AWAITING_CUSTOMER",
      "un rappel rejoue ne change rien de plus"
    );
  }
}

// ═══════════ 8. Un montant discordant n'est pas traite
{
  const cible = (await preparerPaiementEnAttente());

  if (!cible) {
    verifier(false, "un paiement en attente existe pour eprouver le montant");
  } else {
    const corps = JSON.stringify({
      providerRef: cible.providerRef,
      status: "SUCCEEDED",
      // Un montant qui ne correspond pas : paiement partiel, ou transaction
      // croisee. Dans les deux cas, on ne conclut pas.
      amount: cible.amount + 1,
    });
    const r = await rappeler(corps, { "x-koli-signature": signer(corps) });
    const apres = (await lire(`SELECT status FROM "Payment" WHERE id = ?`, cible.id))[0].status;

    verifier(r.status === 200, "le rappel discordant est recu sans erreur");
    verifier(
      apres !== "SUCCEEDED",
      "mais le paiement n'est PAS marque abouti",
      apres
    );
  }
}

console.log("");
console.log(
  echecs === 0
    ? "La porte d'entree des rappels ne s'ouvre que sur signature valide."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
