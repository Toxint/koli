/**
 * Les trois visages de la pastille d'accueil — client, vendeur, livreur.
 *
 * Ce sont de VRAIES photographies. Une version précédente les dessinait, par
 * prudence : des portraits illustrés n'affirment rien de personne. Le choix a
 * été tranché dans l'autre sens, et il se défend — trois visages posés à côté
 * d'une mention « mode test » ne prétendent pas que ces gens sont clients, pas
 * plus que les visages d'une affiche ne prétendent l'être. Ce qui serait
 * malhonnête, c'est d'attacher une photo à un avis signé d'un nom inventé.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  D'OÙ ELLES VIENNENT, et pourquoi c'est écrit ici                        │
 * │                                                                          │
 * │  cliente.jpg    pexels.com/photo/2661255   (Adrienne Andersen)           │
 * │  vendeuse.jpg   pexels.com/photo/3769022   (Andrea Piacquadio)           │
 * │  livreur.jpg    pexels.com/photo/6999225   (Monstera Production)         │
 * │                                                                          │
 * │  Licence Pexels : usage commercial autorisé, aucune attribution exigée,  │
 * │  modification permise. La provenance est notée quand même : le jour où   │
 * │  quelqu'un demande d'où viennent ces visages — un partenaire, un         │
 * │  juriste, un repreneur —, « je ne sais plus » n'est pas une réponse.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ── Ce qui a décidé du choix des photos ─────────────────────────────────────
 *
 * **Jugées à 28 px avant de l'être en grand.** Onze candidates ont été rendues
 * côte à côte, aux deux tailles. Presque toutes sont superbes en grand et
 * illisibles en petit : dès que le cadrage est large — quelqu'un à son bureau,
 * quelqu'un en pied —, le visage occupe trois pixels et il ne reste qu'une
 * tache. Les trois retenues sont les seules dont le VISAGE remplit le cadre.
 *
 * **Le fond compte autant que le sujet.** Deux photos sur fond très sombre
 * deviennent deux disques noirs côte à côte ; et une photo sur fond BLANC
 * disparaît dans la pastille, qui est blanche elle aussi — c'est ce qui a fait
 * écarter le second choix, pourtant excellent en grand. Les trois retenues ont
 * trois fonds de clartés franchement différentes : chaud, turquoise, gris.
 *
 * ── Le poids ────────────────────────────────────────────────────────────────
 *
 * 128 px de côté, moins de 4 Ko chacune, 12 Ko pour les trois. Elles
 * s'affichent à 28 px : 128 couvre les écrans à trois fois la densité, et
 * au-delà on paierait des octets que personne ne voit. Le §70 vise des
 * téléphones sur réseau mobile lent, et c'est le genre d'endroit où une page
 * gagne trois mégaoctets sans que personne s'en aperçoive.
 *
 * `<img>` et non `next/image` : ces fichiers sont déjà à leur taille finale et
 * pèsent moins que la requête d'optimisation qu'ils déclencheraient. `width` et
 * `height` sont posés en attributs — sans eux, la pastille se réajuste à
 * l'arrivée des images et la ligne saute sous les yeux du lecteur.
 */

/* eslint-disable @next/next/no-img-element */

interface Visage {
  /** Le rôle représenté — pour la relecture, jamais affiché. */
  role: string;
  fichier: string;
}

const VISAGES: Visage[] = [
  { role: "cliente", fichier: "/visages/cliente.jpg" },
  { role: "vendeuse", fichier: "/visages/vendeuse.jpg" },
  { role: "livreur", fichier: "/visages/livreur.jpg" },
];

/**
 * Les trois, empilés.
 *
 * `aria-hidden` sur l'ensemble, et `alt=""` sur chacune : le texte de la
 * pastille dit déjà ce qu'il y a à savoir. Décrire trois portraits
 * décoratifs — « photo d'une femme », « photo d'un homme » — n'apprendrait
 * rien et allongerait la lecture d'un écran qui commence par là.
 *
 * 28 px et non 24 : à 24, les trois visages deviennent trois taches, et le
 * bénéfice de mettre des personnes disparaît avec eux.
 */
export function VisagesRoles({ taille = 28 }: { taille?: number }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 -space-x-2">
      {VISAGES.map((v) => (
        <img
          key={v.role}
          src={v.fichier}
          alt=""
          width={taille}
          height={taille}
          loading="eager"
          /* `object-cover` : les fichiers sont carrés, mais un cadrage qui
             changerait un jour déformerait les visages sans cette ligne. */
          className="shrink-0 rounded-full object-cover ring-2 ring-white"
          style={{ width: taille, height: taille }}
        />
      ))}
    </span>
  );
}
