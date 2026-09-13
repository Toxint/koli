/**
 * L'écran de RAPPROCHEMENT montre-t-il ce qu'il faut vérifier chez iKeePay,
 * et SEULEMENT cela ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Tant qu'iKeePay n'offre aucune route de vérification, un rappel perdu  │
 * │  ne se voit QUE sur cet écran. S'il n'affiche pas un paiement bloqué,   │
 * │  un client débité reste invisible.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce contrôle éprouve les DEUX bornes, parce qu'une liste de travail peut
 * mentir dans les deux sens :
 *
 *   · trop peu — un paiement bloqué depuis deux heures n'apparaît pas ;
 *   · trop — un client qui valide sur son téléphone depuis cinq minutes y
 *     figure, et l'administrateur finit par ne plus lire une liste qui crie
 *     sur du sain.
 *
 * Il pose ses propres données et les efface. La liste des fixtures est notée
 * AVANT chaque insertion : notée après, un échec sur la seconde laissait une
 * commande orpheline que le ménage ne connaissait pas (voir `verif:rappel`).
 *
 * Usage :
 *   node scripts/test-rapprochement.mjs
 */

import { chromium } from "playwright";
import { lireUne, ecrire, fermer } from "./base-donnees.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

console.log(`\n=== RAPPROCHEMENT depuis ${BASE} ===\n`);

let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const vendeur = await lireUne(
  `SELECT s.id FROM "SellerProfile" s JOIN "User" u ON u.id = s."userId" WHERE u.email = ?`,
  "vendeur@koli.ci"
);
if (!vendeur) {
  console.log("  ✗ le vendeur de démonstration est absent — lancer npm run base:preparer");
  process.exit(1);
}

const suffixe = Date.now().toString(36).toUpperCase();
const commandes = [];
const journaux = [];

/*
 * ⚠ `now() AT TIME ZONE 'UTC'`, jamais `now()` seul.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Les colonnes de Prisma sont des `timestamp` SANS fuseau, et Prisma y    │
 * │  écrit de l'UTC. `now()` y dépose l'heure du FUSEAU DE LA SESSION        │
 * │  PostgreSQL — Europe/Paris sur ce poste, soit deux heures d'avance.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La première version posait un paiement « d'il y a deux heures » avec
 * `now() - 120 minutes`. Il tombait EXACTEMENT à l'heure UTC courante : l'écran,
 * qui a raison de ne lister que ce qui attend depuis trente minutes, l'écartait
 * — et le contrôle accusait l'écran d'un trou qui était dans la fixture.
 *
 * Supabase tourne en UTC : la même fixture y aurait « marché ». Un contrôle
 * juste sur une base et faux sur l'autre ne prouve rien sur aucune des deux.
 */

/** Une commande et son paiement en attente, créés `minutes` plus tôt. */
const poserPaiement = async (etiquette, minutes) => {
  const idCommande = `ctrl-rappro-o-${etiquette}-${suffixe}`;
  const reference = `KOLI-RP${etiquette}${suffixe}`.slice(0, 20);
  commandes.push(idCommande);
  await ecrire(
    `INSERT INTO "Order" (id, reference, "sellerId", "buyerName", "buyerPhone",
       "buyerCountry", "buyerCity", "buyerAddress", "deliveryFee", status,
       "createdAt", "updatedAt")
     VALUES (?, ?, ?, 'Controle Rapprochement', '+2250700000098', 'Cote d''Ivoire',
       'Abidjan', 'Adresse de controle', 0, 'PAYMENT_PENDING',
       (now() AT TIME ZONE 'UTC') - (?::int * interval '1 minute'), now())`,
    idCommande,
    reference,
    vendeur.id,
    minutes
  );
  await ecrire(
    `INSERT INTO "Payment" (id, "orderId", provider, status, amount, "createdAt")
     VALUES (?, ?, 'IKEEPAY', 'AWAITING_CUSTOMER', 12500,
       (now() AT TIME ZONE 'UTC') - (?::int * interval '1 minute'))`,
    `ctrl-rappro-p-${etiquette}-${suffixe}`,
    idCommande,
    minutes
  );
  return reference;
};

