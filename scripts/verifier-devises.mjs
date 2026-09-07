/**
 * Aucun nom de monnaie ne doit etre ecrit en dur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  AFFICHER « 796 FCFA » POUR UNE COMMANDE EN FRANCS CONGOLAIS n'est pas   │
 * │  une imprecision : c'est un chiffre faux d'un facteur quatre, sur une    │
 * │  application dont le sujet est la confiance entre deux inconnus.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * KOLI dessert 17 pays et 12 monnaies. « FCFA » etait ecrit en dur dans une
 * trentaine d'endroits, et le balayage du 6 septembre 2026 en a laisse tomber
 * trois d'un genre particulier — les plus graves, et les moins visibles :
 *
 *   · le JOURNAL D'AUDIT, ou l'on relit les montants pour rapprocher les
 *     ecritures : une unite fausse y vaut un chiffre faux ;
 *   · les vignettes de la PAGE D'ACCUEIL publique, ou un vendeur de Kinshasa
 *     s'affichait comme ayant recu des francs CFA ;
 *   · les ETIQUETTES des formulaires, ou le vendeur saisit un prix en croyant
 *     saisir une autre monnaie que la sienne.
 *
 * Aucun ecran ne montrait d'erreur. C'est precisement ce qui rend un controle
 * necessaire : ce defaut-la ne se signale pas, il se lit.
 *
 * ── Pourquoi un controle STATIQUE ───────────────────────────────────────────
 *
 * L'eprouver dans un navigateur demanderait un compte vendeur par monnaie, donc
 * douze parcours complets a chaque passage de la campagne. Et cela ne
 * couvrirait toujours pas le journal d'audit, qui n'est un ecran pour personne.
 *
 * Ce controle lit donc les sources. Il ne prouve pas que la monnaie affichee
 * est la BONNE — `verif:parcours` et `verif:transactions` s'en chargent ; il
 * prouve qu'aucune n'est ECRITE EN DUR, ce qui est exactement la faute qu'on
 * veut interdire : un « FCFA » ajoute sans y penser, dans un pays qui n'en
 * utilise pas.
 *
 *   node scripts/verifier-devises.mjs
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Les symboles des douze monnaies desservies.
 *
 * Tires de `SYMBOLE` dans `data/markets.ts`, et volontairement RECOPIES ici :
 * les importer ferait dependre le controle du fichier qu'il surveille, et un
 * symbole retire la-bas cesserait d'etre cherche ici sans que rien ne le dise.
 */
const SYMBOLES = [
  "FCFA",
  "GH₵",
  "₦",
  "KSh",
  "TSh",
  "USh",
  "FRw",
  "RM", // ringgit — jamais desservi, mais present dans les copier-coller
  "Le",
  "FC",
  "MAD",
  "DH",
];

/**
 * Ce qui se cherche vraiment : un symbole COLLE A UN AFFICHAGE.
 *
 * Chercher « FC » nu signalerait « FCFA », « FComplet », et la moitie des
 * identifiants du projet. On ne retient donc que les tournures ou le symbole
 * sert d'unite a un montant :
 *
 *   `${x} FCFA`   "1 000 FCFA"   (FCFA)   FCFA»
 *
 * Un controle qui crie a tort finit par ne plus etre lu — c'est ecrit dans
 * `verifier-mentions-mode.mjs`, et cela a coute deux faux positifs la-bas.
 */
const MOTIFS = SYMBOLES.map(
  (s) =>
    new RegExp(
      // precede d'un chiffre, d'une accolade fermante de gabarit, ou ouvrant
      // une parenthese d'etiquette
      `(\\}|\\d|\\()\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`,
      ""
    )
);

const DOSSIERS = ["app", "components", "lib"];
const EXTENSIONS = new Set([".tsx", ".ts"]);

/**
 * Ce qui a le DROIT de nommer une monnaie.
 *
 * `data/markets.ts` porte la table des symboles — c'est sa raison d'etre, et
 * elle n'est pas dans les dossiers balayes. Les tests posent des montants
 * attendus, en francs CFA parce que le jeu de demonstration est ivoirien : les
 * signaler reviendrait a interdire d'ecrire un montant dans un test.
 */
const EPARGNES = [/[\\/]__tests__[\\/]/, /[\\/]markets\.ts$/];

function* fichiers(racine) {
  for (const e of fs.readdirSync(racine, { withFileTypes: true })) {
    const p = path.join(racine, e.name);
    if (e.isDirectory()) yield* fichiers(p);
    else if (EXTENSIONS.has(path.extname(e.name))) yield p;
  }
}

/**
 * Une ligne de COMMENTAIRE ne s'affiche pas.
 *
 * Ce fichier, `markets.ts` et une dizaine d'autres expliquent le probleme en
 * citant « FCFA ». Les signaler ferait crier le controle a chaque passage.
 *
 * Le suivi d'un bloc `/* … *​/` d'une ligne a l'autre est repris de
 * `verifier-mentions-mode.mjs`, ou son absence avait produit deux faux
 * positifs : la deuxieme ligne d'un commentaire JSX ne commence par rien.
 */
const estCommentaire = (l) => /^\s*(\/\/|\/\*|\*|\{\/\*)/.test(l);

function marquerCommentaires(lignes) {
  let dedans = false;
  return lignes.map((l) => {
    const etait = dedans;
    const ouvre = l.lastIndexOf("/*");
    const ferme = l.lastIndexOf("*/");
    if (ouvre > -1 && ouvre > ferme) dedans = true;
    else if (ferme > -1 && ferme > ouvre) dedans = false;
    return etait || dedans || estCommentaire(l);
  });
}

let problemes = 0;
let lus = 0;

console.log("\n=== NOMS DE MONNAIE ECRITS EN DUR ===\n");

for (const racine of DOSSIERS) {
  for (const fichier of fichiers(racine)) {
    if (EPARGNES.some((e) => e.test(fichier))) continue;

    const lignes = fs.readFileSync(fichier, "utf8").split(/\r?\n/);
    const commentaire = marquerCommentaires(lignes);
    lus++;

    for (let i = 0; i < lignes.length; i++) {
      if (commentaire[i]) continue;
      const ligne = lignes[i];
      if (!MOTIFS.some((m) => m.test(ligne))) continue;

      problemes++;
      console.log(`  ✗ ${fichier}:${i + 1}`);
      console.log(`    ${ligne.trim().slice(0, 100)}`);
    }
  }
}

console.log("");
if (problemes === 0) {
  console.log(
    `Aucune monnaie ecrite en dur dans les ${lus} fichiers de app/, ` +
      `components/ et lib/.\n\n` +
      `  Un montant s'ecrit formatMontant(valeur, devise).\n` +
      `  Une etiquette porte SYMBOLE[devise].\n` +
      `  La devise d'un vendeur se lit deviseDuVendeur(profil.country).\n`
  );
} else {
  console.log(
    `${problemes} monnaie(s) ecrite(s) en dur.\n\n` +
      `  Un vendeur de Kinshasa lirait des francs CFA pour ses francs\n` +
      `  congolais — quatre fois plus, sans qu'aucun ecran ne le signale.\n\n` +
      `  Montant   : formatMontant(valeur, devise)\n` +
      `  Etiquette : SYMBOLE[devise]\n` +
      `  Devise    : deviseDuVendeur(profil.country), ou commeDevise(ligne.currency)\n`
  );
}

process.exit(problemes === 0 ? 0 : 1);
