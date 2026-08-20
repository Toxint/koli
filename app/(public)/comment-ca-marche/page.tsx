import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Comment ça marche",
  description:
    "KOLI conserve le paiement jusqu'à ce que vous confirmiez avoir reçu votre commande.",
};

const etapes = [
  {
    numero: "1",
    titre: "Commandez",
    emoji: "🛍️",
    texte:
      "Le vendeur vous envoie un lien de paiement KOLI, sur WhatsApp, Instagram, Facebook ou par SMS. Vous y retrouvez le produit, le prix, les frais de livraison et votre adresse.",
  },
  {
    numero: "2",
    titre: "Payez",
    emoji: "🔒",
    texte:
      "Vous réglez via le lien. KOLI conserve le montant : le vendeur voit que la commande est payée, mais il ne reçoit pas encore l'argent.",
  },
  {
    numero: "3",
    titre: "Recevez",
    emoji: "📦",
    texte:
      "Le vendeur prépare le colis et le confie à un livreur. À la remise, le livreur vous demande le code de réception que vous seul possédez.",
  },
  {
    numero: "4",
    titre: "Validez",
    emoji: "✅",
    texte:
      "Vous confirmez avoir bien reçu votre commande. C'est seulement à ce moment-là que le vendeur est payé. Tant que vous n'avez pas validé, l'argent ne bouge pas.",
  },
];

export default function CommentCaMarchePage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center min-h-[44px] text-sm font-semibold text-brand dark:text-emerald-400"
      >
        ← Retour à l&apos;accueil
      </Link>

      <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
        Comment ça marche
      </h1>
      <p className="mt-4 text-base text-ink-muted dark:text-slate-300">
        KOLI se place entre l&apos;acheteur et le vendeur. Le paiement est
        conservé jusqu&apos;à ce que l&apos;acheteur confirme avoir reçu sa
        commande.
      </p>

      <ol className="mt-10 space-y-4">
        {etapes.map((etape) => (
          <li
            key={etape.numero}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-hairline dark:border-slate-800 p-6"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="w-8 h-8 rounded-full bg-brand text-white font-bold text-sm flex items-center justify-center shrink-0">
                {etape.numero}
              </span>
              <span className="text-2xl" aria-hidden="true">
                {etape.emoji}
              </span>
              <h2 className="font-bold text-lg">{etape.titre}</h2>
            </div>
            <p className="text-sm text-ink-muted dark:text-slate-300">
              {etape.texte}
            </p>
          </li>
        ))}
      </ol>

      <section className="mt-10 bg-brand-soft dark:bg-emerald-950/40 border border-brand-border dark:border-emerald-900 rounded-2xl p-6">
        <h2 className="font-bold text-lg">Et si quelque chose se passe mal ?</h2>
        <p className="mt-2 text-sm text-brand dark:text-slate-300">
          Si le colis n&apos;arrive pas, ou s&apos;il ne correspond pas à ce qui
          était annoncé, vous pouvez signaler un problème plutôt que de
          confirmer. Le paiement reste alors bloqué le temps que la situation
          soit examinée.
        </p>
      </section>

      <div className="mt-10 flex flex-col sm:flex-row gap-3">
        <Link
          href="/inscription"
          className="inline-flex items-center justify-center min-h-[48px] px-8 rounded-2xl bg-brand hover:bg-brand-strong text-white font-bold transition-colors"
        >
          Commencer
        </Link>
        <Link
          href="/pour-les-vendeurs"
          className="inline-flex items-center justify-center min-h-[48px] px-8 rounded-2xl border border-hairline dark:border-slate-700 font-bold transition-colors"
        >
          Je suis vendeur
        </Link>
      </div>
    </main>
  );
}
