/**
 * Le jeu de données permet-il encore à la campagne de vouloir dire quelque chose ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  La campagne CONSOMME ce qu'elle éprouve. Chaque passage vend des        │
 * │  produits, et le stock ne se rend pas tout seul (§17 : le décompte se    │
 * │  fait au paiement).                                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le 7 septembre 2026, après plusieurs campagnes d'affilée, « Robe Wax » était
 * tombée à 1 et les autres à zéro. Deux contrôles sont tombés — `verif:etapes`
 * puis `verif:clients` —, et aucun ne disait pourquoi : l'un annonçait que
 * « l'étape 1 ne mène pas à l'étape 2 », l'autre expirait sur un menu
 * déroulant. Vingt minutes de campagne pour un diagnostic faux.
 *
 * C'est exactement ce que `verifier-latence.mjs` évite pour le réseau, et pour
 * la même raison : **un test qui échoue pour une cause étrangère à ce qu'il
 * vérifie est pire qu'aucun test.** Il envoie chercher un défaut qui n'existe
 * pas.
 *
 * Ce contrôle passe donc AVANT les autres et dit la vérité tout de suite :
 * relancer `npm run base:preparer`.
 *
 * ⚠ Il ne répare rien, et c'est délibéré. Réamorcer tout seul effacerait la
 * base sans que personne ne l'ait demandé — et le §5 rappelle que
 * `base:preparer` « efface tout d'abord ». Un script qui décide seul de vider
 * une base est un script qu'on finit par lancer contre la mauvaise.
 *
 * Usage : node scripts/verifier-prealables.mjs
 */

import { lire, lireUne, fermer } from "./base-donnees.mjs";

/**
 * Deux : c'est ce que demande `verif:etapes`, qui commande une quantité de 2
 * pour éprouver la multiplication du sous-total. Un seul article en stock ne
 * permettrait pas de distinguer « prix × quantité » de « prix ».
 */
const STOCK_MINIMAL = 2;

/** Les comptes sans lesquels la plupart des parcours ne démarrent pas. */
const COMPTES = [
  "admin@koli.ci",
  "vendeur@koli.ci",
  "vendeur2@koli.ci",
  "client@koli.ci",
  "livreur@koli.ci",
];

let problemes = 0;
const verifier = (ok, quoi, detail = "") => {
  if (!ok) problemes++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi}${detail ? ` — ${detail}` : ""}`);
};

console.log("\n=== PREALABLES DU JEU DE DONNEES ===\n");

// ── Les comptes de démonstration ───────────────────────────────────────────
const presents = await lire(
  `SELECT "email" FROM "User" WHERE "email" = ANY($1::text[])`,
  COMPTES
);
const trouves = new Set(presents.map((r) => r.email));
const manquants = COMPTES.filter((e) => !trouves.has(e));
verifier(
  manquants.length === 0,
  `les ${COMPTES.length} comptes de démonstration existent`,
  manquants.length ? `manquant(s) : ${manquants.join(", ")}` : ""
);

// ── Le catalogue ───────────────────────────────────────────────────────────
/*
 * On compte par VENDEUR, et non sur l'ensemble du catalogue.
 *
 * Le menu déroulant d'une commande ne montre que les produits du vendeur
 * connecté (§16). Un catalogue global bien fourni ne prouve donc rien si c'est
 * le vendeur de démonstration qui est à sec — et c'est précisément lui que les
 * contrôles utilisent.
 */
const parVendeur = await lire(
  `SELECT u."email",
          COUNT(*) FILTER (WHERE p."quantity" >= $1) AS "assez",
          COALESCE(MAX(p."quantity"), 0) AS "meilleur"
     FROM "User" u
     JOIN "SellerProfile" s ON s."userId" = u."id"
     LEFT JOIN "Product" p ON p."sellerId" = s."id"
    WHERE u."email" = ANY($2::text[])
    GROUP BY u."email"
    ORDER BY u."email"`,
  STOCK_MINIMAL,
  ["vendeur@koli.ci", "vendeur2@koli.ci"]
);

for (const v of parVendeur) {
  verifier(
    Number(v.assez) > 0,
    `${v.email} a un produit d'au moins ${STOCK_MINIMAL} en stock`,
    `${v.assez} produit(s) ; meilleur stock : ${v.meilleur}`
  );
}
verifier(parVendeur.length > 0, "les vendeurs de démonstration ont un profil");

// ── La commission ──────────────────────────────────────────────────────────
/*
 * Sans elle, toutes les libérations de fonds sortent à zéro de commission et
 * `verif:transactions` compare des chiffres justes à des attentes fausses.
 */
const commission = await lireUne(
  `SELECT "value" FROM "Setting" WHERE "key" = 'DEFAULT_COMMISSION_RATE'`
);
verifier(
  Boolean(commission),
  "le taux de commission est renseigné",
  commission ? `${commission.value}` : "absent"
);

await fermer();

console.log("");
if (problemes === 0) {
  console.log("Le jeu de données permet à la campagne de vouloir dire quelque chose.\n");
} else {
  console.log(
    `${problemes} prealable(s) manquant(s).\n\n` +
      `  La campagne CONSOMME ce qu'elle eprouve : chaque passage vend des\n` +
      `  produits, et le stock ne se rend pas tout seul.\n\n` +
      `      npm run base:preparer\n\n` +
      `  ⚠ Cette commande EFFACE tout et repose le jeu de demonstration (§5).\n`
  );
}

process.exit(problemes === 0 ? 0 : 1);
