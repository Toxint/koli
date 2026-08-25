/**
 * Lecture de `.env` pour les scripts.
 *
 * Node ne charge pas `.env` de lui-meme : c'est Next qui s'en charge dans
 * l'application. Les scripts lances directement — verifications, mise en route
 * — n'en beneficient pas, et signalaient « DATABASE_URL manquant » alors que
 * la valeur etait bien la, deux lignes plus bas dans le fichier.
 *
 * Les variables deja definies dans l'environnement l'emportent : c'est ce qui
 * permet de viser une autre base le temps d'une commande, sans toucher `.env`.
 */

import fs from "node:fs";

export function chargerEnv(chemin = ".env") {
  if (!fs.existsSync(chemin)) return;

  for (const ligne of fs.readFileSync(chemin, "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const valeur = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = valeur;
  }
}
