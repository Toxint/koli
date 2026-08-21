import { Suspense } from "react";
import { googleEstConfigure } from "@/lib/auth/google";
import { FormulaireConnexion } from "@/components/domain/FormulaireConnexion";

/**
 * Rendu a la demande, et non pre-rendu au build.
 *
 * `googleEstConfigure()` lit des variables d'environnement SERVEUR. Sur une
 * page statique, elles sont lues UNE FOIS a la construction : un deploiement
 * bati sans identifiants Google n'aurait jamais affiche le bouton, meme apres
 * les avoir renseignes en production. Le defaut est invisible en local, ou
 * l'on reconstruit sans arret.
 */
export const dynamic = "force-dynamic";

/**
 * Page serveur : elle seule peut lire la configuration Google, qui vit dans
 * des variables d'environnement serveur. Le formulaire reste un composant
 * client pour la saisie et l'affichage des erreurs.
 *
 * `Suspense` est requis : `useSearchParams` suspend le rendu, et Next refuse
 * de prerendre une page qui l'utilise sans limite de suspension.
 */
export default function PageConnexion() {
  return (
    <Suspense fallback={null}>
      <FormulaireConnexion googleConfigure={googleEstConfigure()} />
    </Suspense>
  );
}
