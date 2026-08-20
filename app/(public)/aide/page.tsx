import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Aide",
  description: "Questions fréquentes sur le fonctionnement de KOLI.",
};

const questions = [
  {
    q: "Quand le vendeur reçoit-il mon argent ?",
    r: "Seulement après que vous ayez confirmé avoir reçu votre commande. Tant que vous n'avez pas validé, le paiement reste bloqué.",
  },
  {
    q: "Qu'est-ce que le code de réception ?",
    r: "C'est un code à 4 chiffres qui n'apparaît que sur votre page de commande. Le livreur vous le demande au moment de la remise : c'est ce qui prouve que le colis vous a bien été remis, à vous.",
  },
  {
    q: "Dois-je créer un compte pour payer ?",
    r: "Non, vous pouvez payer directement depuis le lien reçu. En revanche, un compte est nécessaire pour confirmer la réception : c'est ce qui garantit que personne d'autre que vous ne peut valider à votre place.",
  },
  {
    q: "Et si je ne reçois jamais le colis ?",
    r: "Ne confirmez pas la réception. Le paiement reste bloqué. La procédure de litige permettra de faire examiner la situation.",
  },
  {
    q: "Pourquoi vois-je la mention « mode test » ?",
    r: "KOLI est en cours de développement. Aucun paiement réel n'est effectué pour l'instant : les montants affichés sont simulés.",
  },
];

export default function AidePage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center min-h-[44px] text-sm font-semibold text-emerald-700 dark:text-emerald-400"
      >
        ← Retour à l&apos;accueil
      </Link>

      <h1 className="mt-4 text-3xl sm:text-4xl font-black tracking-tight">
        Aide
      </h1>

      <dl className="mt-10 space-y-4">
        {questions.map((item) => (
          <div
            key={item.q}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6"
          >
            <dt className="font-bold">{item.q}</dt>
            <dd className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
              {item.r}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-10 text-sm text-slate-600 dark:text-slate-400">
        Vous ne trouvez pas votre réponse ?
      </p>
      <Link
        href="/comment-ca-marche"
        className="inline-flex items-center min-h-[44px] mt-1 font-semibold text-sm text-emerald-700 dark:text-emerald-400 underline underline-offset-4"
      >
        Consultez le fonctionnement détaillé
      </Link>
    </main>
  );
}
