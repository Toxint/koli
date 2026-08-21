import { redirect } from "next/navigation";
import { AuthHeader } from "@/components/ui/AuthHeader";
import { lireIdentiteEnAttente } from "@/lib/auth/googleInscription";
import { ComplementGoogle } from "@/components/domain/ComplementGoogle";

/**
 * Complement d'inscription apres un retour de Google.
 *
 * Sans identite en attente valide, il n'y a rien a completer : on renvoie au
 * formulaire de connexion plutot que d'afficher une page vide.
 */
export default async function PageComplementGoogle() {
  const identite = await lireIdentiteEnAttente();
  if (!identite) {
    redirect(
      `/connexion?erreur=${encodeURIComponent(
        "Votre session Google a expiré. Veuillez recommencer la connexion."
      )}`
    );
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <AuthHeader
          title="Plus qu'une étape"
          subtitle="Complétez votre profil pour finaliser la création de votre compte KOLI"
        />

        <div className="bg-white shadow-xl shadow-slate-200/50 border border-hairline/80 rounded-2xl p-6 sm:p-8">
          <ComplementGoogle nom={identite.nom} email={identite.email} />
        </div>
      </div>
    </div>
  );
}
