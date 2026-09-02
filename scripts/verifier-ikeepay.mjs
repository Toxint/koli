/**
 * Avant d'encaisser pour de vrai : la configuration tient-elle ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  iKeePay n'a PAS de bac a sable pour l'encaissement.                      │
 * │  Basculer sur `ikeepay`, c'est prelever de l'argent reel, tout de suite.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Il n'y a donc pas de repetition possible chez eux : le premier essai est un
 * vrai paiement, avec un vrai debit. Ce script est ce qui remplace le bac a
 * sable — il verifie tout ce qui peut l'etre AVANT que l'argent ne parte, et
 * il refuse de dire « pret » si quoi que ce soit manque.
 *
 * Le controle le plus important est le dernier, et c'est celui auquel on ne
 * pense pas : **l'adresse de rappel doit etre joignable depuis l'exterieur**.
 * Sur `localhost`, iKeePay encaisse, poste son rappel dans le vide, et la
 * commande reste « en attente de paiement » pour toujours — le client est
 * debite, le vendeur ne voit rien. Et comme ils n'exposent aucun point
 * d'entree de consultation, le rattrapage ne peut pas le sauver : c'est une
 * perte seche, a reparer a la main dans leur tableau de bord.
 *
 * Usage :
 *   npm run ikeepay:verifier
 *   npm run ikeepay:verifier -- --avec-jeton   (revele l'adresse de rappel entiere)
 */

import { chargerEnv } from "./env.mjs";

chargerEnv();

const revelerJeton = process.argv.includes("--avec-jeton");

let bloquants = 0;
let avertissements = 0;

const ok = (libelle, detail = "") =>
  console.log(`  ✓ ${libelle}${detail ? ` — ${detail}` : ""}`);

const bloquant = (libelle, detail) => {
  bloquants++;
  console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
};

const avertir = (libelle, detail) => {
  avertissements++;
  console.log(`  ⚠ ${libelle}${detail ? ` — ${detail}` : ""}`);
};

/**
 * Montre qu'une valeur est la, sans la montrer.
 *
 * Cette sortie finit dans un historique de terminal, une capture d'ecran, un
 * message. Une clef secrete affichee en entier par un script de diagnostic est
 * une clef qui fuit sans que personne ne l'ait decide.
 */
const masquer = (v) =>
  v.length <= 8 ? "•".repeat(v.length) : `${v.slice(0, 4)}…${"•".repeat(6)} (${v.length} car.)`;

const lire = (nom) => process.env[nom]?.trim() ?? "";

console.log("\n=== CONFIGURATION iKeePay ===\n");

// ─────────────────────────────────────────────── 1. Le mode
const mode = (lire("PAYMENT_MODE") || "test").toLowerCase();

if (mode === "test") {
  console.log("  MODE : test — aucun argent ne circule.\n");
  console.log("  Ce script verifie quand meme la configuration, pour que le");
  console.log("  jour de la bascule ne soit pas le jour de la decouverte.\n");
} else if (mode === "ikeepay") {
  console.log("  MODE : ikeepay — ⚠ L'ARGENT EST REEL.\n");
} else {
  bloquant("PAYMENT_MODE est une valeur connue", `"${mode}" — attendu : test ou ikeepay`);
}

// ─────────────────────────────────────────────── 2. Les clefs
for (const nom of ["IKEEPAY_PUBLIC_KEY", "IKEEPAY_SECRET_KEY"]) {
  const v = lire(nom);
  if (!v) bloquant(`${nom} est renseigne`, "absent");
  else ok(nom, masquer(v));
}

// ─────────────────────────────────────────────── 3. Le jeton de rappel
const jeton = lire("IKEEPAY_WEBHOOK_TOKEN");

if (!jeton) {
  bloquant(
    "IKEEPAY_WEBHOOK_TOKEN est renseigne",
    "absent — c'est la SEULE preuve d'origine des rappels, ils ne les signent pas"
  );
} else if (jeton.length < 32) {
  bloquant(
    "IKEEPAY_WEBHOOK_TOKEN fait au moins 32 caracteres",
    `${jeton.length} — se devine ; npm run secrets:generer`
  );
} else {
  ok("IKEEPAY_WEBHOOK_TOKEN", masquer(jeton));
}

