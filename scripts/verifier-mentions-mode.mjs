/**
 * Aucune mention « mode test » ne doit etre ecrite en dur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  ANNONCER « aucun paiement reel n'est effectue » PENDANT QU'ON PRELEVE   │
 * │  serait la pire phrase que cette application puisse afficher.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ces mentions etaient dans une vingtaine d'ecrans, et `isTestMode()` n'etait
 * lu NULLE PART dans l'interface. La bascule vers iKeePay aurait laisse le site
 * affirmer le contraire de ce qu'il fait — sur la vitrine, dans les tableaux de
 * bord, et jusque dans les conditions d'utilisation, qui sont un document
 * juridique.
 *
 * ── Pourquoi un controle STATIQUE et non un parcours de navigateur ──────────
 *
 * Le mode de paiement est lu a la CONSTRUCTION pour les pages generees
 * statiquement. Eprouver les deux modes demanderait deux constructions
 * completes a chaque passage de la campagne — plusieurs minutes, pour une
 * regression qui se repere en lisant le code.
 *
 * Ce controle lit donc les sources : toute phrase de mode test doit se trouver
 * a portee d'une garde. Il ne prouve pas que la garde est CORRECTE ; il prouve
 * qu'il y en a une, ce qui est exactement la faute qu'on veut interdire — une
 * mention ajoutee sans y penser.
 *
 *   node scripts/verifier-mentions-mode.mjs
 */
import fs from "node:fs";
import path from "node:path";

/** Les tournures qui affirment quelque chose sur la realite de l'argent. */
const PHRASES = [
  /mode\s+test/i,
  /paiement\s+r[ée]el/i,
  /argent\s+r[ée]el/i,
  /versement\s+r[ée]el/i,
  /mouvement\s+r[ée]el/i,
  /montants?\s+(sont\s+)?simul[ée]s?/i,
];

/**
 * Ce qui compte comme garde.
 *
 * `MentionModeTest`  composant serveur : le texte n'est pas rendu du tout.
 * `data-mention-test` composant client : masque par `app/globals.css`.
 * `isTestMode` / `modeTest` conditionnel ecrit a la main.
 */
const GARDES = [/MentionModeTest/, /data-mention-test/, /isTestMode/, /modeTest/];

/**
 * Combien de lignes autour d'une mention on accepte de fouiller.
 *
 * 30 et non 14 : un bloc JSX garde peut etre long. Le sous-titre « Aucun
 * paiement reel » du menu lateral se trouve vingt-six lignes sous le
 * `data-mention-test` qui le couvre, et une fenetre trop courte le signalait a
 * tort. Un controle qui crie a tort finit par ne plus etre lu.
 */
const FENETRE = 30;

const DOSSIERS = ["app", "components"];
const EXTENSIONS = new Set([".tsx", ".ts"]);

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
 * Ce fichier-ci, `MentionModeTest.tsx` et `globals.css` parlent tous de « mode
 * test » en expliquant pourquoi. Les signaler ferait crier le controle a
 * chaque passage, et un controle qui crie a tort finit par ne plus etre lu.
 */
const estCommentaire = (l) => /^\s*(\/\/|\/\*|\*|\{\/\*)/.test(l);

/**
 * Suit l'etat « dans un bloc de commentaire » d'une ligne a l'autre.
 *
 * Un commentaire JSX de plusieurs lignes ne commence pas chaque ligne par une
 * etoile : la deuxieme ligne est du texte nu. Deux faux positifs ont ete
 * releves pour cette raison exacte — des explications parlant du mode test,
 * signalees comme si elles s'affichaient.
 */
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
let examines = 0;

console.log("\n=== MENTIONS DU MODE DE PAIEMENT ===\n");

for (const racine of DOSSIERS) {
  for (const fichier of fichiers(racine)) {
    const lignes = fs.readFileSync(fichier, "utf8").split(/\r?\n/);
    const commentaire = marquerCommentaires(lignes);

    for (let i = 0; i < lignes.length; i++) {
      const ligne = lignes[i];
      if (commentaire[i]) continue;
      if (!PHRASES.some((p) => p.test(ligne))) continue;

      examines++;

      const debut = Math.max(0, i - FENETRE);
      const fin = Math.min(lignes.length, i + FENETRE + 1);
      const autour = lignes.slice(debut, fin).join("\n");

      if (!GARDES.some((g) => g.test(autour))) {
        problemes++;
        console.log(`  ✗ ${fichier}:${i + 1}`);
        console.log(`    ${ligne.trim().slice(0, 100)}`);
      }
    }
  }
}

console.log("");
if (problemes === 0) {
  console.log(
    `Les ${examines} mentions du mode test sont toutes sous garde : aucune ne ` +
      `survivrait au passage en paiement reel.\n`
  );
} else {
  console.log(
    `${problemes} mention(s) ecrite(s) en dur, sur ${examines} examinees.\n\n` +
      `  Composant SERVEUR : entourer de <MentionModeTest>…</MentionModeTest>\n` +
      `  Composant CLIENT  : poser data-mention-test sur l'element\n` +
      `  Phrase qui doit CHANGER plutot que disparaitre : lire isTestMode()\n`
  );
}

process.exit(problemes === 0 ? 0 : 1);
