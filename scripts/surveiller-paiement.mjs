/**
 * Surveille l'aboutissement d'un vrai paiement, et dit ce qui est arrivé.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  L'écran du payeur ne prouve rien. C'est la base qui fait foi.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le tunnel iKeePay poste `ikeepay-success` au navigateur — un message CLIENT,
 * que n'importe qui peut émettre depuis la console. Il ne conclut rien. Le
 * verdict arrive par le rappel, sur `/api/paiements/rappel`, et c'est ce que ce
 * script guette.
 *
 * ── Les trois issues, et pourquoi il faut les distinguer ────────────────────
 *
 * **Le rappel arrive et tout suit.** Paiement `SUCCEEDED`, fonds sous
 * séquestre, facture émise, écritures au journal. C'est le cas qu'on espère, et
 * le seul qui prouve que la chaîne tient de bout en bout.
 *
 * **Le rappel arrive et quelque chose bloque.** Le paiement bouge mais le
 * séquestre non, ou la facture manque. Cela veut dire que `appliquerAboutissement`
 * a refusé — transition illégale, commande introuvable. Le client est débité et
 * le vendeur ne voit rien : c'est le pire cas, et il faut le savoir tout de
 * suite.
 *
 * **Rien n'arrive.** Deux causes qui se ressemblent et n'ont rien à voir :
 * personne n'a payé, ou bien quelqu'un a payé et le rappel s'est perdu — adresse
 * mal déclarée chez eux, jeton erroné, réseau. Ce script ne peut pas les
 * départager, et personne ne le peut : iKeePay n'expose aucun point d'entrée
 * pour relire l'état d'une transaction. Il le DIT plutôt que de conclure.
 *
 * ⚠ Ne jamais payer une seconde fois sur la foi d'un silence. Il faut aller lire
 * la transaction dans leur tableau de bord.
 *
 * Usage :
 *   npm run ikeepay:surveiller -- KOLI-E5ZNYA6R
 *   npm run ikeepay:surveiller -- KOLI-E5ZNYA6R --minutes 30
 */

import { chargerEnv } from "./env.mjs";

// `.env` SEUL : c'est la base en ligne qu'on surveille, celle que le site
// d'essai écrit. `.env.local` désigne le poste, et lire l'une en croyant lire
// l'autre ferait annoncer un silence qui n'existe pas.
chargerEnv(".env");

const { Pool } = await import("pg");

const args = process.argv.slice(2);
const REFERENCE = args.find((a) => /^KOLI-/i.test(a))?.toUpperCase();
const MINUTES = Number(args[args.indexOf("--minutes") + 1]) || 20;
const INTERVALLE_MS = 15_000;