/** Un rappel écarté, consigné `jours` plus tôt. */
const poserRejet = async (etiquette, jours) => {
  const id = `ctrl-rappro-a-${etiquette}-${suffixe}`;
  const reference = `REJET-${etiquette}-${suffixe}`;
  journaux.push(id);
  await ecrire(
    `INSERT INTO "AuditLog" (id, action, "entityType", "entityId", metadata, "createdAt")
     VALUES (?, 'PAYMENT_CALLBACK_DISCARDED', 'Payment', ?, ?,
       (now() AT TIME ZONE 'UTC') - (?::int * interval '1 day'))`,
    id,
    reference,
    JSON.stringify({ motif: "aucun paiement ne porte cette référence", montantRecu: 796, deviseRecue: "CDF" }),
    jours
  );
  return reference;
};

const navigateur = await chromium.launch();

try {
  const bloque = await poserPaiement("VIEUX", 120);
  const enCours = await poserPaiement("FRAIS", 5);
  const rejetRecent = await poserRejet("RECENT", 0);
  const rejetAncien = await poserRejet("ANCIEN", 10);

  // ═══════════ 1. L'administration voit ce qu'il faut vérifier
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill("admin@koli.ci");
  await page.locator("#password").fill(MDP);
  await page.getByRole("button", { name: /^Se connecter$/ }).filter({ visible: true }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 30000 }).catch(() => {});

  await page.goto(`${BASE}/admin/rapprochement`, { waitUntil: "networkidle" });

  const references = (section) =>
    page
      .locator(`[data-section="${section}"] [data-reference]`)
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-reference")));

  const attente = await references("attente");
  const rejets = await references("rejets");

  verifier(
    attente.includes(bloque),
    "un paiement en attente depuis deux heures est à vérifier",
    `${attente.length} référence(s) listée(s)`
  );
  verifier(
    !attente.includes(enCours),
    "un paiement de cinq minutes n'y figure PAS — le client est peut-être en train de valider"
  );
  verifier(
    rejets.includes(rejetRecent),
    "un rappel écarté aujourd'hui est à vérifier"
  );
  verifier(
    !rejets.includes(rejetAncien),
    "un rappel écarté il y a dix jours n'y figure plus"
  );

  const texte = await page.evaluate(() => document.body.innerText);
  verifier(
    /tableau de bord iKeePay/i.test(texte) && /COMPLETED/.test(texte),
    "l'écran dit QUOI faire de ces références, et où les chercher"
  );
  verifier(
    (await page.locator("main button").count()) === 0,
    "aucun bouton : l'écran ne conclut rien, il montre"
  );
  await ctx.close();

  // ═══════════ 2. Personne d'autre n'y accède
  const ctxV = await navigateur.newContext();
  const pageV = await ctxV.newPage();
  await pageV.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await pageV.locator("#identifier").fill("vendeur@koli.ci");
  await pageV.locator("#password").fill(MDP);
  await pageV.getByRole("button", { name: /^Se connecter$/ }).filter({ visible: true }).first().click();
  await pageV.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 30000 }).catch(() => {});
  await pageV.goto(`${BASE}/admin/rapprochement`, { waitUntil: "domcontentloaded" });
  verifier(
    !new URL(pageV.url()).pathname.startsWith("/admin"),
    "un vendeur est renvoyé hors de l'écran de rapprochement",
    new URL(pageV.url()).pathname
  );
  await ctxV.close();
} finally {
  await navigateur.close();
  for (const id of commandes) await ecrire(`DELETE FROM "Order" WHERE id = ?`, id);
  for (const id of journaux) await ecrire(`DELETE FROM "AuditLog" WHERE id = ?`, id);
  console.log(`\n  · ${commandes.length} commande(s) et ${journaux.length} trace(s) de contrôle effacées`);
  await fermer();
}

console.log(
  echecs === 0
    ? "\nLe rapprochement montre ce qu'il faut vérifier chez iKeePay, et seulement cela.\n"
    : `\n${echecs} probleme(s).\n`
);
process.exit(echecs > 0 ? 1 : 0);
