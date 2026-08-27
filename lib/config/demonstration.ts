/**
 * Les raccourcis « comptes de test » doivent-ils s'afficher ?
 *
 * La page de connexion propose quatre boutons qui remplissent l'identifiant
 * d'un compte de démonstration — dont l'**administrateur** — et affiche le mot
 * de passe commun en clair juste en dessous.
 *
 * C'est excellent en développement : on bascule d'un rôle à l'autre en un clic,
 * et un test qui doit deviner un mot de passe ne teste plus rien.
 *
 * En ligne, c'est une porte d'entrée. Même une fois les mots de passe changés,
 * ces boutons annoncent publiquement que `admin@koli.ci` existe — ce qui suffit
 * à orienter une attaque.
 *
 * **La consigne est donc inversée : masqués par défaut, affichés sur demande
 * expresse.** Une variable oubliée sur l'hébergeur ne peut alors que les
 * masquer. L'inverse — visibles sauf mention contraire — aurait fait dépendre
 * la sécurité d'un geste dont personne ne se souvient au bon moment.
 *
 * `NODE_ENV` ne convient pas pour trancher : le serveur de développement de ce
 * projet tourne avec `next start`, qui impose `NODE_ENV=production`. Les
 * raccourcis auraient disparu de la machine où ils servent.
 */
export function raccourcisDemoActifs(): boolean {
  return process.env.RACCOURCIS_DEMO === "1";
}

/**
 * Les témoignages d'EXEMPLE peuvent-ils s'afficher ?
 *
 * Ils servent à juger du rendu de la section avant d'avoir recueilli de vrais
 * avis. Publiés, ce seraient de faux témoignages — des phrases attribuées à
 * des gens qui ne les ont pas dites.
 *
 * **Deux gardes, et la seconde a été apprise à la dure.**
 *
 * `RACCOURCIS_DEMO` seul ne suffit PAS. La page d'accueil est *pré-rendue à la
 * construction* : ses variables d'environnement sont lues UNE FOIS, au build,
 * et le résultat est figé dans le HTML servi. Construite sur un poste où la
 * variable vaut `1`, la page emporte les exemples — et les affiche en ligne
 * quoi qu'on règle ensuite sur l'hébergeur.
 *
 * C'est exactement le piège que `app/(public)/connexion/page.tsx` documente
 * pour le bouton Google, et il a été retrouvé ici en vérifiant.
 *
 * `VERCEL` est posée par l'hébergeur PENDANT la construction. La contrôler
 * décide donc au bon moment : une page bâtie sur Vercel ne peut pas contenir
 * les exemples, même si `RACCOURCIS_DEMO` y était renseignée par erreur.
 *
 * L'autre remède aurait été `dynamic = "force-dynamic"` sur l'accueil, mais
 * rendre une page vitrine à chaque visite pour cacher quatre exemples est un
 * prix disproportionné.
 */
export function exemplesTemoignagesAutorises(): boolean {
  if (process.env.VERCEL) return false;
  return raccourcisDemoActifs();
}
