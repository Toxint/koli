/**
 * Prepare le magasin de pieces justificatives sur Supabase Storage (§37).
 *
 * Cree le seau s il n existe pas, et surtout VERIFIE qu il est prive. Un seau
 * public rend chaque objet lisible par quiconque devine son adresse : c est la
 * meme faute que deposer une carte d identite sous `public/`, avec la meme
 * consequence — une fuite de pieces d identite que rien ne signale.
 *
 * Idempotent : peut etre relance sans risque.
 *
 * Usage : node scripts/preparer-stockage.mjs
 */

import { chargerEnv } from "./env.mjs";

chargerEnv(".env");

const ok = (m) => console.log(`   ✓ ${m}`);
const arreter = (m, aide = "") => {
  console.error(`   ✗ ${m}`);
  if (aide) console.error(`\n   ${aide}`);
  process.exit(1);
};

console.log("\n=== MAGASIN DES PIECES KYC ===\n");

const URL_PROJET = process.env.SUPABASE_URL ?? "";
const CLEF = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SEAU = process.env.KYC_BUCKET ?? "kyc";

/**
 * L adresse du projet se DEDUIT de la chaine de connexion : l utilisateur du
 * pooler s ecrit `postgres.<reference>`. Autant la proposer plutot que de
 * laisser chercher.
 */
function urlDeduite() {
  const ref = (process.env.DATABASE_URL ?? "").match(/postgres\.([a-z0-9]{20})/)?.[1];
  return ref ? `https://${ref}.supabase.co` : null;
}

if (!URL_PROJET) {
  const suggeree = urlDeduite();
  arreter(
    "SUPABASE_URL manquant.",
    (suggeree
      ? `D apres DATABASE_URL, c est probablement :\n     SUPABASE_URL="${suggeree}"\n\n   `
      : "") +
      "Tableau de bord Supabase > Project Settings > Data API > Project URL."
  );
}

if (!CLEF) {
  arreter(
    "SUPABASE_SERVICE_ROLE_KEY manquant.",
    "Tableau de bord Supabase > Project Settings > API keys > service_role.\n\n" +
      "   ATTENTION : cette clef passe outre TOUTES les regles d acces. Elle ne\n" +
      "   doit jamais figurer dans une variable NEXT_PUBLIC_*, ni etre versionnee,\n" +
      "   ni quitter le serveur. Sur l hebergeur, elle se met dans les variables\n" +
      "   d environnement, pas dans le depot."
  );
}

const api = (chemin, options = {}) =>
  fetch(`${URL_PROJET.replace(/\/+$/, "")}/storage/v1${chemin}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${CLEF}`,
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });

// ═══════════ 1. Le projet repond-il ?
let seaux;
try {
  const reponse = await api("/bucket");
  if (reponse.status === 401 || reponse.status === 403) {
    arreter(
      "Supabase refuse la clef.",
      "Verifiez qu il s agit bien de la clef `service_role`, et non de `anon`."
    );
  }
  if (!reponse.ok) {
    arreter(`Supabase a repondu ${reponse.status}.`, await reponse.text());
  }
  seaux = await reponse.json();
} catch (e) {
  arreter(
    `Contact impossible avec ${URL_PROJET} : ${e.message}`,
    "Verifiez l adresse du projet, et que le reseau laisse passer le HTTPS."
  );
}

ok(`projet joignable — ${seaux.length} seau(x) existant(s)`);

// ═══════════ 2. Le seau existe-t-il ?
const existant = seaux.find((s) => s.id === SEAU || s.name === SEAU);

if (!existant) {
  const reponse = await api("/bucket", {
    method: "POST",
    body: JSON.stringify({
      id: SEAU,
      name: SEAU,
      // PRIVE. C est le point entier de ce script.
      public: false,
      file_size_limit: 5 * 1024 * 1024,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    }),
  });

  if (!reponse.ok) {
    arreter(`Creation du seau « ${SEAU} » refusee.`, await reponse.text());
  }
  ok(`seau « ${SEAU} » cree, prive`);
} else if (existant.public) {
  // On ne le rend PAS prive tout seul : si quelqu un l a ouvert
  // deliberement, il faut le savoir, et savoir ce qui a pu fuir entre-temps.
  arreter(
    `Le seau « ${SEAU} » est PUBLIC.`,
    "Chaque piece d identite qu il contient est lisible par quiconque devine\n" +
      "   son adresse. Passez-le en prive depuis le tableau de bord Supabase\n" +
      "   (Storage > le seau > Configuration), puis relancez.\n\n" +
      "   Ce script ne le fait pas a votre place : s il a ete ouvert\n" +
      "   deliberement, il faut d abord savoir ce qui a pu fuir."
  );
} else {
  ok(`seau « ${SEAU} » deja present, et prive`);
}

// ═══════════ 3. Un aller-retour reel
const temoin = `_controle/${Date.now()}.txt`;
const contenu = new TextEncoder().encode("controle de mise en route KOLI");

const depot = await api(`/object/${SEAU}/${temoin}`, {
  method: "POST",
  headers: { "content-type": "text/plain" },
  body: contenu,
});

if (!depot.ok) {
  arreter("Le depot d un fichier temoin a echoue.", await depot.text());
}

const relecture = await api(`/object/${SEAU}/${temoin}`);
const relu = relecture.ok ? await relecture.text() : "";

await api(`/object/${SEAU}/${temoin}`, { method: "DELETE" });

if (relu !== "controle de mise en route KOLI") {
  arreter("Le fichier temoin n a pas ete relu correctement.");
}

ok("depot, relecture et suppression verifies");

console.log("\nLe magasin des pieces KYC est pret.");
console.log("Placez ces variables sur l hebergeur, jamais dans le depot :");
console.log(`   SUPABASE_URL="${URL_PROJET}"`);
console.log(`   SUPABASE_SERVICE_ROLE_KEY="…"`);
if (SEAU !== "kyc") console.log(`   KYC_BUCKET="${SEAU}"`);
console.log("");
