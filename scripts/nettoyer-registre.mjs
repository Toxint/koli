/**
 * Retire du registre de PRODUCTION les commandes nées d'une SIMULATION.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Le site de production tourne en mode test contre la vraie base. Chaque  │
 * │  visiteur qui appuie sur « simuler un paiement réussi » fabrique donc    │
 * │  une commande, un séquestre et un NUMÉRO DE FACTURE dans le registre     │
 * │  réel.                                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce n'est pas une hypothèse. Le 2 septembre 2026, la commande KOLI-M6BDYA9F
 * portait 2 500 FCFA jamais encaissés, 2 000 FCFA de séquestre inexistant, et
 * la facture FAC-2026-000001 — le premier numéro de la série fiscale de
 * l'année. Le premier vrai vendeur y aurait lu un solde qui n'est celui de
 * personne, sur une application dont le sujet est la confiance.
 *
 * ── Comment il les reconnaît ────────────────────────────────────────────────
 *
 * Par `Payment.simulatedOutcome`. Cette colonne est renseignée par le chemin
 * simulé et **reste nulle en mode réel** — c'est précisément pour cela qu'elle
 * a été gardée telle quelle dans `lib/payments/aboutissement.ts`. Elle
 * distingue, dans le registre, un encaissement qu'on a joué d'un encaissement
 * qui a eu lieu, et elle est ici le seul critère sûr.
 *
 * `provider = 'TEST'` ne suffirait pas : une commande peut naître en mode test
 * et n'avoir jamais été payée. Ce qu'on retire, ce sont les écritures
 * FABRIQUÉES, pas les commandes en attente.
 *
 * ── Pourquoi il ne s'exécute pas tout seul ──────────────────────────────────
 *
 * Il efface des lignes d'un registre financier sur la base en ligne. Sans
 * `--appliquer`, il montre et ne touche à rien — même règle que
 * `migrer-supabase.mjs`, et pour la même raison : un script destructeur qui
 * agit par défaut finit par agir un jour où on ne le voulait pas.
 *
 * Usage :
 *   npm run supabase:registre                # montre
 *   npm run supabase:registre -- --appliquer # efface
 */

import { chargerEnv } from "./env.mjs";

/*
 * `.env` SEUL, comme `preparer-supabase.mjs`.
 *
 * `.env.local` désigne la base LOCALE. Un script qui efface des commandes et
 * lirait l'une en croyant lire l'autre ne serait pas une gêne, ce serait une
 * destruction — et du mauvais côté : on croirait avoir nettoyé la production
 * alors qu'on aurait vidé son poste.
 */
chargerEnv(".env");

const { Pool } = await import("pg");

const appliquer = process.argv.includes("--appliquer");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;

const fcfa = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " FCFA";

console.log("\n=== ECRITURES SIMULEES DANS LE REGISTRE EN LIGNE ===\n");

const cibles = await q(`
  SELECT o.id, o.reference, o.status, o."buyerName", o."createdAt",
         p."simulatedOutcome", p.amount, p.provider,
         i.number AS facture
    FROM "Order" o
    JOIN "Payment" p ON p."orderId" = o.id
    LEFT JOIN "Invoice" i ON i."orderId" = o.id
   WHERE p."simulatedOutcome" IS NOT NULL
   ORDER BY o."createdAt"`);

if (cibles.length === 0) {
  console.log("  Aucune. Le registre ne porte que des mouvements reels.\n");
  await pool.end();
  process.exit(0);
}

for (const c of cibles) {
  console.log(`  ${c.reference}  ${new Date(c.createdAt).toLocaleString("fr-FR")}`);
  console.log(`    acheteur  : ${c.buyerName}`);
  console.log(`    statut    : ${c.status}`);
  console.log(`    paiement  : ${c.provider} / ${c.simulatedOutcome}  ${fcfa(c.amount)}`);
  if (c.facture) console.log(`    facture   : ${c.facture}   <- ce numero est immobilise`);
  console.log("");
}

console.log(`  ${cibles.length} commande(s) fabriquee(s).`);

if (!appliquer) {
  console.log("\n  Rien n'a ete modifie.");
  console.log("  Pour effacer : npm run supabase:registre -- --appliquer\n");
  await pool.end();
  process.exit(0);
}

/*
 * On compte les dependances AVANT et APRES.
 *
 * Les cascades sont declarees dans le schema, mais une cascade qu'on croit
 * presente et qui ne l'est pas laisse des lignes orphelines — et une ligne
 * orpheline dans un registre financier est pire qu'une ligne fausse : elle
 * n'apparait plus nulle part, et personne ne la retrouvera.
 */
const DEPENDANCES = [
  "Payment",
  "Fund",
  "Invoice",
  "Transaction",
  "OrderItem",
  "Delivery",
  "OrderStatusHistory",
];

const compter = async (ids) => {
  const r = {};
  for (const t of DEPENDANCES) {
    r[t] = Number(
      (await q(`SELECT count(*)::int n FROM "${t}" WHERE "orderId" = ANY($1)`, [ids]))[0].n
    );
  }
  return r;
};

const ids = cibles.map((c) => c.id);
const comptesAvant = Number((await q(`SELECT count(*)::int n FROM "User"`))[0].n);
const avant = await compter(ids);

console.log("");
for (const [t, n] of Object.entries(avant)) {
  if (n > 0) console.log(`    ${t.padEnd(20)} ${n} ligne(s)`);
}

// Une seule instruction : soit tout part, soit rien.
await q(`DELETE FROM "Order" WHERE id = ANY($1)`, [ids]);

const apres = await compter(ids);
const restants = Object.entries(apres).filter(([, n]) => n > 0);

console.log(`\n  ✓ ${cibles.length} commande(s) effacee(s)`);

if (restants.length > 0) {
  console.log("\n  ⚠ LIGNES ORPHELINES — une cascade manque au schema :");
  for (const [t, n] of restants) console.log(`    ${t} : ${n}`);
  await pool.end();
  process.exit(1);
}

console.log("  ✓ aucune ligne orpheline — les cascades ont tenu");

const comptesApres = Number((await q(`SELECT count(*)::int n FROM "User"`))[0].n);
console.log(`  ✓ comptes intacts : ${comptesAvant} avant, ${comptesApres} apres`);

/*
 * Le numero de facture est LIBERE, et c'est le point le moins evident.
 *
 * `rangSuivant` lit le PLUS GRAND numero de l'annee, pas le nombre de
 * factures. Effacer la facture n° 1 rend donc ce numero a la prochaine vente —
 * une serie fiscale qui commencerait a 2, avec un n° 1 correspondant a rien,
 * est le genre d'ecart qu'un comptable releve.
 */
const annee = new Date().getFullYear();
const restantes = await q(`SELECT number FROM "Invoice" WHERE number LIKE $1 ORDER BY number`, [
  `FAC-${annee}-%`,
]);
console.log(
  restantes.length === 0
    ? `  ✓ aucune facture ${annee} — la serie repart a 1`
    : `  · ${restantes.length} facture(s) ${annee} restante(s), la plus haute : ${restantes[restantes.length - 1].number}`
);

await pool.end();
console.log("");
