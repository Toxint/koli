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
