import { googleEstConfigure } from "@/lib/auth/google";
import { FormulaireInscription } from "@/components/domain/FormulaireInscription";

/** Voir /connexion : la configuration Google se lit a la demande, pas au build. */
export const dynamic = "force-dynamic";

/**
 * Page serveur : elle seule peut lire la configuration Google, qui vit dans
 * des variables d'environnement serveur.
 */
export default function PageInscription() {
  return <FormulaireInscription googleConfigure={googleEstConfigure()} />;
}
