import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Le jeton d acces Vercel, lu LA OU LA CLI LE RANGE DEJA.
 *
 * Une premiere version le recopiait dans `.donnees/.jeton-vercel`. C etait un
 * secret de plus sur le disque, a la charge de quelqu un : deux copies d un
 * meme secret, c est deux fois plus d endroits ou l oublier. Celle-ci lit
 * directement le magasin de `vercel login`, qui existe de toute facon.
 *
 * Si le jeton manque, la reponse est `vercel login`, pas un fichier a
 * fabriquer a la main.
 */
function lireJeton() {
  const candidats = [
    path.join(process.env.APPDATA ?? "", "xdg.data", "com.vercel.cli", "auth.json"),
    path.join(process.env.APPDATA ?? "", "com.vercel.cli", "auth.json"),
    path.join(process.env.LOCALAPPDATA ?? "", "com.vercel.cli", "auth.json"),
    path.join(os.homedir(), ".local", "share", "com.vercel.cli", "auth.json"),
    path.join(os.homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json"),
  ];

  for (const chemin of candidats) {
    if (!chemin || !fs.existsSync(chemin)) continue;
    try {
      const jeton = JSON.parse(fs.readFileSync(chemin, "utf8")).token;
      if (jeton) return jeton;
    } catch {
      // Fichier illisible ou d un autre format : on essaie le suivant.
    }
  }

  throw new Error(
    "Jeton Vercel introuvable. Connectez-vous : npx vercel login --github"
  );
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
