/**
 * QUAND REESSAYER, et quand renoncer.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Separe de l'expedition parce que c'est une REGLE, pas un transport :    │
 * │  aucune base, aucun reseau, aucune clef.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Meme raison que `textes.ts` : `courriel.ts` importe `prisma`, qui exige
 * `DATABASE_URL` au chargement. Une regle qu'on ne peut pas eprouver sans base
 * est une regle qu'on n'eprouve pas — et celle-ci decide si l'annonce d'une
 * vente est reessayee ou jetee.
 */

/**
 * Au-delà, on renonce — et on le DIT dans le registre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Sans plafond, un echec restait `sentAt = null` et repassait a chaque    │
 * │  tour, indefiniment.                                                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La file lit les lignes les plus anciennes, vingt-cinq a la fois : vingt-cinq
 * lignes definitivement en echec occupaient donc toute la fournee, et plus
 * aucune vente n'etait annoncee. Sans erreur, sans ecran, sans rien.
 *
 * Huit et non trois : le compteur monte a chaque TENTATIVE, et une panne chez
 * le prestataire pendant une heure chargee en brulerait plusieurs pour rien.
 */
export const TENTATIVES_MAX = 8;

/**
 * Ce refus se reproduira-t-il a l'identique ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Reessayer une clef invalide huit fois, c'est huit fois trop.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le statut HTTP le dit, et c'est plus juste qu'un compteur aveugle :
 *
 *   · **4xx — la demande est fautive.** Clef revoquee (401), domaine non
 *     autorise (403), adresse illisible (422). Le temps n'y changera rien :
 *     on marque la ligne et la file avance.
 *   · **429 — trop vite.** C'est la seule 4xx qui guerit toute seule ;
 *     Resend en accorde dix par seconde, et la boucle peut les depasser.
 *   · **5xx, coupure, delai** — chez eux ou entre eux et nous. On repasse.
 */
export function refusDefinitif(statut: number): boolean {
  return statut >= 400 && statut < 500 && statut !== 429;
}
