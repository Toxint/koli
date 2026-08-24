import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { espaceParDefaut } from "@/lib/auth/dashboards";
import {
  googleEstConfigure,
  googleUtilisableDepuis,
  origineDepuisEnTetes,
} from "@/lib/auth/google";
import { headers } from "next/headers";
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

export default async function PageConnexion() {
  // « Vous etes deja connecte » se decide ICI et non dans le middleware.
  //
  // `getCurrentUser()` lit la base : si le compte a disparu, il renvoie null et
  // le formulaire s'affiche normalement. Le middleware, lui, ne verifiait que
  // la signature du cookie et renvoyait vers le tableau de bord, qui renvoyait
  // vers la connexion, qui renvoyait vers le tableau de bord — boucle infinie
  // et page blanche pour tout utilisateur dont le compte n'existe plus.
  const utilisateur = await getCurrentUser();
  if (utilisateur) {
    redirect(espaceParDefaut(utilisateur.role));
  }

  // Google ne peut pas aboutir depuis une adresse reseau privee : le dire
  // plutot que d'afficher un bouton qui mene a une impasse (voir
  // `googleUtilisableDepuis`).
  const googleUtilisable = googleUtilisableDepuis(
    origineDepuisEnTetes(await headers())
  );
  const motifGoogle = googleEstConfigure() ? "adresse" : "configuration";

  return (
    // `Suspense` est requis : `useSearchParams` suspend le rendu, et Next
    // refuse de prerendre une page qui l'utilise sans limite de suspension.
    <Suspense fallback={null}>
      <FormulaireConnexion googleConfigure={googleUtilisable}
        motifGoogle={motifGoogle} />
    </Suspense>
  );
}
