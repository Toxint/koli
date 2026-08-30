import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { espaceParDefaut } from "@/lib/auth/dashboards";
import {
  googleEstConfigure,
  googleUtilisableDepuis,
  origineDepuisEnTetes,
} from "@/lib/auth/google";
import { headers } from "next/headers";
import { lireInvitationAction } from "@/lib/drivers/invitations";
import { FormulaireInscription } from "@/components/domain/FormulaireInscription";

/** Voir /connexion : la configuration Google se lit a la demande, pas au build. */
export const dynamic = "force-dynamic";

export default async function PageInscription({
  searchParams,
}: {
  searchParams: Promise<{ invitation?: string }>;
}) {
  // Voir /connexion : la verification passe par la base, pas par le seul
  // cookie, sans quoi un compte supprime enferme l'utilisateur dans une
  // boucle de redirections.
  const utilisateur = await getCurrentUser();
  if (utilisateur) {
    redirect(espaceParDefaut(utilisateur.role));
  }

  /*
   * L'invitation d'un vendeur a ses livreurs (§5.3).
   *
   * Elle est lue ICI, au rendu serveur, et non par le formulaire : le nom de la
   * boutique doit s'afficher AVANT que le livreur ne remplisse quoi que ce
   * soit. Un lien qui ne dit qu'apres coup a qui il rattache demande de faire
   * confiance a l'aveugle — sur une application qui vend la confiance, ce
   * serait particulierement mal choisi.
   *
   * `invitationRefusee` distingue les deux echecs possibles pour l'ecran : pas
   * de jeton du tout (inscription ordinaire), ou un jeton qui ne vaut plus rien
   * (perime, revoque, inconnu). Le second merite d'etre dit, sans quoi le
   * livreur croirait avoir rejoint une equipe qu'il n'a pas rejointe.
   */
  const { invitation: jeton } = await searchParams;
  const invitation = jeton ? await lireInvitationAction(jeton) : null;
  const invitationRefusee = Boolean(jeton) && invitation === null;

  // Google ne peut pas aboutir depuis une adresse reseau privee : le dire
  // plutot que d'afficher un bouton qui mene a une impasse (voir
  // `googleUtilisableDepuis`).
  const googleUtilisable = googleUtilisableDepuis(
    origineDepuisEnTetes(await headers())
  );
  const motifGoogle = googleEstConfigure() ? "adresse" : "configuration";

  return (
    <FormulaireInscription
      googleConfigure={googleUtilisable}
      motifGoogle={motifGoogle}
      invitation={
        invitation && jeton
          ? { jeton, boutique: invitation.boutique }
          : null
      }
      invitationRefusee={invitationRefusee}
    />
  );
}
