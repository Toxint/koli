"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icone, type NomIcone } from "@/components/ui/Icone";
import { formatCFA } from "@/lib/format";

/**
 * Les annonces d'activité — la vignette qui se pose dans le coin bas-gauche.
 *
 * Le geste est repris de `app.saspay.me` : une petite carte blanche qui monte
 * du coin, dit qu'il vient de se passer quelque chose, et repart. Elle répond
 * à la question qu'un visiteur se pose sans la formuler — « est-ce que ce
 * service est vivant ? » — que ni une accroche ni un chiffre ne traitent,
 * parce qu'on ne croit pas une page qui parle d'elle-même.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  ELLE NE S'AFFICHE PAS EN LIGNE. La page d'accueil ne la monte que    │
 * │  sous `exemplesTemoignagesAutorises()` — voir la note d'`ANNONCES`.   │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Deux annonces alternent, et ce sont les deux extrémités du parcours du §59 :
 * quelqu'un rejoint KOLI, et un vendeur touche son argent. Elles ne sont pas
 * choisies pour meubler — la seconde est la promesse même du produit, et la
 * voir tomber toute seule pendant qu'on lit vaut le paragraphe qui l'explique.
 */

interface Annonce {
  icone: NomIcone;
  /** Le fait, en deux mots. */
  titre: string;
  /** Qui, et combien. La ligne du dessous. */
  detail: string;
}

/**
 * Les exemples — INVENTÉS, et c'est tout le problème.
 *
 * Une vignette d'activité est un TÉMOIGNAGE au même titre qu'un avis client :
 * elle affirme des faits — telle personne s'est inscrite, tel vendeur a été
 * payé. Sur un site qui n'a pas encore d'utilisateur, ce seraient des faits
 * fabriqués. Et KOLI vend précisément la confiance : se faire prendre à
 * simuler une activité coûterait bien plus que ce que la vignette rapporte.
 *
 * Elle passe donc par la MÊME garde que les témoignages d'exemple
 * (`exemplesTemoignagesAutorises`, `lib/config/demonstration.ts`) : visible sur
 * le poste pour juger du rendu, absente de l'hébergeur. Le jour où de vraies
 * inscriptions et de vrais versements existent, cette liste laisse la place à
 * une requête — la forme du composant, elle, ne bouge pas.
 *
 * Les prénoms sont ivoiriens et le nom réduit à son initiale : c'est l'usage
 * pour ce genre de vignette, et un nom complet exposerait un vrai client le
 * jour où la source deviendra la base.
 */
const ANNONCES: Annonce[] = [
  {
    icone: "client",
    titre: "Nouveau compte",
    detail: "Awa K. vient de s'inscrire",
  },
  {
    icone: "argent",
    titre: "Fonds libérés",
    detail: `Kouadio B. a reçu ${formatCFA(42500)}`,
  },
  {
    icone: "client",
    titre: "Nouveau compte",
    detail: "Mariam T. vient de s'inscrire",
  },
  {
    icone: "argent",
    titre: "Fonds libérés",
    detail: `Fatou D. a reçu ${formatCFA(18000)}`,
  },
  {
    icone: "client",
    titre: "Nouveau compte",
    detail: "Yao N. vient de s'inscrire",
  },
  {
    icone: "argent",
    titre: "Fonds libérés",
    detail: `Aïcha S. a reçu ${formatCFA(75000)}`,
  },
];

/**
 * Le rythme.
 *
 * `DELAI_INITIAL` laisse le haut de page finir ses apparitions : une vignette
 * qui surgit pendant que le titre monte encore donne deux mouvements
 * concurrents, et on n'en lit aucun.
 *
 * `DUREE_VISIBLE` est calé sur la lecture et non sur l'esthétique : deux
 * lignes courtes se lisent en trois secondes, et il faut d'abord le temps de
 * REMARQUER la vignette. Cinq secondes.
 *
 * `DUREE_PAUSE` est le vide entre deux. Sans lui, les annonces s'enchaînent
 * comme un panneau publicitaire ; avec, chacune paraît arriver.
 */
const DELAI_INITIAL = 3_500;
const DUREE_VISIBLE = 5_000;
const DUREE_PAUSE = 2_600;

/**
 * `prefers-reduced-motion`, LU EN DIRECT.
 *
 * Un `useEffect` qui recopie la valeur dans un état aurait fait deux choses de
 * travers. D'abord la règle `react-hooks/set-state-in-effect` l'interdit, et
 * elle a raison : c'est un rendu de plus pour une valeur qui n'a pas changé.
 * Ensuite et surtout, la copie ne se serait jamais mise à jour — quelqu'un qui
 * active la réduction de mouvement dans son système pendant qu'il lit la page
 * aurait continué à voir la vignette tourner.
 *
 * `useSyncExternalStore` s'abonne à la requête média elle-même. Le troisième
 * argument est l'instantané du SERVEUR : `false`, parce qu'un serveur n'a pas
 * de préférence d'affichage, et c'est aussi ce que le navigateur emploie
 * pendant l'hydratation — les deux rendus concordent donc forcément.
 */