if (!REFERENCE) {
  console.log("\n  Usage : npm run ikeepay:surveiller -- KOLI-XXXXXXXX\n");
  process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

/*
 * La lecture SURVIT aux pannes passageres, et c est tout l interet.
 *
 * La premiere version mourait sur la premiere erreur reseau. Une coupure DNS
 * d une seconde — le VPN de ce poste en produit — tuait une surveillance de
 * quarante-cinq minutes, et le script rendait la main sans rien dire. Pire :
 * l enveloppe npm rapportait un code de sortie 0, donc un succes. Un veilleur
 * qui meurt en silence est plus dangereux que pas de veilleur du tout : on
 * conclut « rien n est arrive » alors que personne ne regardait.
 *
 * On reessaie donc, et on COMPTE les echecs pour les dire a la fin.
 */
let pannes = 0;

const lireBrut = async () =>
  (
    await q(
      `SELECT o.status AS commande, o."updatedAt",
              p.status AS paiement, p.amount, p."providerRef", p."payerMsisdn",
              p."payerOperator", p."lastCheckedAt", p."confirmedAt",
              p."failureReason", p."simulatedOutcome",
              f.secured, f.amount AS sequestre,
              i.number AS facture,
              (SELECT count(*)::int FROM "Transaction" t WHERE t."orderId" = o.id) AS ecritures
         FROM "Order" o
         JOIN "Payment" p ON p."orderId" = o.id
         LEFT JOIN "Fund" f ON f."orderId" = o.id
         LEFT JOIN "Invoice" i ON i."orderId" = o.id
        WHERE o.reference = $1`,
      [REFERENCE]
    )
  )[0];

const lire = async () => {
  try {
    const r = await lireBrut();
    return r;
  } catch (e) {
    pannes++;
    console.log("  · lecture impossible (" + String(e.code ?? e.message).slice(0, 40) + ") — je reessaie");
    return null;
  }
};

/*
 * La premiere lecture a droit a trois essais.
 *
 * Sans cela, une panne reseau au demarrage faisait annoncer « cette commande
 * n existe pas » — une affirmation FAUSSE, et sur laquelle on aurait agi. Une
 * lecture qui echoue et une commande absente ne se ressemblent que dans le
 * code : il faut les distinguer avant de parler.
 */
let depart = null;
for (let essai = 1; essai <= 3 && !depart; essai++) {
  depart = await lire();
  if (!depart && essai < 3) await new Promise((r) => setTimeout(r, 4000));
}

if (!depart) {
  console.log(
    pannes > 0
      ? `\n  Impossible de lire la base apres 3 essais — reseau.` +
        `\n  On ne sait RIEN de ${REFERENCE} : ce n est pas un silence, c est une cecite.\n`
      : `\n  ${REFERENCE} n existe pas dans la base en ligne.\n`
  );
  await pool.end();
  process.exit(2);
}

console.log(`\n=== SURVEILLANCE DE ${REFERENCE} ===\n`);
console.log(`  au depart : ${depart.commande} / ${depart.paiement}  ${depart.amount} FCFA`);
console.log(`  rappel    : ${depart.lastCheckedAt ? "deja recu" : "aucun"}`);
console.log(`\n  J'attends jusqu'a ${MINUTES} minutes. Payez quand vous voulez.\n`);

const echeance = Date.now() + MINUTES * 60_000;
const empreinte = (e) =>
  [e.commande, e.paiement, e.secured, e.facture, e.ecritures, e.lastCheckedAt].join("|");
const depuis = empreinte(depart);

let etat = depart;
let bouge = false;

while (Date.now() < echeance) {
  await new Promise((r) => setTimeout(r, INTERVALLE_MS));
  const lu = await lire();
  if (!lu) continue; // panne passagere : on reessaie au tour suivant
  etat = lu;
  if (empreinte(etat) !== depuis) {
    bouge = true;
    break;
  }
}

console.log("=== VERDICT ===\n");

if (!bouge) {
  console.log("  RIEN N'EST ARRIVE.\n");
  if (pannes > 0) {
    console.log(`  ⚠ ${pannes} lecture(s) ont echoue pendant la surveillance.`);
    console.log("    Ce silence est donc moins sur qu il n en a l air.\n");
  }
  console.log("  Deux causes possibles, et elles ne se distinguent pas d'ici :");
  console.log("    · personne n'a paye ;");
  console.log("    · quelqu'un a paye et le rappel s'est perdu — adresse mal");
  console.log("      declaree chez iKeePay, jeton errone, ou reseau.");
  console.log("");
  console.log("  ⚠ NE PAYEZ PAS une seconde fois sur la foi de ce silence.");
  console.log("    Allez lire la transaction dans le tableau de bord iKeePay :");
  console.log("    ils n'exposent aucun point d'entree pour la relire d'ici.\n");
  await pool.end();
  process.exit(1);
}

console.log(`  Quelque chose est arrive a ${new Date().toLocaleTimeString("fr-FR")}.\n`);
console.log(`    commande    : ${depart.commande}  ->  ${etat.commande}`);
console.log(`    paiement    : ${depart.paiement}  ->  ${etat.paiement}`);
console.log(`    payeur      : ${etat.payerMsisdn ?? "(non transmis)"} ${etat.payerOperator ?? ""}`);
console.log(`    providerRef : ${etat.providerRef ?? "(nul)"}`);
console.log(`    sequestre   : ${etat.secured ? "SECURISE" : "toujours en attente"}  (${etat.sequestre} FCFA)`);
console.log(`    facture     : ${etat.facture ?? "aucune"}`);
console.log(`    ecritures   : ${etat.ecritures}`);
if (etat.failureReason) console.log(`    motif echec : ${etat.failureReason}`);
console.log("");

/*
 * Le succes se PROUVE par les consequences, pas par le statut du paiement.
 *
 * C'est exactement le defaut qui a failli passer en production : le rappel
 * marquait le paiement abouti et ne declenchait rien. Un client debite, un
 * vendeur qui ne voit rien. On verifie donc les quatre choses.
 */
const complet =
  etat.paiement === "SUCCEEDED" &&
  etat.secured === true &&
  Boolean(etat.facture) &&
  etat.ecritures >= 2;

if (complet) {
  console.log("  ✓ LA CHAINE TIENT DE BOUT EN BOUT.");
  console.log("    Le rappel est arrive, les fonds sont sous sequestre, la facture");
  console.log("    est emise, le journal est ecrit. C'est le premier vrai");
  console.log("    encaissement de KOLI.\n");
  await pool.end();
  process.exit(0);
}

if (etat.paiement === "SUCCEEDED") {
  console.log("  ⚠ LE PAIEMENT EST ABOUTI MAIS LES CONSEQUENCES MANQUENT.");
  console.log("    Le client est debite et le vendeur ne voit rien. C'est le");
  console.log("    scenario que `lib/payments/aboutissement.ts` doit empecher —");
  console.log("    regarder les journaux de la route de rappel.\n");
  await pool.end();
  process.exit(1);
}

console.log(`  · Le paiement est passe a ${etat.paiement}, sans aboutir.`);
console.log("    Si c'est FAILED, le client peut reessayer depuis le meme lien.\n");
await pool.end();
process.exit(1);
