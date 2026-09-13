/**
 * Teinte des courbes de performance — UNE seule, le violet de la marque.
 *
 * Elles ont été vertes, à deux profondeurs : celle du vendeur et celle du
 * livreur. L'intention était bonne — deux clartés très écartées se départagent
 * même en vision daltonienne — mais elle répondait à un problème qui n'existe
 * pas : les deux courbes ne se rencontrent JAMAIS sur un même écran. Le vendeur
 * a la sienne, le livreur la sienne, et personne n'a les deux sous les yeux.
 *
 * Ce qui existait, en revanche, c'est le mélange : une courbe verte, un dégradé
 * or dans les pastilles, du violet dans les titres — trois familles pour une
 * même page. Une interface qui change de couleur d'un bloc à l'autre ne dit
 * rien de plus, elle dit seulement qu'aucune décision n'a été prise.
 *
 * Il n'y a donc plus qu'une constante PAR SÉRIE, et c'est volontaire : des
 * teintes éparpillées dans les pages finiraient par diverger, et le mélange
 * reviendrait par la porte de derrière.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  #5b1348 = --color-brand. Ce n'est pas une copie de la valeur, c'est  │
 * │  la MÊME. Si le violet de la marque bouge dans `app/globals.css`,     │
 * │  celle-ci bouge avec — sinon la courbe trahit la page qui la porte.   │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Pourquoi une valeur littérale et non `var(--color-brand)` : la couleur part
 * aussi dans les `<stop>` d'un dégradé SVG construit au rendu SERVEUR, où
 * aucune variable CSS n'est encore résolue.
 *
 * Contraste mesuré sur le blanc des cartes : **12,9:1**. Le seuil des éléments
 * graphiques est de 3:1 — on est très au-dessus, ce qui autorise justement le
 * trait FIN que demande le dessin (voir `CourbePerformance`). Le vert clair du
 * livreur tenait 3,5:1 : à un pixel et demi, il aurait disparu.
 */
export const TEINTE_COURBE = "#5b1348";

/**
 * La teinte de la SECONDE série — l'or de la marque, en version lisible.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Deux courbes sur un même cadre demandent deux FAMILLES de couleur, pas │
 * │  deux profondeurs de la même.                                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La seconde série a d'abord porté `--color-menu-deep` (#260819) — un violet
 * presque noir. Sur le violet de la marque, l'œil ne lisait qu'un seul trait
 * un peu plus sombre par endroits : la légende annonçait deux mesures qu'on ne
 * distinguait pas. Ce n'est pas une question de clarté, c'est une question de
 * TEINTE : deux valeurs d'un même violet se lisent comme une ombre, pas comme
 * deux séries.
 *
 * L'or est ce que la palette réserve à l'accent (voir l'en-tête de
 * `app/globals.css`), et une seconde série est exactement cela : elle
 * accompagne la principale sans la concurrencer.
 *
 * ⚠ **C'est `--color-gold-deep`, jamais `--color-gold`.** L'or vif tient
 * **1,2:1** sur clair — la palette l'interdit formellement hors aplat. Sa
 * version profonde tient **6,3:1 sur le blanc des cartes**, très au-dessus des
 * 3:1 exigés d'un élément graphique, et au-dessus du 3,5:1 qui avait fait
 * écarter le vert clair du livreur comme trop pâle pour un trait fin.
 *
 * Même raison que ci-dessus pour la valeur littérale plutôt que
 * `var(--color-gold-deep)` : elle part dans des attributs SVG rendus côté
 * serveur, où aucune variable CSS n'est résolue.
 */
export const TEINTE_COURBE_SECONDE = "#7d5a12";