// ─────────────────────────────────────────────── 4. Les adresses chez eux
for (const [nom, defaut] of [
  ["IKEEPAY_CHECKOUT_URL", "https://ikeepay.com/checkout/v1/inline"],
  ["IKEEPAY_API_URL", "https://api.ikeepay.com"],
]) {
  const v = lire(nom) || defaut;
  const declare = lire(nom) ? "" : "valeur par defaut";
  if (!v.startsWith("https://")) {
    bloquant(`${nom} est en https`, v);
  } else {
    ok(nom, `${v}${declare ? ` (${declare})` : ""}`);
  }
}

// ─────────────────────────────────────────────── 5. Les secrets voisins
const authSecret = lire("AUTH_SECRET");
if (!authSecret) {
  bloquant("AUTH_SECRET est renseigne", "absent — l'application refusera de demarrer");
} else if (/^koli-dev|dev|change|secret$/i.test(authSecret) || authSecret.length < 32) {
  avertir(
    "AUTH_SECRET est tire au sort",
    `"${authSecret.slice(0, 12)}…" — devinable ; il signe les sessions ADMINISTRATEUR`
  );
} else {
  ok("AUTH_SECRET", masquer(authSecret));
}

const cron = lire("CRON_SECRET");
if (!cron) {
  avertir(
    "CRON_SECRET est renseigne",
    "absent — /api/paiements/rapprochement repondra 503 et les paiements abandonnes ne se fermeront jamais"
  );
} else {
  ok("CRON_SECRET", masquer(cron));
}

// ─────────────────────────────────────────────── 6. L'adresse de rappel
console.log("");

const app = lire("NEXT_PUBLIC_APP_URL");

if (!app) {
  bloquant("NEXT_PUBLIC_APP_URL est renseigne", "absent");
} else {
  let hote = "";
  try {
    hote = new URL(app).hostname;
  } catch {
    bloquant("NEXT_PUBLIC_APP_URL est une adresse valide", app);
  }

  const prive =
    /^(localhost|127\.|0\.0\.0\.0|\[?::1\]?)/.test(hote) ||
    /^10\./.test(hote) ||
    /^192\.168\./.test(hote) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hote);

  if (hote && prive) {
    bloquant(
      "NEXT_PUBLIC_APP_URL est joignable depuis l'exterieur",
      `${hote} est une adresse PRIVEE — iKeePay ne pourra pas y poster son rappel`
    );
    console.log("");
    console.log("    Le paiement aboutirait chez eux et la commande resterait");
    console.log("    « en attente » chez nous, indefiniment. Sans point d'entree");
    console.log("    de consultation, le rattrapage ne peut PAS le reparer.");
    console.log("");
    console.log("    Il faut une adresse publique : un deploiement Vercel");
    console.log("    (`vercel deploy` — un apercu suffit) ou un tunnel.");
  } else if (hote) {
    ok("NEXT_PUBLIC_APP_URL", app);
  }

  if (hote && !prive && jeton) {
    const adresse = `${app.replace(/\/+$/, "")}/api/paiements/rappel?jeton=${
      revelerJeton ? jeton : "…"
    }`;
    console.log("");
    console.log("  ── A DECLARER DANS LE TABLEAU DE BORD iKeePay ──");
    console.log("");
    console.log(`     ${adresse}`);
    console.log("");
    if (!revelerJeton) {
      console.log("     (jeton masque — `npm run ikeepay:verifier -- --avec-jeton`");
      console.log("      pour l'adresse entiere, mais elle contient un secret :");
      console.log("      ne la collez pas ailleurs que chez eux.)");
    }
  }
}

// ─────────────────────────────────────────────── Verdict
console.log("");

if (bloquants > 0) {
  console.log(
    `${bloquants} point(s) bloquant(s)${
      avertissements ? ` et ${avertissements} avertissement(s)` : ""
    }. NE PAS basculer sur ikeepay.`
  );
  process.exit(1);
}

if (avertissements > 0) {
  console.log(
    `Configuration utilisable, ${avertissements} avertissement(s) — a lever avant la production.`
  );
} else {
  console.log("Configuration complete.");
}

if (mode === "test") {
  console.log("");
  console.log("Le mode reste `test`. Pour essayer pour de vrai :");
  console.log("  1. PAYMENT_MODE=ikeepay dans .env.local");
  console.log("  2. npm run build   (le mode est lu a la CONSTRUCTION)");
  console.log("  3. le plus petit montant possible — l'argent est reel.");
}

console.log("");
process.exit(0);
