import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { espaceParDefaut } from "@/lib/auth/dashboards";
import {
  googleEstConfigure,
  googleUtilisableDepuis,
  origineDepuisEnTetes,
} from "@/lib/auth/google";
import { headers } from "next/headers";
import { FormulaireInscription } from "@/components/domain/FormulaireInscription";

/** Voir /connexion : la configuration Google se lit a la demande, pas au build. */
export const dynamic = "force-dynamic";

export default async function PageInscription() {
  // Voir /connexion : la verification passe par la base, pas par le seul
  // cookie, sans quoi un compte supprime enferme l'utilisateur dans une
  // boucle de redirections.
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

  return <FormulaireInscription googleConfigure={googleUtilisable}
        motifGoogle={motifGoogle} />;
}
