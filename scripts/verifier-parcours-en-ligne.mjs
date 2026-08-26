/**
 * Le parcours complet du §80, contre le SITE DEPLOYE et la base SUPABASE.
 *
 * Pourquoi un lanceur separe plutot qu une variable a la main : les scripts de
 * verification lisent `.env.local`, qui designe la base LOCALE. Lances tels
 * quels contre le site en ligne, ils piloteraient le vrai site tout en
 * interrogeant une autre base — et rapporteraient « la commande n a pas ete
 * creee » alors qu elle l aurait ete, ailleurs. Un controle qui inspecte une
 * base differente de celle qui sert est pire qu aucun controle.
 *
 * Ce lanceur impose donc les deux adresses de `.env` (Supabase) AVANT
 * d appeler le parcours, et les variables ainsi posees l emportent sur les
 * fichiers.
 *
 * Ce qu il faut savoir avant de le lancer :
 *
 *   - il ECRIT dans la base de production : un produit, une commande, un
 *     paiement simule, une livraison. En mode test, aucun argent ne circule ;
 *     les traces restent, comme celles du jeu de demonstration ;
 *   - depuis une liaison degradee, chaque lecture de controle coute pres d une
 *     seconde. Les attentes du parcours, elles, portent sur le NAVIGATEUR, qui
 *     parle a Vercel et reste rapide : elles ne sont donc pas menacees. Le
 *     parcours est simplement plus long.
 *
 * Usage : node scripts/verifier-parcours-en-ligne.mjs [adresse]
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { chargerEnv } from "./env.mjs";

const COMPTES = ".donnees/comptes-supabase.txt";

/**
 * Les mots de passe des comptes en ligne, un par role.
 *
 * Ils ont ete tires au sort par `supabase:securiser` : `Password123!` ne
 * fonctionne plus en ligne, et c est voulu — un compte administrateur au mot
 * de passe publie dans le depot est une porte ouverte. Le parcours doit donc
 * les recevoir, sinon il echoue des la premiere connexion sur une erreur qui
 * ne dit pas que le mot de passe est en cause.
 */
function motsDePasse() {
  if (!fs.existsSync(COMPTES)) return {};

  const par = {};
  for (const ligne of fs.readFileSync(COMPTES, "utf8").split(/\r?\n/)) {
    // `\s*` en tete : le fichier indente son tableau recapitulatif, et une
    // lecture trop stricte n'y trouvait plus rien — en annoncant « mots de
    // passe introuvables » sur un fichier qui les contenait pourtant.
    const m = ligne.match(/^\s*(\S+)\s+(\S+@\S+)\s+(\S+)\s*$/);
    if (m) par[m[2]] = m[3];
  }
  return par;
}

const BASE = process.argv[2] ?? "https://koli-zeta.vercel.app";

// `.env` SEUL : c est lui qui porte Supabase. Lire `.env.local` ici ferait
// exactement l erreur que ce fichier existe pour empecher.
chargerEnv(".env");

const POOLER = process.env.DATABASE_URL ?? "";

if (!POOLER.startsWith("postgresql://") || /localhost|127\.0\.0\.1/.test(POOLER)) {
  console.error(
    "   ✗ DATABASE_URL de .env ne designe pas la base Supabase.\n\n" +
      "   Ce controle doit interroger la base que le site en ligne utilise."
  );
  process.exit(1);
}

const mdp = motsDePasse();

if (!mdp["vendeur@koli.ci"]) {
  console.error(
    `   ✗ Mots de passe introuvables dans ${COMPTES}.\n\n` +
      "   Ceux des comptes en ligne ont ete tires au sort : sans eux, le\n" +
      "   parcours echoue des la connexion. Relancez `npm run supabase:securiser`."
  );
  process.exit(1);
}

console.log(`\n=== PARCOURS COMPLET (§80) — ${BASE} ===`);
console.log(`    base : ${POOLER.replace(/:[^:@]+@/, ":****@").slice(0, 60)}…\n`);

const r = spawnSync(
  process.execPath,
  ["scripts/test-parcours-complet.mjs"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      BASE_URL: BASE,
      DATABASE_URL: POOLER,
      DIRECT_URL: process.env.DIRECT_URL ?? POOLER,
      MDP_VENDEUR: mdp["vendeur@koli.ci"],
      MDP_CLIENT: mdp["client@koli.ci"],
      MDP_LIVREUR: mdp["livreur@koli.ci"],
    },
  }
);

process.exit(r.status ?? 1);
