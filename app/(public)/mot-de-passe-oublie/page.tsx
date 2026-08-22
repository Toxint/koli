import { AuthHeader } from "@/components/ui/AuthHeader";
import { FormulaireMotDePasseOublie } from "@/components/domain/FormulaireMotDePasseOublie";

/** §62 — « Mot de passe oublié ? » */
export const dynamic = "force-dynamic";

export default function PageMotDePasseOublie() {
  return (
    <div className="min-h-screen bg-cream flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <AuthHeader
          title="Mot de passe oublié"
          subtitle="Indiquez votre identifiant, nous vous envoyons de quoi en choisir un nouveau"
        />

        <div className="bg-white shadow-xl shadow-slate-200/50 border border-hairline/80 rounded-2xl p-6 sm:p-8">
          <FormulaireMotDePasseOublie />
        </div>
      </div>
    </div>
  );
}
