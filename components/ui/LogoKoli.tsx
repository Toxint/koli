/**
 * La marque KOLI — un anneau ouvert, et un comma dedans.
 *
 * ── D'où elle vient ─────────────────────────────────────────────────────
 *
 * De la seconde des deux icônes proposées en référence : une masse organique,
 * bouts entièrement ronds, dégradé en diagonale, et surtout **un second trait
 * détaché niché dans le creux du premier**. C'est ce second trait qui fait
 * tout — sans lui, la forme n'est qu'un arc.
 *
 * La première référence a été écartée : c'est une lettre dans une boîte, et sa
 * force tient à son cadre plutôt qu'à sa forme. Retirez le cadre, il ne reste
 * qu'un « F ».
 *
 * **Ce n'est pas un décalque.** La référence est la marque d'une entreprise
 * réelle ; sur un service qui manipule de l'argent et vend la confiance, se la
 * faire réclamer coûterait bien plus qu'un logo. On en reprend le LANGAGE —
 * masse pleine, bouts ronds, dégradé, trait détaché — dans une forme qui est
 * la nôtre.
 *
 * ── Ce qu'elle dit ──────────────────────────────────────────────────────
 *
 * Un anneau qui ne se referme pas, avec quelque chose qui tourne dedans.
 * C'est KOLI : commande, paiement, séquestre, livraison, code de réception,
 * libération — l'argent fait un tour complet et revient au vendeur une fois le
 * client servi. L'ouverture dit que le tour est en cours, pas achevé.
 *
 * ── Ce qui a décidé de la forme ─────────────────────────────────────────
 *
 * **Elle est éprouvée à 24 px avant de l'être en grand.** Cinq compositions ont
 * été dessinées et rendues côte à côte, de 24 à 110 pixels. Quatre étaient plus
 * jolies en grand ; sur les quatre, le second trait se collait au premier ou
 * disparaissait entièrement sous 32 px — c'est-à-dire à la taille où ce logo
 * passe sa vie, dans un menu et un onglet. Celle-ci est la seule qui tienne.
 *
 * **Il n'y a AUCUN contenant.** Pas de carré, pas de squircle : la marque se
 * pose directement sur la page, comme la référence. Elle change donc de teinte
 * selon le fond — c'est le rôle des deux variantes, et c'est la seule chose qui
 * change entre elles.
 */

/**
 * L'anneau, et le comma.
 *
 * Deux tracés SANS remplissage, dessinés au trait avec des bouts ronds. C'est
 * ce qui donne la masse pleine de la référence sans avoir à décrire des
 * contours : un trait de 17 unités à bouts ronds EST la forme.
 *
 * Les épaisseurs (17 et 13) ne sont pas décoratives. Plus fin, le comma se
 * perd sous 32 px ; plus épais, il vient toucher l'anneau et les deux formes
 * n'en font plus qu'une — ce qui est exactement ce qui disqualifiait les
 * autres candidats.
 */
const ANNEAU =
  "M74 32C66 22 54 18 44 22C29 28 24 47 32 61C40 75 58 80 70 72";
const COMMA = "M48 47C54 44 61 46 64 52";

/**
 * Les dégradés, définis UNE FOIS pour toute l'application.
 *
 * À poser dans `app/layout.tsx`. Ce n'est pas un raffinement : un dégradé SVG
 * se désigne par un identifiant, et il en faudrait un unique par instance.
 * `useId` ferait de ce composant un composant CLIENT — donc du JavaScript
 * téléchargé sur chaque page pour une image qui ne bouge pas, et le §70 vise
 * des téléphones sur réseau lent. Des identifiants fixes répétés seraient du
 * HTML invalide, et surtout : `url(#id)` résout vers la PREMIÈRE occurrence,
 * si bien que retirer la première instance de l'arbre éteindrait toutes les
 * autres.
 *
 * Une définition unique, à la racine, règle les trois problèmes à la fois.
 */
export function DefinitionsLogoKoli() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      /* `position:absolute` et non `display:none` : Firefox et Safari
         n'appliquent pas les dégradés d'un SVG entièrement masqué. */
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        {/*
         * En DIAGONALE, du bas-gauche vers le haut-droite.
         *
         * C'est ce qui donne du relief à une forme pleine : éclairée d'un côté,
         * elle a une épaisseur. Un dégradé vertical l'aurait aplatie, et un
         * aplat uni en aurait fait un pictogramme.
         */}
        <linearGradient id="koli-marque-sombre" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#3e0d33" />
          <stop offset="1" stopColor="#8a2a63" />
        </linearGradient>
        <linearGradient id="koli-marque-claire" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e9d4e2" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function LogoKoli({
  taille = 36,
  variante = "sombre",
  className = "",
  titre,
}: {
  /** Côté du carré, en pixels. La marque tient de 24 à 128. */
  taille?: number;
  /**
   * `sombre` sur fond clair, `claire` sur fond sombre.
   *
   * Sans contenant, la marque dépend du fond : posée en violet profond sur le
   * menu, qui est lui-même en violet profond, elle disparaîtrait purement et
   * simplement.
   */
  variante?: "sombre" | "claire";
  className?: string;
  /**
   * À ne renseigner QUE si le logo porte seul l'information.
   *
   * Il est presque toujours accompagné du mot « KOLI » ou posé dans un lien
   * déjà nommé : l'annoncer une seconde fois ferait entendre « KOLI KOLI ».
   * Sans titre, il est `aria-hidden` — un décor, ce qu'il est alors.
   */
  titre?: string;
}) {
  const teinte = `url(#koli-marque-${variante === "claire" ? "claire" : "sombre"})`;

  return (
    <svg
      width={taille}
      height={taille}
      /* Le trait est centré sur le tracé : la moitié de son épaisseur déborde.
         Sans cette marge, les bouts ronds seraient rognés aux quatre bords. */
      viewBox="-4 -4 108 108"
      className={className}
      role={titre ? "img" : undefined}
      aria-label={titre}
      aria-hidden={titre ? undefined : true}
      focusable="false"
      fill="none"
      stroke={teinte}
      strokeLinecap="round"
    >
      <path d={ANNEAU} strokeWidth="17" />
      <path d={COMMA} strokeWidth="13" />
    </svg>
  );
}
