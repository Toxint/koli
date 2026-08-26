import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  cheminValide,
  nouveauChemin,
  type FichierRange,
  type MagasinKyc,
  type TypeReconnu,
} from "./magasin";

/**
 * Magasin sur le disque local — développement, ou hébergement à volume monté.
 *
 * **Rien n'est écrit sous `public/`.** Un dossier de `public/` est servi tel
 * quel par le serveur, sans le moindre contrôle : une carte d'identité y
 * atterrissant serait lisible par quiconque devine son adresse, et rien ne le
 * signalerait. Les fichiers vivent hors de l'arborescence servie, et
 * `/api/kyc/<id>` est le seul chemin qui les restitue, après vérification du
 * demandeur.
 *
 * **Ne convient PAS à un hébergement sans serveur.** Le disque y est éphémère :
 * les pièces déposées disparaîtraient au déploiement suivant, sans erreur et
 * sans trace. C'est `stockage.ts` qui refuse ce cas, pas ce fichier.
 *
 * Le chemin racine est calculé à l'exécution : il doit pouvoir être déplacé sur
 * un volume monté sans reconstruire l'application, et les tests l'isolent dans
 * un dossier temporaire. Turbopack ne peut donc pas l'analyser statiquement et
 * signalerait que tout le projet est tracé — d'où les `turbopackIgnore`. Ces
 * accès sont intentionnels ; leur portée est garantie non par l'analyse
 * statique mais par les deux contrôles ci-dessous.
 */
export function magasinDisque(racine: string): MagasinKyc {
  const RACINE_ABSOLUE = path.resolve(/* turbopackIgnore: true */ racine);

  /** Le chemin résolu reste-t-il DANS le magasin ? */
  const dansLeMagasin = (absolu: string) =>
    absolu === RACINE_ABSOLUE || absolu.startsWith(RACINE_ABSOLUE + path.sep);

  /**
   * Deux contrôles plutôt qu'un, et ce n'est pas une redondance inutile : la
   * forme du chemin écarte ce qui n'a jamais pu être produit par nous, le
   * confinement écarte tout le reste. Le premier peut être assoupli un jour
   * sans que le second cesse de protéger.
   */
  const resoudre = (chemin: string): string | null => {
    if (!cheminValide(chemin)) return null;
    const absolu = path.resolve(/* turbopackIgnore: true */ racine, chemin);
    return dansLeMagasin(absolu) ? absolu : null;
  };

  return {
    nom: `disque (${racine})`,

    async ranger(donnees: Uint8Array, type: TypeReconnu): Promise<FichierRange> {
      const relatif = nouveauChemin(type.extension);
      const absolu = path.join(racine, relatif);

      await mkdir(/* turbopackIgnore: true */ path.dirname(absolu), {
        recursive: true,
      });
      await writeFile(/* turbopackIgnore: true */ absolu, donnees, { mode: 0o600 });

      return { chemin: relatif, mime: type.mime, taille: donnees.length };
    },

    async lire(chemin: string): Promise<Uint8Array | null> {
      const absolu = resoudre(chemin);
      if (!absolu) return null;

      try {
        return new Uint8Array(await readFile(/* turbopackIgnore: true */ absolu));
      } catch {
        return null;
      }
    },

    async supprimer(chemin: string): Promise<void> {
      const absolu = resoudre(chemin);
      if (!absolu) return;
      await unlink(/* turbopackIgnore: true */ absolu).catch(() => {});
    },
  };
}
