/**
 * Lecture de `.env.local` puis `.env` pour les scripts.
 *
 * Node ne charge pas ces fichiers de lui-meme : c'est Next qui s'en charge
 * dans l'application. Les scripts lances directement — verifications, mise en
 * route — n'en beneficient pas, et signalaient « DATABASE_URL manquant » alors
 * que la valeur etait bien la, deux lignes plus bas dans le fichier.
 *
 * **L'ordre reproduit celui de Next.** `.env.local` d'abord, `.env` ensuite :
 * la premiere valeur rencontree gagne. `.env.local` designe la base de
 * developpement locale, `.env` la base Supabase — et un script qui lirait
 * l'une en croyant lire l'autre est exactement le genre d'erreur qui fait
 * perdre une journee.
 *
 * Les variables deja definies dans l'environnement l'emportent sur les deux :
 * c'est ce qui permet de viser une autre base le temps d'une commande, sans
 * toucher aux fichiers.
 */

import fs from "node:fs";

export function chargerEnv(...chemins) {
  const fichiers = chemins.length > 0 ? chemins : [".env.local", ".env"];

  for (const chemin of fichiers) {
    if (!fs.existsSync(chemin)) continue;

    for (const ligne of fs.readFileSync(chemin, "utf8").split(/\r?\n/)) {
      const m = ligne.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const valeur = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = valeur;
    }
  }
}
