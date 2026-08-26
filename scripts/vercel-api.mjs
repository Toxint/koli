import fs from "node:fs";

const JETON = fs.readFileSync(".donnees/.jeton-vercel", "utf8").trim();
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
