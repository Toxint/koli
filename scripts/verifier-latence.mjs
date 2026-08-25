/**
 * La base repond-elle assez vite pour que la campagne veuille dire quelque chose ?
 *
 * Ce controle existe a cause d'une demi-journee perdue. Sur une liaison
 * degradee — VPN, partage de connexion mobile —, l'aller-retour vers Supabase
 * est passe de quelques dizaines de millisecondes a 727. Les pages du produit
 * enchainent une dizaine de requetes : la page de paiement, qui se rend
 * normalement en une demi-seconde, mettait vingt-six secondes.
 *
 * Les scripts de bout en bout ont alors rapporte des defauts imaginaires — un
 * paiement « qui n'aboutit pas », des notifications « jamais ecrites » — alors
 * que l'application etait parfaitement saine. Un test qui echoue pour une
 * raison etrangere a ce qu'il verifie est pire qu'aucun test : il envoie
 * chercher un defaut qui n'existe pas.
 *
 * Ce controle passe donc AVANT les autres, et dit la verite tout de suite.
 *
 * Usage : node scripts/verifier-latence.mjs
 */

import { mesurerLatence, fermer } from "./base-donnees.mjs";

// Repere : une page du produit fait une dizaine de requetes. A 60 ms elle se
// rend en moins d'une seconde ; a 250 ms elle depasse deux secondes et demie,
// ce qui reste vivable ; au-dela, les delais d'attente des scripts expirent et
// leurs verdicts ne veulent plus rien dire.
const CONFORTABLE = 60;
const LIMITE = 250;

const REQUETES_PAR_PAGE = 13;

console.log("\n=== LATENCE DE LA BASE ===\n");

const ms = await mesurerLatence();
await fermer();

const page = ((ms * REQUETES_PAR_PAGE) / 1000).toFixed(1);
console.log(`  aller-retour moyen : ${ms} ms`);
console.log(`  une page du produit (~${REQUETES_PAR_PAGE} requetes) : environ ${page} s`);
console.log("");

if (ms <= CONFORTABLE) {
  console.log("La base repond vite : la campagne est exploitable.");
  process.exit(0);
}

if (ms <= LIMITE) {
  console.log(
    `La base repond lentement (${ms} ms). La campagne reste exploitable,\n` +
      "mais attendez-vous a des pages lourdes et a des tests plus longs."
  );
  process.exit(0);
}

console.error(
  `La base repond en ${ms} ms par aller-retour, soit ${page} s par page.\n\n` +
    "   La campagne est ARRETEE ICI, volontairement : a cette latence, les\n" +
    "   scripts de bout en bout expirent et rapportent des defauts qui\n" +
    "   n'existent pas. Le probleme est le CHEMIN RESEAU, pas le code.\n\n" +
    "   A verifier, dans cet ordre :\n" +
    "     - un VPN actif (il deroute le trafic par un autre continent) ;\n" +
    "     - un partage de connexion mobile ;\n" +
    "     - la region du projet Supabase, loin de vous.\n\n" +
    "   Pour passer outre en connaissance de cause : LATENCE_TOLEREE=1"
);

process.exit(process.env.LATENCE_TOLEREE ? 0 : 1);
