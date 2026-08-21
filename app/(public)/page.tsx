import Link from "next/link";

const etapes = [
  {
    numero: "1",
    titre: "Commandez",
    texte: "Le vendeur vous envoie un lien de paiement KOLI sur WhatsApp, Instagram ou ailleurs.",
    emoji: "🛍️",
  },
  {
    numero: "2",
    titre: "Payez",
    texte: "Vous réglez via le lien. KOLI conserve le montant : le vendeur n'est pas encore payé.",
    emoji: "🔒",
  },
  {
    numero: "3",
    titre: "Recevez",
    texte: "Le livreur vous remet le colis et vous demande votre code de réception.",
    emoji: "📦",
  },
  {
    numero: "4",
    titre: "Validez",
    texte: "Vous confirmez avoir bien reçu votre commande. C'est seulement là que le vendeur est payé.",
    emoji: "✅",
  },
];

const canaux = ["WhatsApp", "Facebook", "TikTok", "Instagram", "Votre site"];

export default function AccueilPage() {
  return (
    <div className="min-h-screen bg-cream text-brand dark:text-white">
      {/* Bandeau mode test (§75) — visible a toutes les tailles d'ecran */}
      <div className="bg-brand-soft dark:bg-amber-950/70 text-brand dark:text-amber-200 text-center text-xs font-semibold px-4 py-2 border-b border-brand-border/60 dark:border-amber-800">
        ⚡ KOLI fonctionne actuellement en mode test. Aucun paiement réel n&apos;est effectué.
      </div>

      {/* En-tete (§59) */}
      <header className="border-b border-hairline dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link
            href="/"
            aria-label="Accueil KOLI"
            className="flex items-center gap-2 shrink-0 min-h-[44px]"
          >
            <span className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center text-white font-bold text-lg">
              K
            </span>
            <span className="font-bold text-xl tracking-tight">KOLI</span>
          </Link>

          {/* Sur mobile on ne garde que les deux actions ; les rubriques
              editoriales restent atteignables depuis le corps de page et le
              pied de page (elles etaient auparavant simplement inaccessibles
              sous 768px). */}
          <nav className="flex items-center gap-1 sm:gap-2 min-w-0">
            <Link
              href="/comment-ca-marche"
              className="hidden lg:inline-flex items-center min-h-[44px] px-3 text-sm font-medium text-ink-muted dark:text-slate-300 hover:text-brand dark:hover:text-emerald-400"
            >
              Comment ça marche
            </Link>
            <Link
              href="/pour-les-vendeurs"
              className="hidden lg:inline-flex items-center min-h-[44px] px-3 text-sm font-medium text-ink-muted dark:text-slate-300 hover:text-brand dark:hover:text-emerald-400"
            >
              Pour les vendeurs
            </Link>
            <Link
              href="/connexion"
              className="inline-flex items-center min-h-[44px] px-2 sm:px-3 text-sm font-semibold text-brand dark:text-slate-200 hover:text-brand dark:hover:text-emerald-400 whitespace-nowrap"
            >
              Connexion
            </Link>
            <Link
              href="/inscription"
              className="inline-flex items-center min-h-[44px] px-3 sm:px-4 rounded-xl bg-brand hover:bg-brand-strong text-white text-sm font-bold transition-colors whitespace-nowrap"
            >
              <span className="sm:hidden">S&apos;inscrire</span>
              <span className="hidden sm:inline">Créer un compte</span>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero (§59) */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 lg:py-24 text-center">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
            Achetez. Recevez. Validez.
          </h1>
          <p className="mt-5 text-base sm:text-lg text-ink-muted dark:text-slate-300 max-w-2xl mx-auto">
            KOLI sécurise vos achats en ligne et facilite les transactions entre
            clients et vendeurs.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/inscription"
              className="inline-flex items-center justify-center min-h-[48px] px-8 rounded-2xl bg-brand hover:bg-brand-strong text-white font-bold transition-colors"
            >
              Commencer
            </Link>
            <Link
              href="/pour-les-vendeurs"
              className="inline-flex items-center justify-center min-h-[48px] px-8 rounded-2xl border border-hairline dark:border-slate-700 hover:bg-white dark:hover:bg-slate-900 font-bold transition-colors"
            >
              Je suis vendeur
            </Link>
          </div>
        </section>

        {/* Comment ca marche (§60) */}
        <section className="bg-white/60 dark:bg-slate-900/50 border-y border-hairline dark:border-slate-800">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
            <h2 className="text-2xl sm:text-3xl font-bold text-center">
              Comment ça marche
            </h2>

            <ol className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {etapes.map((etape) => (
                <li
                  key={etape.numero}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-hairline dark:border-slate-800 p-6"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-8 h-8 rounded-full bg-brand text-white font-bold text-sm flex items-center justify-center shrink-0">
                      {etape.numero}
                    </span>
                    <span className="text-2xl" aria-hidden="true">
                      {etape.emoji}
                    </span>
                  </div>
                  <h3 className="font-bold text-lg">{etape.titre}</h3>
                  <p className="mt-1.5 text-sm text-ink-muted dark:text-slate-300">
                    {etape.texte}
                  </p>
                </li>
              ))}
            </ol>

            <p className="mt-10 text-center text-sm sm:text-base text-ink-muted dark:text-slate-300 max-w-2xl mx-auto">
              Le paiement est sécurisé jusqu&apos;à la confirmation de réception
              selon les règles applicables.
            </p>

            <div className="mt-6 text-center">
              <Link
                href="/comment-ca-marche"
                className="inline-flex items-center min-h-[44px] px-4 text-sm font-semibold text-brand dark:text-emerald-400 underline underline-offset-4"
              >
                En savoir plus sur le fonctionnement
              </Link>
            </div>
          </div>
        </section>

        {/* Pour les vendeurs (§61) */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">
            Vendez sur WhatsApp, Facebook, TikTok, Instagram ou votre propre
            site.
          </h2>
          <p className="mt-4 text-base text-ink-muted dark:text-slate-300 max-w-2xl mx-auto">
            KOLI ne remplace pas votre façon de vendre. Vous continuez là où
            vous êtes déjà — KOLI sécurise le paiement et la livraison.
          </p>

          <ul className="mt-8 flex flex-wrap gap-2 justify-center">
            {canaux.map((canal) => (
              <li
                key={canal}
                className="px-4 py-2 rounded-full bg-brand-soft dark:bg-slate-800 text-sm font-semibold"
              >
                {canal}
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <Link
              href="/inscription"
              className="inline-flex items-center justify-center min-h-[48px] px-8 rounded-2xl bg-brand hover:bg-brand-strong text-white font-bold transition-colors"
            >
              Créer mon compte vendeur
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-ink-muted">
          <span>© {new Date().getFullYear()} KOLI — Mode test</span>
          <nav className="flex flex-wrap gap-x-2 gap-y-1 justify-center">
            <Link
              href="/aide"
              className="inline-flex items-center min-h-[44px] px-2 hover:text-brand dark:hover:text-emerald-400"
            >
              Aide
            </Link>
            <Link
              href="/conditions"
              className="inline-flex items-center min-h-[44px] px-2 hover:text-brand dark:hover:text-emerald-400"
            >
              Conditions
            </Link>
            <Link
              href="/confidentialite"
              className="inline-flex items-center min-h-[44px] px-2 hover:text-brand dark:hover:text-emerald-400"
            >
              Confidentialité
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
