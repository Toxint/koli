import {
  cheminValide,
  nouveauChemin,
  type FichierRange,
  type MagasinKyc,
  type TypeReconnu,
} from "./magasin";

/**
 * Magasin sur Supabase Storage — l'hébergement en ligne.
 *
 * **Pourquoi il existe.** Sur un hébergement sans serveur, le disque est
 * éphémère : une pièce d'identité déposée disparaîtrait au déploiement suivant,
 * sans erreur et sans trace. C'est le pire genre de panne — celle qui ne se
 * signale pas, et qu'on découvre le jour où un vendeur conteste sa
 * vérification.
 *
 * **Le seau doit être PRIVÉ.** C'est la même règle que « rien sous `public/` » :
 * un seau public rend chaque pièce lisible par quiconque devine son adresse.
 * `scripts/preparer-stockage.mjs` le crée privé et refuse de continuer s'il
 * l'a trouvé public.
 *
 * **La clef `service_role` ne quitte JAMAIS le serveur.** Elle passe outre
 * toutes les règles d'accès de Supabase : exposée au navigateur, elle donnerait
 * à n'importe qui la lecture de toute la base. Ce fichier n'est importé que
 * depuis des actions serveur et une route d'API ; aucune variable ici ne porte
 * le préfixe `NEXT_PUBLIC_`, qui embarquerait la valeur dans le paquet client.
 *
 * Aucune dépendance ajoutée : l'API de stockage est du HTTP, `fetch` suffit.
 * Le client officiel apporterait surtout de l'authentification dont on n'a pas
 * l'usage ici.
 */
export function magasinSupabase(
  urlProjet: string,
  clefService: string,
  seau: string
): MagasinKyc {
  const base = `${urlProjet.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(seau)}`;

  const entetes = { Authorization: `Bearer ${clefService}` };

  /** Le chemin est encodé segment par segment : jamais concaténé tel quel. */
  const adresse = (chemin: string) =>
    `${base}/${chemin.split("/").map(encodeURIComponent).join("/")}`;

  return {
    nom: `Supabase Storage (seau « ${seau} »)`,

    async ranger(donnees: Uint8Array, type: TypeReconnu): Promise<FichierRange> {
      const chemin = nouveauChemin(type.extension);

      const reponse = await fetch(adresse(chemin), {
        method: "POST",
        headers: {
          ...entetes,
          "content-type": type.mime,
          // Le nom est tiré au sort sur 24 octets : une collision est hors de
          // portée. `false` fait donc echouer un doublon au lieu de recouvrir
          // en silence une pièce existante.
          "x-upsert": "false",
        },
        body: donnees as unknown as BodyInit,
      });

      if (!reponse.ok) {
        // Le corps de la réponse peut nommer le seau et le projet : il part au
        // journal du serveur, jamais à l'utilisateur.
        console.error(
          `KYC — dépôt refusé par Supabase Storage (${reponse.status}) :`,
          await reponse.text().catch(() => "")
        );
        throw new Error("Le dépôt de la pièce a échoué.");
      }

      return { chemin, mime: type.mime, taille: donnees.length };
    },

    async lire(chemin: string): Promise<Uint8Array | null> {
      if (!cheminValide(chemin)) return null;

      const reponse = await fetch(adresse(chemin), { headers: entetes });
      if (!reponse.ok) return null;

      return new Uint8Array(await reponse.arrayBuffer());
    },

    async supprimer(chemin: string): Promise<void> {
      if (!cheminValide(chemin)) return;

      await fetch(adresse(chemin), { method: "DELETE", headers: entetes }).catch(
        () => {}
      );
    },
  };
}
