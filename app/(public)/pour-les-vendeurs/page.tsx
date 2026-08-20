import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pour les vendeurs",
  description:
    "Vendez sur WhatsApp, Facebook, TikTok, Instagram ou votre propre site. KOLI sécurise le paiement et la livraison.",
};

const arguments_ = [
  {
    emoji: "📱",
    titre: "Vous gardez votre façon de vendre",
    texte:
      "KOLI ne remplace pas votre boutique ni vos réseaux. Vous continuez à vendre là où vous êtes déjà — WhatsApp, Facebook, TikTok, Instagram ou votre site.",
  },
  {
    emoji: "🔗",
    titre: "Un lien de paiement par commande",
    texte:
      "Vous créez la commande, KOLI génère un lien. Vous l'envoyez au client comme n'importe quel message.",
  },
  {
    emoji: "🛡️",
    titre: "Le client est rassuré, donc il achète",
    texte:
      "Le client sait que son argent ne part chez vous qu'une fois le colis reçu. C'est ce qui débloque les ventes auprès de gens qui ne vous connaissent pas encore.",
  },
  {
    emoji: "📦",
    titre: "Livraison suivie et vérifiée",
    texte:
      "Vous assignez un livreur. La remise est confirmée par un code que seul le client possède — vous avez une preuve, pas une parole.",
  },
];

export default function PourLesVendeursPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center min-h-[44px] text-sm font-semibold text-brand dark:text-emerald-400"
      >
        ← Retour à l&apos;accueil
      </Link>

      <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
        Vendez sur WhatsApp, Facebook, TikTok, Instagram ou votre propre site.
      </h1>
      <p className="mt-4 text-base text-ink-muted dark:text-slate-300">
        KOLI est l&apos;infrastructure de confiance qui se place entre vous et
        vos clients : paiement sécurisé, livraison vérifiée, litiges encadrés.
      </p>

      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {arguments_.map((a) => (
          <section
            key={a.titre}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-hairline dark:border-slate-800 p-6"
          >
            <span className="text-2xl block mb-2" aria-hidden="true">
              {a.emoji}
            </span>
            <h2 className="font-bold">{a.titre}</h2>
            <p className="mt-1.5 text-sm text-ink-muted dark:text-slate-300">
              {a.texte}
            </p>
          </section>
        ))}
      </div>

      <div className="mt-10">
        <Link
          href="/inscription"
          className="inline-flex items-center justify-center w-full sm:w-auto min-h-[48px] px-8 rounded-2xl bg-brand hover:bg-brand-strong text-white font-bold transition-colors"
        >
          Créer mon compte vendeur
        </Link>
      </div>
    </main>
  );
}
