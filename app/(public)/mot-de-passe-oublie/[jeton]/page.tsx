import Link from "next/link";
import { AuthHeader } from "@/components/ui/AuthHeader";
import { jetonEstValideAction } from "@/lib/auth/reinitialisation";
import { FormulaireNouveauMotDePasse } from "@/components/domain/FormulaireNouveauMotDePasse";

/** §62 — choix du nouveau mot de passe apres avoir suivi le lien. */
export const dynamic = "force-dynamic";

export default async function PageNouveauMotDePasse({
  params,
}: {
  params: Promise<{ jeton: string }>;
}) {
  const { jeton } = await params;

  // On verifie AVANT d'afficher le formulaire : laisser saisir un mot de passe
  // pour n'annoncer qu'ensuite que le lien a expire fait perdre le travail de
  // l'utilisateur pour rien.
  const valide = await jetonEstValideAction(jeton);

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <AuthHeader
          title="Nouveau mot de passe"
          subtitle="Choisissez le mot de passe qui protegera votre compte KOLI"
        />

        <div className="bg-white shadow-xl shadow-slate-200/50 border border-hairline/80 rounded-2xl p-6 sm:p-8">
          {valide ? (
            <FormulaireNouveauMotDePasse jeton={jeton} />
          ) : (
            <div className="space-y-4 text-center">
              <p role="alert" className="text-sm font-medium text-danger">
                Ce lien n&apos;est plus valide.
              </p>
              <p className="text-xs text-ink-muted">
                Les liens de reinitialisation expirent au bout de 30 minutes et
                ne servent qu&apos;une fois.
              </p>
              <Link
                href="/mot-de-passe-oublie"
                className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-2xl bg-brand text-white font-semibold text-sm"
              >
                Demander un nouveau lien
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
