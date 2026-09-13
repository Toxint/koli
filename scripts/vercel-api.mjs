import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

/**
 * Le jeton d acces Vercel, lu LA OU LA CLI LE RANGE DEJA.
 *
 * Une premiere version le recopiait dans `.donnees/.jeton-vercel`. C etait un
 * secret de plus sur le disque, a la charge de quelqu un : deux copies d un
 * meme secret, c est deux fois plus d endroits ou l oublier. Celle-ci lit
 * directement le magasin de `vercel login`, qui existe de toute facon.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  ⚠ Le jeton ne vit que HUIT HEURES. La CLI le renouvelle a chaque       │
 * │  commande grace a son `refreshToken` — ce fichier-ci ne faisait que le  │
 * │  LIRE, et ne le renouvelait jamais.                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Constate le 13 septembre 2026 : « 403 invalidToken » depuis cinq jours, pris
 * pour une session revoquee. Ce n en etait pas une — le jeton avait expire le
 * 9 septembre a 4 h, huit heures apres sa derniere utilisation par la CLI.
 *
 * Et une reconnexion n y changeait rien : la CLI 59 ecrit dans
 * `com.vercel.cli/Data/auth.json`, un chemin que la liste ignorait, tandis
 * qu elle lisait EN PREMIER l ancien fichier, `xdg.data/…`, au jeton mort.
 *
 * Trois regles, donc :
 *   · tous les emplacements connus sont lus, et on garde le jeton qui EXPIRE
 *     LE PLUS TARD — jamais le premier trouve ;
 *   · un jeton expire n est pas utilise : on laisse la CLI le renouveler
 *     (`vercel whoami` consomme le `refreshToken`), puis on relit ;
 *   · si rien ne marche, le message dit quoi faire, sans afficher le jeton.
 */
const EMPLACEMENTS = () => [
  path.join(process.env.APPDATA ?? "", "com.vercel.cli", "Data", "auth.json"),
  path.join(process.env.APPDATA ?? "", "xdg.data", "com.vercel.cli", "auth.json"),
  path.join(process.env.APPDATA ?? "", "com.vercel.cli", "auth.json"),
  path.join(process.env.LOCALAPPDATA ?? "", "com.vercel.cli", "auth.json"),
  path.join(os.homedir(), ".local", "share", "com.vercel.cli", "auth.json"),
  path.join(os.homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json"),
];

/** `expiresAt` en secondes ou en millisecondes selon les versions : on normalise. */
const expirationMs = (v) => (typeof v !== "number" ? 0 : v < 1e12 ? v * 1000 : v);

function meilleurJeton() {
  let meilleur = null;
  for (const chemin of EMPLACEMENTS()) {
    if (!chemin || !fs.existsSync(chemin)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(chemin, "utf8"));
      if (!j.token) continue;
      /* Un fichier sans `expiresAt` (ancien format, jeton non expirant) passe
         devant tout le reste : il ne se perime pas. */
      const expire = j.expiresAt === undefined ? Number.POSITIVE_INFINITY : expirationMs(j.expiresAt);
      if (!meilleur || expire > meilleur.expire) meilleur = { jeton: j.token, expire };
    } catch {
      // Fichier illisible ou d un autre format : on essaie le suivant.
    }
  }
  return meilleur;
}

function lireJeton() {
  const MARGE = 60_000;
  let m = meilleurJeton();

  if (!m || m.expire - MARGE < Date.now()) {
    /* La CLI renouvelle le jeton a partir de son `refreshToken`. Silencieuse :
       sa sortie contient le nom du compte, pas le jeton, mais on n en a pas
       besoin ici. */
    try {
      execSync("npx --yes vercel whoami", { stdio: "ignore", timeout: 120_000 });
    } catch {
      // Echec du renouvellement : le message ci-dessous dit quoi faire.
    }
    m = meilleurJeton();
  }

  if (!m || m.expire - MARGE < Date.now()) {
    throw new Error(
      "Jeton Vercel expire et non renouvelable. Reconnectez le poste : npx vercel login"
    );
  }
  return m.jeton;
}

const JETON = lireJeton();
const { projectId, orgId } = JSON.parse(fs.readFileSync(".vercel/project.json", "utf8"));

export async function api(chemin, options = {}) {
  const sep = chemin.includes("?") ? "&" : "?";
  const r = await fetch(`https://api.vercel.com${chemin}${sep}teamId=${orgId}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${JETON}`,
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const texte = await r.text();
  let corps;
  try { corps = texte ? JSON.parse(texte) : null; } catch { corps = texte; }
  return { statut: r.status, ok: r.ok, corps };
}

export { projectId, orgId };
