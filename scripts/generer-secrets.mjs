/**
 * Tire au sort les secrets que l'application refuse de deviner.
 *
 * Trois valeurs, trois raisons distinctes, et aucune ne doit etre choisie a la
 * main :
 *
 *   AUTH_SECRET           signe les jetons de session. Devinable = n'importe
 *                         qui forge la session de n'importe quel compte,
 *                         administrateur compris.
 *   CRON_SECRET           ouvre /api/paiements/rapprochement, qui ECRIT sur des
 *                         paiements. Devinable = une porte, pas une tache.
 *   IKEEPAY_WEBHOOK_TOKEN la SEULE chose qui distingue un rappel d'iKeePay d'un
 *                         rappel forge — ils ne signent pas les leurs. Devinable
 *                         = l'acheteur marque sa commande payee sans payer.
 *
 * `koli-dev-...` n'est pas un tirage. C'est ce que vaut encore `AUTH_SECRET`
 * dans `.env`, et c'est pour cela que ce script existe.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Il n'ECRIT nulle part, deliberement.                                     │
 * │                                                                           │
 * │  Ecrire dans `.env` reviendrait a invalider toutes les sessions ouvertes  │
 * │  sans prevenir, et a poser un secret de production dans un fichier local. │
 * │  On copie, on colle la ou il faut — Vercel pour la production.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Usage :
 *   npm run secrets:generer
 */

import { randomBytes } from "node:crypto";

/**
 * 32 octets, en base64url.
 *
 * base64url et non hexadecimal : meme resistance pour 22 caracteres au lieu de
 * 64, et surtout aucun caractere qui demande d'etre echappe dans une adresse —
 * le jeton de rappel voyage dans une URL.
 */
const tirer = () => randomBytes(32).toString("base64url");

const valeurs = [
  ["AUTH_SECRET", tirer(), "signe les sessions"],
  ["CRON_SECRET", tirer(), "ouvre le rattrapage des paiements"],
  ["IKEEPAY_WEBHOOK_TOKEN", tirer(), "authentifie les rappels iKeePay"],
];

console.log("\n=== SECRETS TIRES AU SORT ===\n");
console.log("  Ils ne sont enregistres NULLE PART. Copiez-les maintenant.\n");

for (const [nom, valeur, role] of valeurs) {
  console.log(`  # ${role}`);
  console.log(`  ${nom}=${valeur}\n`);
}

console.log("  Ou les poser :");
console.log("    - essai local   → .env.local  (jamais commite)");
console.log("    - production    → Vercel, Settings › Environment Variables\n");
console.log("  ⚠ Changer AUTH_SECRET deconnecte TOUT LE MONDE : les sessions");
console.log("    en cours ont ete signees avec l'ancien.");
console.log("  ⚠ Changer IKEEPAY_WEBHOOK_TOKEN oblige a mettre a jour l'adresse");
console.log("    de rappel dans le tableau de bord iKeePay, qui la contient.\n");
