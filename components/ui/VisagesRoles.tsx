/**
 * Les trois visages de la pastille d'accueil — client, vendeur, livreur.
 *
 * Ils remplacent trois pictogrammes. Une silhouette abstraite dit « un rôle » ;
 * un visage dit « quelqu'un ». Sur une page dont le sujet est la confiance
 * entre personnes qui ne se connaissent pas, la différence n'est pas
 * décorative.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  CE SONT DES DESSINS, PAS DES PHOTOGRAPHIES. Volontairement.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Des photos de personnes réelles posées ici affirmeraient quelque chose de
 * faux : que ces gens-là utilisent KOLI. C'est exactement le problème des avis
 * clients inventés et des vignettes d'activité — et le service n'a pas encore
 * d'utilisateur. Une banque d'images ajouterait par-dessus une question de
 * licence et plusieurs centaines de kilo-octets à télécharger, sur un public
 * visé qui est sur réseau mobile lent (§70).
 *
 * Un dessin, lui, n'affirme rien. Il représente les trois rôles du parcours,
 * ce qui est vrai et ce que faisaient déjà les pictogrammes.
 *
 * ── Comment ils sont construits ─────────────────────────────────────────────
 *
 * La coiffure n'est PAS un tracé : c'est un cercle un peu plus grand que la
 * tête, posé dessous. La tête le recouvre, et il n'en dépasse qu'un croissant.
 * Deux cercles suffisent donc à faire des cheveux, un foulard ou un casque —
 * là où un vrai contour aurait été illisible à vingt-huit pixels et
 * impossible à retoucher.
 *
 * ── Ce qui a décidé des valeurs ─────────────────────────────────────────────
 *
 * **Jugés à 24 px avant de l'être en grand.** Trois jeux ont été rendus côte à
 * côte. Le fond violet PLEIN, le plus élégant en grand, noyait les visages :
 * à cette taille il ne restait qu'un disque sombre. Les trois fonds différents
 * étaient jolis et ramenaient le mélange de couleurs qu'on venait de retirer
 * partout ailleurs. Il reste celui-ci : un seul fond, clair, pour les trois.
 */

/** Un rôle, et ce qui le distingue au premier coup d'œil. */
interface Portrait {
  /** Ce qu'il représente — pour la relecture, jamais affiché. */
  role: string;
  peau: string;
  /** Cheveux, foulard ou casque : c'est le cercle du dessous. */
  coiffe: string;
  vetement: string;
  /** Le nœud du foulard, ou la visière du casque. */
  detail: "foulard" | "casque" | null;
}

/**
 * Un seul fond pour les trois.
 *
 * Trois fonds différents donnaient plus de relief, et ramenaient exactement ce
 * qu'on a retiré partout ailleurs : une couleur par élément. Ce qui distingue
 * les trois, ce sont les VISAGES — c'est bien le moins.
 */
const FOND = "#e6cedc";

const PORTRAITS: Portrait[] = [
  {
    role: "cliente",
    peau: "#7a4a24",
    coiffe: "#8a2a63",
    vetement: "#5b1348",
    detail: "foulard",
  },
  {
    role: "vendeur",
    peau: "#5e3416",
    coiffe: "#2a1020",
    vetement: "#3e0d33",
    detail: null,
  },
  {
    role: "livreur",
    peau: "#8a5a2b",
    coiffe: "#5b1348",
    vetement: "#3e0d33",
    detail: "casque",
  },
];

/** Le cercle de la coiffe, selon ce qu'elle est. */
const COIFFE = {
  foulard: { cy: 15.6, r: 10.2 },
  casque: { cy: 16.4, r: 10.4 },
  simple: { cy: 16.4, r: 9.6 },
};

function Visage({ portrait, taille, cle }: { portrait: Portrait; taille: number; cle: string }) {
  const c = COIFFE[portrait.detail ?? "simple"];

  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
      className="shrink-0 rounded-full ring-2 ring-white"
    >
      <defs>
        {/*
         * Le disque de découpe. Les épaules débordent volontairement du cadre
         * en bas — c'est ce qui donne un buste plutôt qu'une tête flottante —
         * et c'est lui qui les coupe net au bord du cercle.
         */}
        <clipPath id={`visage-${cle}`}>
          <circle cx="20" cy="20" r="20" />
        </clipPath>
      </defs>

      <g clipPath={`url(#visage-${cle})`}>
        <circle cx="20" cy="20" r="20" fill={FOND} />
        <path d="M3 40C3 30.5 10.5 26 20 26C29.5 26 37 30.5 37 40Z" fill={portrait.vetement} />
        {/* Le cou, arrondi : un rectangle net donnait un menton carré. */}
        <rect x="16.6" y="21" width="6.8" height="7" rx="3" fill={portrait.peau} />
        <circle cx="20" cy={c.cy} r={c.r} fill={portrait.coiffe} />
        <circle cx="20" cy="18.2" r="8.4" fill={portrait.peau} />

        {portrait.detail === "foulard" && (
          /* Le nœud, sur le côté. C'est lui qui fait lire un foulard plutôt
             qu'une chevelure — sans lui, les deux se ressemblent à 28 px. */
          <circle cx="12.5" cy="10" r="3.6" fill={portrait.coiffe} />
        )}

        {portrait.detail === "casque" && (
          /* La visière. Assombrie plutôt que noire : un trait pur découpait le
             visage en deux au lieu de se poser dessus. */
          <rect x="9" y="16.5" width="22" height="3" rx="1.5" fill="#2a1020" opacity="0.55" />
        )}
      </g>
    </svg>
  );
}

/**
 * Les trois, empilés.
 *
 * `aria-hidden` sur l'ensemble : le texte de la pastille dit déjà ce qu'il y a
 * à savoir, et « image image image » n'apprendrait rien à personne.
 *
 * 28 px et non 24 : à 24, le nœud du foulard et la visière du casque se
 * confondaient, et les trois portraits devenaient trois taches identiques.
 */
export function VisagesRoles({ taille = 28 }: { taille?: number }) {
  return (
    <span aria-hidden="true" className="flex shrink-0 -space-x-2">
      {PORTRAITS.map((p) => (
        <Visage key={p.role} cle={p.role} portrait={p} taille={taille} />
      ))}
    </span>
  );
}
