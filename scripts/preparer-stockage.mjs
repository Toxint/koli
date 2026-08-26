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

/** Marque une fin volontaire, distincte d une vraie erreur. */
class SortieAttendue extends Error {}

/**
 * Sortie en erreur, en laissant Node se refermer proprement.
 *
 * `process.exit()` appele alors qu une connexion HTTP vient d etre utilisee
 * fait sortir Node sur « Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) ».
 * Le diagnostic reste juste, mais il est suivi d une ligne qui ressemble a un
 * plantage — et un outil qui a l air de planter apres avoir bien travaille
 * n inspire pas confiance.
 *
 * On fixe donc le code de sortie et on laisse la boucle d evenements se vider.
 */
const arreter = (m, aide = "") => {
  console.error(`   ✗ ${m}`);
  if (aide) console.error(`\n   ${aide}`);
  process.exitCode = 1;
  throw new SortieAttendue();
};

/**
 * L adresse ATTENDUE est la racine du projet, pas un point d entree.
 *
 * Le tableau de bord affiche `https://<ref>.supabase.co/rest/v1/` sous le
 * libelle « API URL » : c est l adresse de l API REST, celle des tables. Le
 * stockage vit ailleurs, sous `/storage/v1/`. Coller la premiere telle quelle
 * produirait `.../rest/v1/storage/v1/...`, et un 404 qui ne dirait pas pourquoi.
 *
 * On l accepte donc et on la ramene a sa racine, plutot que d exiger de la
 * precision sur un detail que rien n annonce.
 */
function racineDuProjet(brut) {
  return brut.trim().replace(/\/+$/, "").replace(/\/(rest|storage|auth)\/v1$/, "");
}

/**
 * Est-ce la clef PUBLIQUE ?
 *
 * Supabase expose deux clefs, et leurs noms ont change : « publishable »
 * remplace `anon`, « secret » remplace `service_role`. La premiere est faite
 * pour etre lue par les navigateurs et respecte les regles d acces — elle ne
 * peut pas ecrire dans un seau prive. La confusion est facile, et l erreur
 * qu elle produit (« new row violates row-level security policy ») ne dit pas
 * qu on s est trompe de clef.
 */
function estClefPublique(clef) {
  if (clef.startsWith("sb_publishable_")) return true;

  // Ancien format : un JWT dont la charge utile porte le role.
  try {
    const charge = JSON.parse(
      Buffer.from(clef.split(".")[1] ?? "", "base64url").toString("utf8")
    );
    return charge.role === "anon";
  } catch {
    return false;
  }
}

/**
 * Supabase Storage ne repond pas 401 sur une clef invalide.
 *
 * Il rend un 400 dont le CORPS porte le vrai statut :
 * `{"statusCode":"403","error":"Unauthorized",…}`. S en tenir au code HTTP
 * ferait afficher « Supabase a repondu 400 » suivi d un JSON brut, alors que
 * le diagnostic est simple et qu on sait quoi en dire.
 */
const refusDeClef = (statut, corps) =>
  statut === 401 ||
  statut === 403 ||
  /Unauthorized|AccessDenied|Invalid Compact JWS|invalid signature/i.test(corps);

/**
 * L adresse du projet se DEDUIT de la chaine de connexion : l utilisateur du
 * pooler s ecrit `postgres.<reference>`. Autant la proposer plutot que de
 * laisser chercher.
 */
function urlDeduite() {
  const ref = (process.env.DATABASE_URL ?? "").match(/postgres\.([a-z0-9]{20})/)?.[1];
  return ref ? `https://${ref}.supabase.co` : null;
}

