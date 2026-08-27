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

/**
 * Fonctionnalites annoncees sur la vitrine.
 *
 * Chacune EXISTE et est eprouvee par la campagne de verification. On
 * n'annonce rien que le produit ne sache faire : une vitrine qui promet ce
 * qui n'existe pas se paie au premier client.
 *
 *   lien de paiement    → app/pay/[reference]        verif:parcours
 *   sequestre           → lib/finance                verif:jalons
 *   code de reception   → lib/deliveries             verif:parcours
 *   suivi               → components/domain/FriseLivraison  verif:jalons
 *   facture             → app/facture/[reference]    verif:factures
 *   litige              → app/litige/[reference]     verif:litiges
 */
const fonctionnalites = [
  {
    titre: "Un lien de paiement à partager",
    texte:
      "Créez la commande, KOLI génère un lien. Envoyez-le sur WhatsApp, Instagram ou ailleurs — le client n'a aucun compte à créer pour payer.",
    icone: "lien" as const,
  },
  {
    titre: "L'argent mis de côté",
    texte:
      "Le montant payé est conservé par KOLI. Le vendeur sait que les fonds existent avant d'expédier ; le client sait qu'ils ne partiront pas sans lui.",
    icone: "cadenas" as const,
  },
  {
    titre: "Un code de réception",
    texte:
      "Le client reçoit un code à quatre chiffres, connu de lui seul. Le livreur doit le lui demander : sans ce code, la livraison n'est pas validée.",
    icone: "bouclier" as const,
  },
  {
    titre: "Le suivi, étape par étape",
    texte:
      "Commande confirmée, colis prêt, livreur en route, remise effectuée. Chaque partie voit où en est la commande, sans avoir à demander.",
    icone: "position" as const,
  },
  {
    titre: "Une facture à chaque paiement",
    texte:
      "Émise automatiquement, numérotée sans doublon, téléchargeable et partageable par WhatsApp ou SMS. Le client garde une preuve de ce qu'il a réglé.",
    icone: "recu" as const,
  },
  {
    titre: "Un litige, un arbitre",
    texte:
      "Colis non reçu ou non conforme : le client ouvre un litige, échange avec le vendeur, et l'administration tranche. Les fonds restent bloqués tant que rien n'est décidé.",
    icone: "message" as const,
  },
];

/**
 * Pourquoi choisir KOLI.
 *
 * A ne pas confondre avec `fonctionnalites` : celle-la enumere ce que le
 * produit FAIT, celle-ci repond a « pourquoi vous, plutot que de me
 * debrouiller ». Deux listes qui se repeteraient donneraient deux fois la
 * meme page.
 *
 * Chaque argument est verifiable dans le produit, aucun n'est une promesse :
 *
 *   sequestre        → lib/finance            verif:jalons
 *   fonds annonces   → app/(vendeur)/…/solde  verif:transactions
 *   paiement sans compte → app/pay/[reference]  verif:parcours
 *   canaux de vente  → §2 du plan
 *   arbitrage        → lib/disputes           verif:litiges
 *   paie du livreur  → lib/deliveries/actions verif:parcours
 */
const raisons = [
  {
    titre: "Vous ne payez pas un inconnu",
    texte:
      "Votre argent est mis de côté par KOLI, pas versé au vendeur. Il ne part qu'une fois que vous avez confirmé avoir reçu votre commande.",
    icone: "cadenas" as const,
  },
  {
    titre: "Le vendeur expédie sans crainte",
    texte:
      "Il voit que les fonds existent avant d'engager sa marchandise. Plus besoin de choisir entre expédier à l'aveugle et perdre la vente.",
    icone: "boutique" as const,
  },
  {
    titre: "Rien à installer pour payer",
    texte:
      "Le client ouvre le lien et règle. Aucun compte à créer, aucune application à télécharger — c'est ce qui fait qu'une vente aboutit.",
    icone: "lien" as const,
  },
  {
    titre: "Vendez là où vous vendez déjà",
    texte:
      "WhatsApp, Facebook, TikTok, Instagram. KOLI ne remplace pas votre façon de vendre : il sécurise le paiement et la livraison par-dessus.",
    icone: "partage" as const,
  },
  {
    titre: "Un litige est arbitré, pas subi",
    texte:
      "Colis non reçu ou non conforme : l'administration tranche après avoir entendu les deux parties. Les fonds restent bloqués tant que rien n'est décidé.",
    icone: "bouclier" as const,
  },
  {
    titre: "Le livreur est payé pour sa course",
    texte:
      "Les frais de livraison lui sont acquis dès qu'il remet le colis et que le code est validé. Ils ne dépendent pas de la suite, et KOLI n'y prélève rien.",
    icone: "livreur" as const,
  },
];



