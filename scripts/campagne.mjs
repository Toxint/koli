/**
 * La campagne de vérification, capable de traverser une COUPURE RÉSEAU.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Le VPN de ce poste (Proton, obligatoire) renégocie son tunnel toutes    │
 * │  les une à trois minutes. Chromium annule alors ses requêtes en cours,   │
 * │  MÊME vers localhost : `net::ERR_NETWORK_CHANGED`.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Relevé le 13 septembre 2026 dans le journal Windows : six changements
 * d'état du réseau en cinq minutes. Une campagne de vingt-cinq minutes en
 * croise forcément plusieurs. Deux campagnes d'affilée sont mortes ainsi —
 * `verif:connexion` sur `ERR_NETWORK_IO_SUSPENDED`, `verif:responsive` sur
 * `ERR_NETWORK_CHANGED` — avec 44 et 58 contrôles verts, zéro échec, et un
 * verdict impossible.
 *
 * ── Ce qui est repris, et ce qui ne l'est JAMAIS ────────────────────────────
 *
 * Une suite n'est relancée que si sa sortie porte la SIGNATURE d'une coupure
 * réseau de Chromium. Un vrai échec — un `✗`, une erreur de code, un délai
 * dépassé — arrête la campagne comme avant.
 *
 * ⚠ Ce n'est pas « relancer jusqu'à ce que ça passe ». C'est la faute que ce
 * projet refuse partout ailleurs : un contrôle qu'on rejoue jusqu'au vert ne
 * protège rien. La règle est donc étroite, bornée à DEUX reprises par suite, et
 * chaque reprise est ANNONCÉE avec sa cause — un verdict obtenu à la troisième
 * tentative doit se lire comme tel.
 *
 * ⚠ Si une suite porte à la fois des `✗` ET une coupure réseau, elle n'est PAS
 * reprise : ses échecs ont eu lieu avant la coupure, et les effacer par une
 * seconde exécution serait exactement le mensonge décrit ci-dessus.
 *
 * La liste des suites vit dans `package.json` (`verif:chaine`) : une seule
 * source, pour que ce fichier ne puisse pas oublier une suite qu'on ajoute.
 *
 * Usage :
 *   npm run verif:tout
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const COUPURE =
  /net::ERR_(NETWORK_CHANGED|NETWORK_IO_SUSPENDED|INTERNET_DISCONNECTED|ADDRESS_UNREACHABLE|NETWORK_ACCESS_DENIED)/;
const REPRISES_MAX = 2;

const chaine =
  process.env.KOLI_CAMPAGNE_CHAINE ??
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts[
    "verif:chaine"
  ];
if (!chaine) {
  console.error("verif:chaine est absent de package.json : la campagne ne sait pas quoi lancer.");
  process.exit(1);
}

const suites = chaine
  .split("&&")
  .map((s) => s.trim())
  .filter(Boolean);

/** Lance une commande, relaie sa sortie en direct, et en garde la fin. */
const lancer = (commande) =>
  new Promise((resolve) => {
    let fin = "";
    const garder = (b) => {
      const t = b.toString();
      fin = (fin + t).slice(-200_000);
      return t;
    };
    const p = spawn(commande, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
    p.stdout.on("data", (b) => process.stdout.write(garder(b)));
    p.stderr.on("data", (b) => process.stderr.write(garder(b)));
    p.on("close", (code) => resolve({ code: code ?? 1, sortie: fin }));
  });

const reprises = [];

for (const suite of suites) {
  for (let essai = 0; ; essai++) {
    const { code, sortie } = await lancer(suite);
    if (code === 0) break;

    const coupure = sortie.match(COUPURE);
    const vraisEchecs = /✗/.test(sortie);

    if (coupure && !vraisEchecs && essai < REPRISES_MAX) {
      const motif = `net::ERR_${coupure[1]}`;
      reprises.push(`${suite} — ${motif}`);
      console.log(
        `\n⟲ REPRISE ${essai + 1}/${REPRISES_MAX} de « ${suite} » : coupure réseau (${motif}), aucun échec de contrôle avant elle.\n`
      );
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    console.log(
      coupure && vraisEchecs
        ? `\n✗ CAMPAGNE ARRÊTÉE sur « ${suite} » : de VRAIS échecs précèdent la coupure réseau — non repris.`
        : coupure
          ? `\n✗ CAMPAGNE ARRÊTÉE sur « ${suite} » : coupée par le réseau ${REPRISES_MAX + 1} fois de suite.`
          : `\n✗ CAMPAGNE ARRÊTÉE sur « ${suite} » (code ${code}).`
    );
    if (reprises.length) console.log(`  reprises effectuées avant l'arrêt : ${reprises.join(" | ")}`);
    process.exit(code || 1);
  }
}

console.log(`\n✓ CAMPAGNE COMPLÈTE : ${suites.length} étapes.`);
console.log(
  reprises.length
    ? `  ⚠ ${reprises.length} reprise(s) après coupure réseau : ${reprises.join(" | ")}`
    : "  aucune reprise : aucune coupure réseau pendant la campagne."
);
