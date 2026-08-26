import Link from "next/link";
import { Icone } from "@/components/ui/Icone";

const etapes = [
  {
    numero: "1",
    titre: "Commandez",
    texte: "Le vendeur vous envoie un lien de paiement KOLI sur WhatsApp, Instagram ou ailleurs.",
    icone: "boutique" as const,
    // Progression de teintes qui suit le trajet de l'argent : du bordeaux
    // profond de la commande a l'or du versement final. La couleur porte
    // l'etape, elle ne decore pas.
    pastille: "bg-brand-strong",
  },
  {
    numero: "2",
    titre: "Payez",
    texte: "Vous réglez via le lien. KOLI conserve le montant : le vendeur n'est pas encore payé.",
    icone: "cadenas" as const,
    pastille: "bg-brand",
  },
  {
    numero: "3",
    titre: "Recevez",
    texte: "Le livreur vous remet le colis et vous demande votre code de réception.",
    icone: "colis" as const,
    pastille: "bg-brand-accent",
  },
  {
    numero: "4",
    titre: "Validez",
    texte: "Vous confirmez avoir bien reçu votre commande. C'est seulement là que le vendeur est payé.",
    icone: "valide" as const,
    pastille: "bg-gold-deep",
  },
];

const canaux = ["WhatsApp", "Facebook", "TikTok", "Instagram", "Votre site"];