/**
 * La trame de points porte sur TOUTE la page, pas sur le seul bloc d'accroche.
 *
 * Une creme parfaitement unie parait vide sur la hauteur d'un ecran ; la trame
 * lui donne une matiere qu'on ne remarque pas mais qui empeche le vide.
 * `radial-gradient` plutot qu'une image : aucun fichier a telecharger, et le
 * motif reste net a tous les zooms.
 *
 * Elle est portee par la page entiere, et non par le bloc d'accroche, pour que
 * la barre flottante puisse en etre l'enfant direct — voir plus bas.
 */
export default function AccueilPage() {
  return (
    <div
      className="min-h-screen bg-cream text-brand dark:text-white"
      style={{
        backgroundImage:
          "radial-gradient(circle at center, color-mix(in srgb, var(--color-brand) 7%, transparent) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    >
      {/*
       * ════════════════════════════════════════════════════════════════
       * En-tete (§59) — barre flottante, ENFANT DIRECT DE LA PAGE
       * ════════════════════════════════════════════════════════════════
       *
       * Deux erreurs se sont succede ici, et la seconde n'a ete visible qu'une
       * fois la premiere corrigee.
       *
       * D'abord un `overflow-hidden` sur le bloc parent : un element colle ne
       * depasse jamais un ancetre a debordement masque.
       *
       * Puis, ce masquage retire, la barre ne collait toujours pas — car
       * `sticky` est BORNE PAR LA HAUTEUR DE SON PARENT. Enfermee dans le bloc
       * d'accroche, elle disparaissait des que ce bloc quittait l'ecran.
       *
       * Elle est donc desormais enfant direct de la page, qui va jusqu'en bas.
       * Elle ne touche aucun bord et se pose sur la creme comme une carte : la
       * navigation se separe du contenu sans qu'il faille un filet.
       */}
        <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 rounded-full border border-hairline/80 bg-white/90 pl-3 pr-1.5 shadow-sm backdrop-blur-md sm:h-16 sm:gap-3 sm:pl-5 sm:pr-3">
            <Link
              href="/"
              aria-label="Accueil KOLI"
              className="flex min-h-[44px] shrink-0 items-center gap-2"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white sm:h-9 sm:w-9">
                K
              </span>
              {/* Sous 360px, le mot cede la place aux deux actions : le carre
                  « K » suffit a identifier la marque, et perdre « Connexion »
                  aurait ete plus couteux. */}
              <span className="hidden text-lg font-bold tracking-tight min-[360px]:inline sm:text-xl">
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
              {/* « Fonctionnalités » vise une ancre de CETTE page, les deux
                  autres des pages entieres — d'ou le `#`. */}
              <Link
                href="#fonctionnalites"
                className="inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-medium text-ink-muted transition-colors hover:bg-cream hover:text-brand"
              >
                Fonctionnalités
              </Link>
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
                className="inline-flex min-h-[44px] items-center rounded-full px-2 text-sm font-semibold text-brand transition-colors hover:bg-cream sm:px-4"
              >
                Connexion
              </Link>
              <Link
                href="/inscription"
                className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full bg-brand px-3 text-sm font-bold text-white transition-colors hover:bg-brand-strong sm:px-5"
              >
                <span className="sm:hidden">S&apos;inscrire</span>
                <span className="hidden sm:inline">Créer un compte</span>
                <Icone nom="fleche-droite" className="hidden h-4 w-4 sm:block" />
              </Link>
            </div>
          </div>
        </header>

        <main>
          {/* Halo dore tres dilue derriere le titre : rechauffe le centre sans
              jamais concurrencer le texte. Rogne par son propre conteneur —
              un `overflow-hidden` pose plus haut neutraliserait la barre
              collante. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[520px] overflow-hidden"
          >
            <div
              className="absolute left-1/2 top-0 h-[420px] w-[860px] max-w-none -translate-x-1/2 opacity-70"
              style={{
                background:
                  "radial-gradient(ellipse at center, color-mix(in srgb, var(--color-gold) 22%, transparent) 0%, transparent 68%)",
              }}
            />
          </div>

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
            <div className="apparait-au-chargement inline-flex max-w-full items-center gap-2.5 rounded-full border border-brand-border/70 bg-white/80 py-1.5 pl-2 pr-4 shadow-sm backdrop-blur-sm">
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
            <h1 style={{ animationDelay: "90ms" }} className="apparait-au-chargement mt-7 font-titre text-[2.75rem] font-extrabold leading-[0.95] tracking-[-0.04em] text-brand-strong sm:mt-9 sm:text-7xl sm:leading-[0.92] lg:text-[5.5rem]">
              <span className="block">Achetez.</span>
              <span className="block">Recevez.</span>
              {/* Le seul mot en serif italique : c'est la validation du client
                  qui declenche le versement au vendeur. Tout le produit tient
                  dans ce mot. */}
              <span className="block font-accent font-normal italic tracking-[-0.01em] text-brand-accent">
                Validez.
              </span>
            </h1>

            <p style={{ animationDelay: "200ms" }} className="apparait-au-chargement mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed text-ink-muted sm:mt-8 sm:text-lg">
              KOLI sécurise vos achats en ligne et facilite les transactions
              entre clients et vendeurs.
            </p>

            <div style={{ animationDelay: "290ms" }} className="apparait-au-chargement mt-9 flex flex-col justify-center gap-3 sm:mt-10 sm:flex-row">
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

        {/*
         * ════════════════════════════════════════════════════════════════
         * Comment ca marche (§60)
         * ════════════════════════════════════════════════════════════════
         *
         * Quatre cartes posees sur la creme, chacune portant son rang en
         * chiffre pale. Le numero est ENORME et tres dilue : il donne le sens
         * de lecture sans jamais disputer la place au texte. Une pastille
         * numerotee, elle, se lisait avant le titre.
         */}
        <section id="comment-ca-marche" className="scroll-mt-24">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <div className="apparait text-center">
              <h2 className="font-titre text-3xl font-extrabold tracking-[-0.03em] text-heading sm:text-5xl">
                Comment ça marche&nbsp;?
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-ink-muted sm:text-lg">
                Quatre étapes, du lien de paiement jusqu&apos;au versement du
                vendeur — sans que personne ait à faire confiance à l&apos;autre.
              </p>
            </div>

            <ol className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {etapes.map((etape, i) => (
                <li
                  key={etape.numero}
                  className="apparait carte-vitrine relative overflow-hidden rounded-3xl border border-hairline bg-white p-6 sm:p-7"
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  {/* Le chiffre, en fond. `aria-hidden` : la liste ordonnee
                      porte deja le rang pour les lecteurs d'ecran, l'entendre
                      deux fois n'apporte rien. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-5 -right-2 select-none font-titre text-[6.5rem] font-extrabold leading-none text-brand/[0.055]"
                  >
                    0{etape.numero}
                  </span>

                  <span
                    aria-hidden="true"
                    className={`relative flex h-12 w-12 items-center justify-center rounded-2xl ${etape.pastille}`}
                  >
                    <Icone nom={etape.icone} className="h-5 w-5 text-white" />
                  </span>

                  <h3 className="relative mt-5 text-lg font-bold text-heading">
                    {etape.titre}
                  </h3>
                  <p className="relative mt-2 text-sm leading-relaxed text-ink-muted">
                    {etape.texte}
                  </p>
                </li>
              ))}
            </ol>

            <p className="apparait mx-auto mt-12 max-w-2xl text-center text-sm text-ink-muted sm:text-base">
              Le paiement est sécurisé jusqu&apos;à la confirmation de réception
              selon les règles applicables.
            </p>

            <div className="apparait mt-6 text-center">
              <Link
                href="/comment-ca-marche"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-brand underline decoration-brand-border underline-offset-4 transition-colors hover:bg-white hover:decoration-brand"
              >
                En savoir plus sur le fonctionnement
                <Icone nom="fleche-droite" className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/*
         * ════════════════════════════════════════════════════════════════
         * Fonctionnalites
         * ════════════════════════════════════════════════════════════════
         *
         * Section ajoutee a la demande de l'utilisateur — elle ne figure pas
         * au §59, qui n'enumere que l'accroche, « comment ca marche », « pour
         * les vendeurs » et le pied de page.
         *
         * Chaque carte decrit une fonction QUI EXISTE et qui est eprouvee par
         * la campagne de verification. Rien n'est annonce ici que le produit
         * ne sache faire : une vitrine qui promet ce qui n'existe pas se paie
         * au premier client.
         */}
        <section
          id="fonctionnalites"
          className="scroll-mt-24 border-y border-hairline bg-white/60"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <div className="apparait text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-border/70 bg-cream px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand">
                <Icone nom="eclair" className="h-3 w-3" />
                Fonctionnalités
              </span>
              <h2 className="mt-5 font-titre text-3xl font-extrabold tracking-[-0.03em] text-heading sm:text-5xl">
                Tout ce que KOLI fait pour vous
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-ink-muted sm:text-lg">
                Vendez là où sont vos clients. KOLI s&apos;occupe de
                l&apos;argent, de la preuve et du suivi.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {fonctionnalites.map((f, i) => (
                <article
                  key={f.titre}
                  className="apparait carte-vitrine rounded-3xl border border-hairline bg-cream/70 p-6 sm:p-7"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft"
                  >
                    <Icone nom={f.icone} className="h-5 w-5 text-brand" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold text-heading">
                    {f.titre}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {f.texte}
                  </p>
                </article>
              ))}
            </div>

            {/* Les canaux de vente du §2 : ce sont eux que KOLI vient
                securiser, pas un site marchand a construire. */}
            <div className="apparait mt-12 flex flex-wrap items-center justify-center gap-2">
              <span className="mr-1 text-sm text-ink-muted">
                Fonctionne avec&nbsp;:
              </span>
              {canaux.map((canal) => (
                <span
                  key={canal}
                  className="rounded-full border border-hairline bg-white px-3 py-1.5 text-sm font-semibold text-brand"
                >
                  {canal}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/*
         * ════════════════════════════════════════════════════════════════
         * Pourquoi choisir KOLI
         * ════════════════════════════════════════════════════════════════
         *
         * Bloc bordeaux profond, arrondi, POSE sur la creme — il ne va pas
         * d'un bord a l'autre. C'est ce retrait qui en fait un objet et non
         * une bande : la page respire autour de lui, et l'oeil comprend qu'on
         * change de registre.
         *
         * Ce que cette section dit n'est PAS ce que dit « Fonctionnalites ».
         * L'une enumere ce que le produit fait, celle-ci repond a « pourquoi
         * vous, plutot que de vous debrouiller ». Les repeter l'une apres
         * l'autre aurait donne deux fois la meme page.
         */}
        <section id="pourquoi-koli" className="scroll-mt-24 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <div className="apparait mx-auto max-w-6xl rounded-[2rem] bg-menu bg-gradient-to-b from-menu to-menu-deep px-5 py-14 sm:rounded-[2.5rem] sm:px-10 sm:py-20 lg:px-14">
            <div className="text-center">
              <h2 className="font-titre text-3xl font-extrabold tracking-[-0.03em] text-cream sm:text-5xl">
                Pourquoi choisir KOLI&nbsp;?
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-white/70 sm:text-lg">
                Parce que ni l&apos;acheteur ni le vendeur n&apos;a besoin de
                faire confiance à l&apos;autre.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {raisons.map((r, i) => (
                <article
                  key={r.titre}
                  className="apparait carte-vitrine rounded-3xl border border-white/10 bg-white/[0.06] p-6 sm:p-7"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"
                  >
                    {/* L'or atteint 7,0:1 sur ce bordeaux : c'est la seule
                        surface de l'application ou il est lisible en couleur
                        de trait. */}
                    <Icone nom={r.icone} className="h-5 w-5 text-gold" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold text-white">
                    {r.titre}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">
                    {r.texte}
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-12 text-center">
              <Link
                href="/inscription"
                className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-cream px-8 font-bold text-brand-strong transition-colors hover:bg-white"
              >
                Créer un compte gratuitement
                <Icone nom="fleche-droite" className="h-4 w-4" />
              </Link>
              <p className="mt-4 text-xs text-white/60">
                Aucun paiement réel — KOLI fonctionne en mode test.
              </p>
            </div>
          </div>
        </section>

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