function sAbonnerAuMouvement(rappel: () => void) {
  const requete = window.matchMedia("(prefers-reduced-motion: reduce)");
  requete.addEventListener("change", rappel);
  return () => requete.removeEventListener("change", rappel);
}

function lireLeMouvement() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AnnoncesActivite() {
  /**
   * On démarre sur la DERNIÈRE : le premier passage incrémente, et la première
   * annonce montrée est donc bien `ANNONCES[0]`.
   *
   * Le détour évite un `index` à −1 — la vignette est rendue AVANT d'être
   * visible (c'est la condition pour que sa transition d'entrée ait un état de
   * départ), et il lui faut une annonce à afficher dès ce moment-là.
   *
   * Rien de tout cela ne dépend du navigateur : le serveur rend exactement la
   * même carte, invisible, avec la même annonce. Aucun désaccord d'hydratation
   * possible — ce qui compte, l'accueil étant PRÉ-RENDU À LA CONSTRUCTION.
   */
  const [index, setIndex] = useState(ANNONCES.length - 1);
  const [visible, setVisible] = useState(false);
  const [ferme, setFerme] = useState(false);
  const [enPause, setEnPause] = useState(false);

  const sansMouvement = useSyncExternalStore(
    sAbonnerAuMouvement,
    lireLeMouvement,
    () => false
  );

  /** Faux dès la première annonce passée — sert à distinguer les deux délais. */
  const premierPassage = useRef(true);

  /**
   * La rotation, en UNE minuterie qui se replante à chaque bascule.
   *
   * Un `setInterval` aurait demandé de loger deux durées différentes dans un
   * même battement, et se serait désynchronisé au premier rendu manqué.
   *
   * `prefers-reduced-motion` ne se contente pas ici de raccourcir une
   * animation. La règle globale de `globals.css` ramène déjà les transitions à
   * zéro, mais du contenu qui se remplace tout seul indéfiniment RESTE du
   * mouvement, et c'est précisément ce que la préférence demande d'éviter. La
   * minuterie n'est alors jamais posée — et ce qui s'affiche est DÉDUIT plus
   * bas, sans écrire dans l'état : un effet qui appelle `setState` refait un
   * rendu pour rien, et la règle `react-hooks/set-state-in-effect` le refuse.
   */
  useEffect(() => {
    if (ferme || sansMouvement) return;

    // Le survol suspend : un mouvement perpétuel qu'on ne peut pas figer
    // empêche de lire ce qu'il transporte. Même raison que `.animate-bandeau`.
    if (enPause) return;

    const delai = visible
      ? DUREE_VISIBLE
      : premierPassage.current
        ? DELAI_INITIAL
        : DUREE_PAUSE;

    const minuterie = setTimeout(() => {
      if (visible) {
        setVisible(false);
        return;
      }
      premierPassage.current = false;
      setIndex((i) => (i + 1) % ANNONCES.length);
      setVisible(true);
    }, delai);

    return () => clearTimeout(minuterie);
  }, [ferme, visible, enPause, sansMouvement]);

  if (ferme) return null;

  /**
   * En mouvement réduit, ce qui s'affiche est DÉDUIT et non stocké : la
   * PREMIÈRE annonce, posée, définitivement.
   *
   * `index` démarre sur la dernière du tableau — c'est ce qui fait retomber le
   * premier incrément sur zéro. Une version antérieure figeait donc « Aïcha
   * S. », la sixième, en mouvement réduit : personne ne l'avait décidé, et
   * seule la mesure l'a montré. D'où le contrôle qui vérifie que c'est bien la
   * première (`npm run verif:annonces`).
   */
  const annonce = sansMouvement ? ANNONCES[0] : ANNONCES[index];
  const affichee = sansMouvement || visible;

  return (
    /*
     * `fixed`, et non posée au bas d'une section : la vignette doit suivre le
     * lecteur pendant qu'il descend, sinon elle ne joue plus aucun rôle passé
     * le premier écran.
     *
     * 19 rem, et c'est MESURÉ, pas estimé. La première version faisait 17 rem
     * et disait « Awa K. vient de créer son com… » : la pastille, les écarts et
     * le bouton de fermeture prennent près de la moitié de la largeur, et il ne
     * restait pas les 166 px que cette ligne demandait. Une vignette dont on ne
     * peut pas lire la phrase ne sert à rien du tout.
     *
     * Deux choses ont été corrigées ensemble, parce qu'une seule ne suffisait
     * pas : la carte s'est élargie, ET la phrase s'est raccourcie en « vient de
     * s'inscrire ». Le bouton de fermeture devait en effet passer à 44 px pour
     * respecter le §74, ce qui reprenait d'une main la largeur gagnée de
     * l'autre. C'est `verif:responsive` qui a relevé le bouton trop petit, et
     * un contrôle dédié qui mesure les six annonces, à 1280 et à 320 px.
     *
     * Le `truncate` reste malgré tout, en dernier recours : le jour où la
     * source deviendra la base, un nom plus long arrivera, et mieux vaut une
     * coupure nette qu'une carte qui change de hauteur à chaque annonce.
     *
     * `max-w-[calc(100vw-2rem)]` : à 320 px, une carte de 19 rem dépasserait.
     * Un élément `fixed` n'allonge pas la page — le §8 n'est donc pas en
     * cause — mais il serait coupé par le bord, ce qui n'est pas mieux.
     *
     * La transition porte l'opacité ET le déplacement, avec la détente
     * `cubic-bezier(.16, 1, .3, 1)` relevée sur saspay.me : elle dépasse
     * légèrement puis se pose, et la vignette paraît obéir à une matière.
     * C'est une TRANSITION et non une animation par images clés, parce qu'il
     * faut la même chose à l'aller et au retour — une animation aurait demandé
     * un second jeu d'images clés pour la sortie.
     */
    <div
      className={`fixed bottom-4 left-4 z-50 w-[19rem] max-w-[calc(100vw-2rem)] transition-all duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        affichee
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0"
      }`}
      onMouseEnter={() => setEnPause(true)}
      onMouseLeave={() => setEnPause(false)}
    >
      {/* `pr-2` et non `pr-3` : le bouton de fermeture fait maintenant 44 px et
          porte déjà son propre air à l'intérieur. Garder la même marge des deux
          côtés aurait pris huit pixels sur la ligne de texte, qui n'en a pas. */}
      <div className="ombre-flottante flex items-center gap-3 rounded-2xl border border-brand-border/70 bg-white/95 p-3 pr-2 backdrop-blur-sm">
        {/*
         * La pastille est du violet de la marque, exactement celui des cartes
         * de « Comment ça marche » : c'est la même famille d'objet, elle n'a
         * aucune raison d'avoir sa propre couleur.
         */}
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand"
        >
          <Icone nom={annonce.icone} className="h-4 w-4 text-white" />
        </span>

        {/*
         * `aria-hidden` sur le TEXTE seulement.
         *
         * Un contenu qui se remplace toutes les huit secondes, annoncé à chaque
         * fois, coupe la parole à un lecteur d'écran en pleine lecture de la
         * page. Ce sont des illustrations : elles n'apportent rien qui ne soit
         * dit ailleurs. Le bouton de fermeture, lui, reste annoncé — il n'est
         * pas dans ce bloc.
         */}
        <div aria-hidden="true" className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-bold leading-tight text-heading">
            <span className="truncate">{annonce.titre}</span>
            {/*
             * La mention « exemple », même sur le poste.
             *
             * La garde d'environnement empêche déjà la publication. Mais un
             * garde-fou qu'on ne voit pas n'en est pas un : pendant une
             * démonstration l'écran est partagé, et personne ne doit prendre
             * ces lignes pour de vraies inscriptions. C'est la règle déjà posée
             * pour les témoignages d'exemple, et elle vaut ici pour la même
             * raison.
             *
             * DORÉE, et c'est la seule chose de cette vignette qui ne soit pas
             * violette. Ce n'est pas une entorse à l'unité de teinte : l'or est
             * la couleur d'ACCENT de KOLI, celle des mentions « mode test » et
             * de la pastille « exemple » des témoignages (même page, plus bas).
             * Une pastille violette se fondrait dans la carte — et un
             * avertissement qui se fond dans ce qu'il avertit n'avertit plus.
             */}
            <span className="shrink-0 rounded-full bg-gold-soft px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-gold-deep">
              exemple
            </span>
          </p>
          <p className="mt-0.5 truncate text-[11px] leading-tight text-ink-muted">
            {annonce.detail}
          </p>
        </div>

        {/*
         * WCAG 2.2.2 : un contenu qui se met à jour seul au-delà de cinq
         * secondes doit pouvoir être arrêté, mis en pause ou MASQUÉ. Le survol
         * met en pause, ce bouton masque — et il masque pour de bon : la
         * vignette ne revient pas d'elle-même.
         */}
        {/*
         * 44 px, et non la taille de la croix qu'il porte.
         *
         * Il faisait 28 px — la largeur du pictogramme plus un peu d'air — et
         * `verif:responsive` l'a refusé : le §74 impose 44 px de cible tactile,
         * parce qu'un doigt n'est pas un curseur. Sur une carte qui vient
         * justement se poser en bas de l'écran, à portée du pouce, une croix
         * qu'on rate deux fois sur trois est pire que pas de croix du tout.
         *
         * La croix, elle, reste petite : c'est la ZONE qui grandit, pas le
         * dessin. Le rond de survol suit la zone, et ne se voit qu'au survol.
         */}
        <button
          type="button"
          onClick={() => setFerme(true)}
          aria-label="Masquer les annonces d'activité"
          className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-brand-soft hover:text-brand"
        >
          <Icone nom="fermer" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