export default function AccueilPage() {
  return (
    <div className="min-h-screen bg-cream text-brand dark:text-white">
      {/*
       * ════════════════════════════════════════════════════════════════
       * PREMIERE SECTION — barre flottante + accroche
       * ════════════════════════════════════════════════════════════════
       *
       * Le fond porte une trame de points tres pale. Une creme parfaitement
       * unie sur toute la hauteur d'un ecran parait vide ; la trame lui donne
       * une matiere qu'on ne remarque pas mais qui empeche le vide.
       *
       * `radial-gradient` plutot qu'une image : aucun fichier a telecharger,
       * et le motif reste net a tous les zooms.
       */}
      <div
        className="relative overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, color-mix(in srgb, var(--color-brand) 7%, transparent) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        {/* Halo dore tres dilue derriere le titre : rechauffe le centre sans
            jamais concurrencer le texte. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[860px] max-w-none -translate-x-1/2 opacity-70"
          style={{
            background:
              "radial-gradient(ellipse at center, color-mix(in srgb, var(--color-gold) 22%, transparent) 0%, transparent 68%)",
          }}
        />

        {/*
         * En-tete (§59) — barre flottante.
         *
         * Elle ne touche aucun bord : posee sur la creme comme une carte, elle
         * separe la navigation du contenu sans avoir besoin d'un filet. Une
         * barre pleine largeur collee en haut aurait coupe la page en deux et
         * ecrase la trame.
         *
         * `sticky` : elle reste accessible au defilement, ce qu'une barre
         * decorative ne ferait pas.
         */}
        <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 rounded-full border border-hairline/80 bg-white/90 pl-4 pr-2 shadow-sm backdrop-blur-md sm:h-16 sm:pl-5 sm:pr-3">
            <Link
              href="/"
              aria-label="Accueil KOLI"
              className="flex min-h-[44px] shrink-0 items-center gap-2"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white sm:h-9 sm:w-9">
                K
              </span>
              <span className="text-lg font-bold tracking-tight sm:text-xl">
                KOLI
              </span>
            </Link>

            {/* Les rubriques editoriales du §59, au centre. Sous 1024px elles
                cedent la place aux deux actions : elles restent atteignables
                depuis le corps de page et le pied de page. */}
            <nav
              aria-label="Navigation principale"
              className="hidden items-center gap-1 lg:flex"
            >
              <Link
                href="/comment-ca-marche"
                className="inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-cream hover:text-brand"
              >
                Comment ça marche
              </Link>
              <Link
                href="/pour-les-vendeurs"
                className="inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-cream hover:text-brand"
              >
                Pour les vendeurs
              </Link>
            </nav>

            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <Link
                href="/connexion"
                className="inline-flex min-h-[44px] items-center rounded-full px-3 text-sm font-semibold text-brand transition-colors hover:bg-cream sm:px-4"
              >
                Connexion
              </Link>
              <Link
                href="/inscription"
                className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full bg-brand px-4 text-sm font-bold text-white transition-colors hover:bg-brand-strong sm:px-5"
              >
                <span className="sm:hidden">S&apos;inscrire</span>
                <span className="hidden sm:inline">Créer un compte</span>
                <Icone nom="fleche-droite" className="hidden h-4 w-4 sm:block" />
              </Link>
            </div>
          </div>
        </header>

        <main>
          <section className="relative mx-auto max-w-5xl px-4 pb-16 pt-12 text-center sm:px-6 sm:pb-24 sm:pt-16 lg:pt-20">
            {/*
             * Pastille d'annonce (§75).
             *
             * Elle remplace le bandeau pleine largeur qui barrait le haut de la
             * page. L'obligation d'annoncer le mode test est la meme ; ce qui
             * change, c'est qu'elle est desormais LUE — un bandeau colle au
             * bord superieur est confondu avec un avertissement de navigateur
             * et saute aux yeux sans etre vu.
             *
             * Les trois pastilles rappellent les trois roles du parcours :
             * client, vendeur, livreur.
             */}
            <div className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-brand-border/70 bg-white/80 py-1.5 pl-2 pr-4 shadow-sm backdrop-blur-sm">
              <span aria-hidden="true" className="flex shrink-0 -space-x-2">
                {(["client", "boutique", "livreur"] as const).map((nom, i) => (
                  <span
                    key={nom}
                    className={`flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-white ${
                      ["bg-brand", "bg-brand-accent", "bg-gold-deep"][i]
                    }`}
                  >
                    <Icone nom={nom} className="h-3.5 w-3.5 text-white" />
                  </span>
                ))}
              </span>
              <span className="min-w-0 text-left text-[11px] font-semibold leading-tight text-brand sm:text-xs">
                Mode test — aucun paiement réel n&apos;est effectué
              </span>
            </div>

            {/*
             * L'accroche du §59, mot a mot.
             *
             * Un verbe par ligne : les trois temps du parcours se lisent comme
             * une progression, ce qu'une seule ligne ne montrait pas.
             *
             * `font-titre` (Inter) et non la police d'interface : a cette
             * taille, Jakarta paraissait molle. `leading-[0.92]` serre les
             * lignes en un bloc — c'est cette densite qui fait l'affiche.
             */}
            <h1 className="mt-7 font-titre text-[2.75rem] font-extrabold leading-[0.95] tracking-[-0.04em] text-brand-strong sm:mt-9 sm:text-7xl sm:leading-[0.92] lg:text-[5.5rem]">
              <span className="block">Achetez.</span>
              <span className="block">Recevez.</span>
              {/* Le seul mot en serif italique : c'est la validation du client
                  qui declenche le versement au vendeur. Tout le produit tient
                  dans ce mot. */}
              <span className="block font-accent font-normal italic tracking-[-0.01em] text-brand-accent">
                Validez.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed text-ink-muted sm:mt-8 sm:text-lg">
              KOLI sécurise vos achats en ligne et facilite les transactions
              entre clients et vendeurs.
            </p>

            <div className="mt-9 flex flex-col justify-center gap-3 sm:mt-10 sm:flex-row">
              <Link
                href="/inscription"
                className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-brand px-8 font-bold text-white shadow-sm transition-colors hover:bg-brand-strong"
              >
                Commencer
                <Icone nom="fleche-droite" className="h-4 w-4" />
              </Link>
              <Link
                href="/pour-les-vendeurs"
                className="inline-flex min-h-[52px] items-center justify-center rounded-full border border-brand-border bg-white/70 px-8 font-bold text-brand transition-colors hover:bg-white"
              >
                Je suis vendeur
              </Link>
            </div>
          </section>
        </main>
      </div>

      <main>
        {/* Comment ca marche (§60) */}
        <section className="bg-white/50 border-y" style={{ borderColor: "color-mix(in srgb, var(--color-brand) 12%, transparent)" }}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
            <h2 className="text-2xl sm:text-3xl font-bold text-center">
              Comment ça marche
            </h2>

            <ol className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {etapes.map((etape) => (
                <li
                  key={etape.numero}
                  className="carte-koli bg-white rounded-2xl p-6"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className={`w-8 h-8 rounded-full ${etape.pastille} text-white font-bold text-sm flex items-center justify-center shrink-0`}
                    >
                      {etape.numero}
                    </span>
                    <span className="text-2xl" aria-hidden="true">
                      <Icone nom={etape.icone} className="w-6 h-6 text-brand" />
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
