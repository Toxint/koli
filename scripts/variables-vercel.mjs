/**
 * Prepare les variables d environnement a coller dans Vercel.
 *
 * Elles sont ecrites dans un FICHIER ignore par git, pas affichees a l ecran :
 * une sortie de terminal se retrouve dans un historique, une capture, un
 * copier-coller. Le fichier se lit, se recopie dans le tableau de bord de
 * l hebergeur, puis se supprime.
 *
 * Trois choix sont faits ici, et chacun evite une panne :
 *
 *   - `AUTH_SECRET` est TIRE AU SORT, different de celui du poste. Deux
 *     environnements ne partagent pas un secret de session ; et celui du poste
 *     a vocation a etre lu par quiconque ouvre le projet.
 *   - `KYC_STORAGE_DIR` est volontairement ABSENT. Il ferait ecrire les pieces
 *     d identite sur le disque de l hebergeur, qui est ephemere : elles
 *     disparaitraient au deploiement suivant, sans erreur et sans trace.
 *   - `RACCOURCIS_DEMO` est volontairement ABSENT. Il afficherait sur la page
 *     de connexion l adresse du compte administrateur et le mot de passe commun.
 *
 * Usage : node scripts/variables-vercel.mjs
 */

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chargerEnv } from "./env.mjs";

// `.env` SEUL : c est lui qui porte les adresses Supabase. `.env.local`
// designe la base locale, qui n a rien a faire sur l hebergeur.
chargerEnv(".env");

const SORTIE = path.join(".donnees", "variables-vercel.txt");

const ok = (m) => console.log(`   ✓ ${m}`);
const alerte = (m) => console.log(`   ! ${m}`);

console.log("\n=== VARIABLES POUR L HEBERGEUR ===\n");

/** Ce que Vercel doit connaitre, et ce qui se passe si ca manque. */
const ATTENDUES = [
  ["DATABASE_URL", true, "adresse du pooler Supabase (port 6543)"],
  ["AUTH_SECRET", true, "signe les jetons de session — tire au sort ci-dessous"],
  ["NEXT_PUBLIC_APP_URL", true, "a completer APRES le premier deploiement"],
  ["PAYMENT_MODE", true, "doit valoir « test » (§1, §84)"],
  ["SUPABASE_URL", true, "stockage des pieces KYC"],
  ["SUPABASE_SERVICE_ROLE_KEY", true, "idem — clef secrete, jamais NEXT_PUBLIC_"],
  ["GOOGLE_CLIENT_ID", false, "sans lui, le bouton Google ne s affiche pas"],
  ["GOOGLE_CLIENT_SECRET", false, "idem"],
];

const lignes = [];
const manquantes = [];

for (const [nom, obligatoire, role] of ATTENDUES) {
  if (nom === "AUTH_SECRET") {
    // Tire au sort ICI, jamais recopie depuis le poste.
    lignes.push(`AUTH_SECRET=${randomBytes(32).toString("base64")}`);
    ok(`${nom} — tire au sort pour la production`);
    continue;
  }

  if (nom === "NEXT_PUBLIC_APP_URL") {
    lignes.push("NEXT_PUBLIC_APP_URL=https://<a-completer>.vercel.app");
    alerte(`${nom} — a completer une fois l adresse connue`);
    continue;
  }

  const valeur = process.env[nom];

  if (!valeur) {
    if (obligatoire) manquantes.push(`${nom} — ${role}`);
    else alerte(`${nom} absent — ${role}`);
    continue;
  }

  lignes.push(`${nom}=${valeur}`);
  ok(`${nom} — repris de .env`);
}

if (manquantes.length > 0) {
  console.error("\n   ✗ Variables OBLIGATOIRES absentes de .env :");
  for (const m of manquantes) console.error(`     - ${m}`);
  process.exitCode = 1;
}

fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
fs.writeFileSync(
  SORTIE,
  [
    "Variables d environnement — Vercel",
    `Genere le ${new Date().toISOString()}`,
    "",
    "A coller dans Project Settings > Environment Variables.",
    "Ce fichier est ignore par git. Supprimez-le une fois les valeurs saisies.",
    "",
    "NE PAS AJOUTER :",
    "  KYC_STORAGE_DIR  — ferait ecrire les pieces d identite sur un disque",
    "                     ephemere ; elles disparaitraient au deploiement suivant",
    "  RACCOURCIS_DEMO  — afficherait l adresse du compte administrateur et le",
    "                     mot de passe commun sur la page de connexion",
    "",
    "REGION : choisir Dublin (dub1), a cote du projet Supabase. Une page fait",
    "une dizaine de requetes : a 5 ms elle se rend en une fraction de seconde,",
    "a 100 ms elle depasse la seconde.",
    "",
    "─────────────────────────────────────────────────────────",
    "",
    ...lignes,
    "",
  ].join("\n"),
  { encoding: "utf8", mode: 0o600 }
);

console.log(`\n   Les valeurs sont dans : ${SORTIE}`);
console.log("   Elles ne sont pas affichees ici : une sortie de terminal se");
console.log("   retrouve dans un historique ou une capture.\n");