async function main() {
  console.log("\n=== MAGASIN DES PIECES KYC ===\n");

  const URL_PROJET = racineDuProjet(process.env.SUPABASE_URL ?? "");
  const CLEF = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  const SEAU = process.env.KYC_BUCKET ?? "kyc";

  if (!URL_PROJET) {
    const suggeree = urlDeduite();
    arreter(
      "SUPABASE_URL manquant.",
      (suggeree
        ? `D apres DATABASE_URL, c est probablement :\n     SUPABASE_URL="${suggeree}"\n\n   `
        : "") + "Tableau de bord Supabase > Project Settings > Data API > Project URL."
    );
  }

  if (!CLEF) {
    arreter(
      "SUPABASE_SERVICE_ROLE_KEY manquant.",
      "Tableau de bord Supabase > Project Settings > API keys > SECRET KEY.\n" +
        "   (« secret » est le nouveau nom de `service_role` ; « publishable »\n" +
        "   celui de `anon`.)\n\n" +
        "   ATTENTION : cette clef passe outre TOUTES les regles d acces. Elle ne\n" +
        "   doit jamais figurer dans une variable NEXT_PUBLIC_*, ni etre versionnee,\n" +
        "   ni quitter le serveur. Sur l hebergeur, elle se met dans les variables\n" +
        "   d environnement, pas dans le depot."
    );
  }

  if (estClefPublique(CLEF)) {
    arreter(
      "C est la clef PUBLIQUE (« publishable », ex-`anon`).",
      "Elle est faite pour etre lue par les navigateurs et respecte les regles\n" +
        "   d acces : elle ne peut pas ecrire dans un seau prive. Prenez la SECRET\n" +
        "   KEY (ex-`service_role`), juste en dessous dans le tableau de bord.\n\n" +
        "   Sans ce controle, l echec serait arrive plus loin sous la forme\n" +
        "   « new row violates row-level security policy » — un message qui ne dit\n" +
        "   nulle part qu on s est trompe de clef."
    );
  }

  const api = (chemin, options = {}) =>
    fetch(`${URL_PROJET}/storage/v1${chemin}`, {
      ...options,
      headers: {
        // Les DEUX : `apikey` pour la passerelle Supabase, `Authorization`
        // pour le service derriere elle. Les clefs `sb_secret_…` ne sont pas
        // des JWT — presentees au seul `Authorization`, la passerelle tente de
        // les decoder et repond « Invalid Compact JWS ».
        apikey: CLEF,
        Authorization: `Bearer ${CLEF}`,
        "content-type": "application/json",
        connection: "close",
        ...(options.headers ?? {}),
      },
    });

  // ═══════════ 1. Le projet repond-il ?
  let reponse;
  try {
    reponse = await api("/bucket");
  } catch (e) {
    arreter(
      `Contact impossible avec ${URL_PROJET} : ${e.message}`,
      "Verifiez l adresse du projet, et que le reseau laisse passer le HTTPS."
    );
  }

  if (!reponse.ok) {
    const corps = await reponse.text().catch(() => "");
    if (refusDeClef(reponse.status, corps)) {
      arreter(
        "Supabase refuse la clef.",
        "Verifiez qu il s agit bien de la SECRET KEY (ex-`service_role`), et\n" +
          "   qu elle a ete copiee ENTIEREMENT — un collage tronque produit la\n" +
          "   meme erreur qu une clef fausse.\n\n" +
          "   Tableau de bord Supabase > Project Settings > API keys."
      );
    }
    arreter(`Supabase a repondu ${reponse.status}.`, corps);
  }

  const seaux = await reponse.json();
  ok(`projet joignable — ${seaux.length} seau(x) existant(s)`);

  // ═══════════ 2. Le seau existe-t-il, et est-il prive ?
  const existant = seaux.find((s) => s.id === SEAU || s.name === SEAU);

  if (!existant) {
    const creation = await api("/bucket", {
      method: "POST",
      body: JSON.stringify({
        id: SEAU,
        name: SEAU,
        // PRIVE. C est le point entier de ce script.
        public: false,
        file_size_limit: 5 * 1024 * 1024,
        allowed_mime_types: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "application/pdf",
        ],
      }),
    });

    if (!creation.ok) {
      arreter(
        `Creation du seau « ${SEAU} » refusee.`,
        await creation.text().catch(() => "")
      );
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
  //
  // Creer le seau ne prouve rien : les droits d ecriture sur les objets sont
  // une autre affaire que les droits sur les seaux. On depose, on relit, on
  // supprime.
  //
  // Le temoin est un VRAI JPEG minuscule, pas du texte : le seau n accepte que
  // les types du §37, et un temoin en `text/plain` echouait sur notre propre
  // restriction — ce qui prouvait le contraire de ce qu on voulait montrer.
  const temoin = `_controle/${Date.now()}.jpg`;
  const attendu = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ...new Array(32).fill(0x20),
    0xff, 0xd9,
  ]);

  const depot = await api(`/object/${SEAU}/${temoin}`, {
    method: "POST",
    headers: { "content-type": "image/jpeg" },
    body: attendu,
  });

  if (!depot.ok) {
    arreter(
      "Le depot d un fichier temoin a echoue.",
      await depot.text().catch(() => "")
    );
  }

  const relecture = await api(`/object/${SEAU}/${temoin}`);
  const relu = relecture.ok
    ? new Uint8Array(await relecture.arrayBuffer())
    : new Uint8Array();

  await api(`/object/${SEAU}/${temoin}`, { method: "DELETE" });

  // Octet par octet : un stockage qui rendrait un fichier tronque, ou une page
  // d erreur a la place, passerait une comparaison de taille.
  const identique =
    relu.length === attendu.length && relu.every((o, i) => o === attendu[i]);

  if (!identique) {
    arreter(
      "Le fichier temoin n a pas ete relu a l identique.",
      `${attendu.length} octets deposes, ${relu.length} relus.`
    );
  }

  ok("depot, relecture et suppression verifies");

  console.log("\nLe magasin des pieces KYC est pret.");
  console.log("Placez ces variables sur l hebergeur, jamais dans le depot :");
  console.log(`   SUPABASE_URL="${URL_PROJET}"`);
  console.log(`   SUPABASE_SERVICE_ROLE_KEY="…"`);
  if (SEAU !== "kyc") console.log(`   KYC_BUCKET="${SEAU}"`);
  console.log("");
}

try {
  await main();
} catch (e) {
  // `arreter` a deja tout dit ; le reste est une vraie surprise.
  if (!(e instanceof SortieAttendue)) {
    console.error(`   ✗ ${e.stack ?? e.message}`);
    process.exitCode = 1;
  }
}
