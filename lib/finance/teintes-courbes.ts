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
 * Il n'y a donc plus qu'une constante, et c'est volontaire : deux exports
 * finiraient par diverger, et le mélange reviendrait par la porte de derrière.
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
