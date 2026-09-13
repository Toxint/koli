import { cheminLisse } from "@/lib/finance/lissage";

/**
 * Un des trois blocs de revenu du tableau de bord.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Un libellé, un montant en TRÈS grand, un badge d'évolution, une phrase  │
 * │  de comparaison, et une courbe miniature lissée. C'est l'anatomie de la  │
 * │  maquette de référence.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les trois blocs portent trois TONS — le premier plein de la couleur de
 * marque, le deuxième sombre, le troisième blanc. Ce n'est pas décoratif :
 * c'est ce qui dit lequel on regarde en premier, et l'ordre ne doit pas
 * changer d'une visite à l'autre.
 *
 * ── Ce qui a été poussé, et pourquoi ────────────────────────────────────────
 *
 * **Le montant est passé à 2,5 rem.** À 1,75 il se lisait comme un sous-titre.
 * Sur cette maquette, le chiffre EST la carte : tout le reste l'explique.
 *
 * **La miniature est LISSÉE, et remplie.** Elle traçait une polyligne : quinze
 * segments anguleux, un zigzag qui ressemblait à du bruit plutôt qu'à une
 * tendance. Elle passe désormais par `cheminLisse` — la MÊME spline monotone
 * que le grand graphique —, et reçoit un dégradé sous le trait. Deux lissages
 * différents dans la même page donneraient deux formes pour la même série.
 *
 * ── Ce qui n'est JAMAIS inventé ─────────────────────────────────────────────
 *
 * **Le badge d'évolution est optionnel, et il le reste.** Il compare deux
 * périodes réelles ; là où aucune comparaison n'a de sens — l'argent sous
 * séquestre n'a pas de « hier » —, il n'y a pas de badge. Un « +0 % » posé
 * pour remplir le cadre affirme une stabilité qu'on n'a pas mesurée.
 *
 * **La miniature est optionnelle pour la même raison.** Une série de zéros
 * dessine une ligne plate parfaitement lisse, qui se lit « rien ne bouge » là
 * où la vérité est « on ne sait pas ».
 *
 * ⚠ `min-w-0` sur la carte : un montant assemblé par `formatMontant` est un
 * bloc INSÉCABLE — espaces insécables entre les groupes de chiffres et avant
 * le symbole. Dans une grille, sans lui, la carte pousse la grille, qui pousse
 * la page, et c'est le document qui défile (§8).
 */

const TONS = {
  marque: {
    carte: "bg-brand text-white border-transparent shadow-lg shadow-brand/25",
    libelle: "text-white/65",
    montant: "text-white",
    note: "text-white/60",
    noteForte: "text-white/85",
    badgeHausse: "bg-white text-brand",
    badgeBaisse: "bg-menu-deep text-white",
    trait: "#ffffff",
  },
  sombre: {
    carte: "bg-menu-deep text-white border-transparent shadow-lg shadow-menu-deep/25",
    libelle: "text-white/55",
    montant: "text-white",
    note: "text-white/50",
    noteForte: "text-white/80",
    badgeHausse: "bg-white text-menu-deep",
    badgeBaisse: "bg-white/15 text-white",
    trait: "#ffffff",
  },
  clair: {
    carte: "bg-white text-ink border-hairline shadow-sm",
    libelle: "text-ink-muted",
    montant: "text-heading",
    note: "text-ink-muted",
    noteForte: "text-ink",
    badgeHausse: "bg-brand text-white",
    badgeBaisse: "bg-red-50 text-danger",
    trait: "var(--color-brand)",
  },
} as const;

export type TonBloc = keyof typeof TONS;

/**
 * La courbe miniature — un trait lissé sur un dégradé, sans axe ni graduation.
 *
 * Elle ne se lit pas, elle se REGARDE : elle dit « ça monte » ou « ça
 * s'effondre » en un coup d'œil. Lui ajouter des repères chiffrés en ferait un
 * graphique minuscule et illisible ; le vrai graphique est à côté, avec toute
 * la place qu'il faut.
 */
function Miniature({
  serie,
  trait,
  id,
}: {
  serie: number[];
  trait: string;
  /** Un dégradé SVG se désigne par identifiant : il doit être unique par carte. */
  id: string;
}) {
  const L = 150;
  const H = 48;
  const plafond = Math.max(...serie, 1);

  const sommets = serie.map((v, i) => ({
    x: serie.length <= 1 ? L / 2 : (i / (serie.length - 1)) * L,
    y: H - (v / plafond) * (H - 6) - 3,
  }));

  const ligne = cheminLisse(sommets);
  /* L'aire referme le tracé sur la base. Elle donne du poids à un trait de
     1,5 px qui, seul sur 48 pixels de haut, se lirait comme une rayure. */
  const aire = `${ligne} L ${L} ${H} L 0 ${H} Z`;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${L} ${H}`}
      preserveAspectRatio="none"
      className="h-12 w-[9.5rem] shrink-0"
    >
      <defs>
        <linearGradient id={`${id}-mini`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={trait} stopOpacity="0.35" />
          <stop offset="100%" stopColor={trait} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={aire} fill={`url(#${id}-mini)`} />
      <path
        d={ligne}
        fill="none"
        stroke={trait}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        /* En pixels d'ÉCRAN : `preserveAspectRatio="none"` étire le repère, et
           un trait mis à l'échelle avec lui deviendrait épais d'un côté et fin
           de l'autre. */
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function BlocRevenu({
  libelle,
  montant,
  note,
  noteForte,
  evolution,
  serie,
  ton = "clair",
  identifiant,
}: {
  libelle: string;
  /** Déjà mis en forme — le composant ne sait rien des devises. */
  montant: string;
  /** La ligne du dessous, en gris. */
  note?: string;
  /** La ligne du dessus, plus lisible — « Balance bigger » de la maquette. */
  noteForte?: string;
  /** Variation en pourcentage sur la période. Omise quand elle n'a pas de sens. */
  evolution?: number | null;
  /** Quatorze valeurs quotidiennes. Omise quand il n'y a rien à montrer. */
  serie?: number[];
  ton?: TonBloc;
  /** Rend unique l'identifiant du dégradé. Deux cartes, deux dégradés. */
  identifiant: string;
}) {
  const t = TONS[ton];
  const hausse = (evolution ?? 0) >= 0;

  return (
    <div
      className={`flex min-w-0 flex-col justify-between gap-5 rounded-3xl border p-6 ${t.carte}`}
    >
      <div className="min-w-0">
        <span className={`block text-xs font-semibold ${t.libelle}`}>
          {libelle}
        </span>
        <div
          className={`animate-compteur mt-1.5 font-titre text-[2.5rem] font-extrabold leading-none tracking-tight [overflow-wrap:anywhere] ${t.montant}`}
        >
          {montant}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {evolution !== undefined && evolution !== null && (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${
                hausse ? t.badgeHausse : t.badgeBaisse
              }`}
            >
              {/* Le signe est TOUJOURS écrit, « + » compris : sans lui, une
                  hausse et une baisse se ressemblent au premier coup d'œil. */}
              {hausse ? "+" : "−"}
              {Math.abs(evolution).toFixed(1).replace(".", ",")} %
            </span>
          )}
          {noteForte && (
            <p className={`mt-2 text-xs font-semibold ${t.noteForte}`}>
              {noteForte}
            </p>
          )}
          {note && <p className={`mt-0.5 text-xs ${t.note}`}>{note}</p>}
        </div>

        {serie && serie.some((v) => v > 0) && (
          <Miniature serie={serie} trait={t.trait} id={identifiant} />
        )}
      </div>
    </div>
  );
}
