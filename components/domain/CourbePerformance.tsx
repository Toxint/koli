"use client";

import { useId, useRef, useState } from "react";
import { formatCFA } from "@/lib/format";

export interface PointCourbe {
  /** Jour, déjà mis en forme par le serveur — « lun. 12 ». */
  etiquette: string;
  /** Jour complet, pour le survol et le tableau — « lundi 12 août ». */
  etiquetteLongue: string;
  valeur: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Le repère
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Repère interne, en unités arbitraires : l'affichage s'adapte par mise à
 * l'échelle uniforme. `vector-effect` garde ensuite les traits à leur épaisseur
 * réelle — sans lui, une ligne de 2 px n'en ferait plus qu'une sur un
 * téléphone.
 */
const L = 640;
const H = 200;

/**
 * Les marges ne sont pas décoratives : elles logent les graduations.
 *
 * À gauche, la place des montants ; en bas, celle des dates. Sans elles, le
 * tracé passerait sous les étiquettes, ou les étiquettes sur le tracé.
 */
const MARGE = { haut: 12, droite: 8, bas: 28, gauche: 46 };

const LARGEUR_TRACE = L - MARGE.gauche - MARGE.droite;
const HAUTEUR_TRACE = H - MARGE.haut - MARGE.bas;

// ═══════════════════════════════════════════════════════════════════════════
//  L'échelle verticale
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Des graduations à valeurs RONDES, et le haut de l'échelle au-dessus du pic.
 *
 * Graduer au maximum exact donnerait « 52 170 » en haut de l'axe : un nombre
 * qu'on ne retient pas, et une courbe qui touche le plafond. On monte donc au
 * multiple rond suivant — l'axe se lit d'un coup d'œil et le pic respire.
 *
 * L'échelle des pas (1 · 1,5 · 2 · 2,5 · 3 · 5) est celle qu'emploient les
 * graphiques de gestion : ce sont les seuls multiples dont le tiers ou le quart
 * reste un nombre rond.
 */
function graduations(maxi: number, intervalles = 5): number[] {
  if (maxi <= 0) return [0];

  const brut = maxi / intervalles;
  const ordre = Math.pow(10, Math.floor(Math.log10(brut)));
  const norme = brut / ordre;

  const echelons = [1, 1.5, 2, 2.5, 3, 5, 10];
  const pas = (echelons.find((e) => norme <= e) ?? 10) * ordre;

  const haut = Math.ceil(maxi / pas) * pas;
  const valeurs: number[] = [];
  for (let v = 0; v <= haut + pas / 1000; v += pas) valeurs.push(v);

  return valeurs;
}

/**
 * « 15 k », « 1,2 M » — court, parce qu'un axe n'est pas un relevé de compte.
 *
 * Écrit à la main plutôt qu'avec `Intl` : ce composant est rendu par le serveur
 * PUIS par le navigateur, et les deux n'embarquent pas les mêmes données de
 * locale. Un « 15 K » d'un côté et « 15 k » de l'autre suffit à faire crier
 * React au désaccord d'hydratation, et l'écran clignote.
 */
function court(v: number): string {
  const abrege = (n: number, unite: string) => {
    const arrondi = Math.round(n * 10) / 10;
    const texte = Number.isInteger(arrondi)
      ? String(arrondi)
      : String(arrondi).replace(".", ",");
    return `${texte} ${unite}`;
  };

  if (v >= 1_000_000) return abrege(v / 1_000_000, "M");
  if (v >= 1_000) return abrege(v / 1_000, "k");
  return String(Math.round(v));
}

// ═══════════════════════════════════════════════════════════════════════════
//  Le tracé
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Courbe lissée passant par tous les points — spline cubique MONOTONE.
 *
 * Le lissage ordinaire (Bézier à tangentes centrées, Catmull-Rom) dépasse : une
 * journée à zéro suivie d'une forte journée fait plonger la courbe SOUS zéro
 * avant de remonter. Sur un graphique d'argent, ce creux inventé se lit comme
 * une perte, et il n'y en a pas eu.
 *
 * Les tangentes de Fritsch–Carlson interdisent ce dépassement : entre deux
 * points, la courbe reste bornée par ces deux points. Elle est donc jolie sans
 * rien affirmer que les données ne portent pas — et les chiffres exacts restent
 * dans le tableau juste en dessous.
 */
function cheminLisse(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M ${pts[0].x} ${pts[0].y}`;

  const dx: number[] = [];
  const pentes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    pentes[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }

  const tangentes: number[] = new Array(n);
  tangentes[0] = pentes[0];
  tangentes[n - 1] = pentes[n - 2];

  for (let i = 1; i < n - 1; i++) {
    // Changement de sens, ou plateau : tangente horizontale. C'est là que le
    // lissage naïf inventerait une bosse ou un creux.
    if (pentes[i - 1] * pentes[i] <= 0) {
      tangentes[i] = 0;
      continue;
    }
    const p1 = 2 * dx[i] + dx[i - 1];
    const p2 = dx[i] + 2 * dx[i - 1];
    tangentes[i] = (p1 + p2) / (p1 / pentes[i - 1] + p2 / pentes[i]);
  }

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const tiers = dx[i] / 3;
    d +=
      ` C ${pts[i].x + tiers} ${pts[i].y + tangentes[i] * tiers}` +
      ` ${pts[i + 1].x - tiers} ${pts[i + 1].y - tangentes[i + 1] * tiers}` +
      ` ${pts[i + 1].x} ${pts[i + 1].y}`;
  }

  return d;
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Courbe de performance — aire lissée, une seule mesure.
 *
 * **Pas de seconde échelle verticale.** Superposer un montant et un nombre de
 * commandes obligerait à deux axes, et deux axes font dire à un graphique ce
 * qu'on veut : on choisit les bornes jusqu'à ce que les courbes se croisent au
 * bon endroit. Les compteurs voisins portent les nombres.
 *
 * **Un seul jeu de données, donc pas de légende** : le titre le nomme. Une
 * légende d'un seul élément n'apprend rien et prend la place du graphique.
 *
 * Le dessin est en SVG écrit à la main plutôt qu'avec une bibliothèque : la
 * moindre d'entre elles pèse plusieurs dizaines de kilo-octets, et le public
 * visé est sur réseau mobile lent (§70). Ce fichier ne coûte rien de plus que
 * ce qu'il affiche.
 *
 * **Les graduations sont en HTML, posées par-dessus le SVG.** Un `<text>` de
 * 11 pixels dans un repère large de 640 s'affiche à 16 sur un écran de bureau
 * et à 5 sur un téléphone : le SVG est mis à l'échelle, son texte aussi. Posées
 * en HTML aux bonnes fractions de la hauteur, les étiquettes gardent leur
 * taille réelle partout.
 */
export function CourbePerformance({
  points,
  couleur,
  libelle,
}: {
  points: PointCourbe[];
  /**
   * Teinte de la série — trait ET remplissage, une seule valeur.
   *
   * Il n’en existe qu’une dans tout le projet (`TEINTE_COURBE`), et le
   * paramètre reste malgré tout : c’est lui qui garantit que le trait et le
   * dégradé ne peuvent pas diverger, puisqu’ils lisent la même variable.
   */
  couleur: string;
  /** Ce que la courbe mesure — repris dans la description sonore. */
  libelle: string;
}) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [survole, setSurvole] = useState<number | null>(null);

  const valeurs = points.map((p) => p.valeur);
  const total = valeurs.reduce((s, v) => s + v, 0);

  /**
   * Rien du tout — un vendeur qui vient de s'inscrire, un livreur sans course.
   *
   * C'est le PREMIER écran que voit un nouveau venu, donc celui qu'il faut le
   * moins rater. Le cadre reste — sa disparition ferait croire à une page
   * incomplète — mais l'axe n'est plus gradué : sur une série vide, les
   * graduations n'annonceraient que des montants qui n'existent pas.
   */
  const vide = total === 0;

  const echelle = graduations(Math.max(...valeurs, 0));
  const plafond = Math.max(echelle[echelle.length - 1], 1);

  const x = (i: number) =>
    MARGE.gauche +
    (points.length <= 1 ? LARGEUR_TRACE / 2 : (i / (points.length - 1)) * LARGEUR_TRACE);

  const y = (v: number) => MARGE.haut + (1 - v / plafond) * HAUTEUR_TRACE;

  const base = MARGE.haut + HAUTEUR_TRACE;

  const sommets = points.map((p, i) => ({ x: x(i), y: y(p.valeur) }));
  const ligne = cheminLisse(sommets);
  const aire = vide
    ? ""
    : `${ligne} L ${x(points.length - 1)} ${base} L ${x(0)} ${base} Z`;

  /**
   * Les jours nommés sous l'axe.
   *
   * Un jour sur deux, en partant du DERNIER : c'est celui qu'on cherche en
   * premier, et le laisser sans nom obligerait à compter les colonnes. Sur un
   * téléphone, trois suffisent — sept se chevaucheraient et deviendraient
   * illisibles, ce qui n'est pas mieux que rien.
   */
  const nommes = points
    .map((_, i) => i)
    .filter((i) => (points.length - 1 - i) % 2 === 0);
  const surMobile = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);

  /** Le point le plus proche du curseur, dans le repère de l'écran. */
  function surDeplacement(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;

    const cadre = svg.getBoundingClientRect();
    // De l'écran vers le repère, puis vers l'indice du jour. La marge gauche
    // n'appartient pas au tracé : l'ignorer décalerait le survol d'un jour.
    const dansLeRepere = ((e.clientX - cadre.left) / cadre.width) * L;
    const ratio = (dansLeRepere - MARGE.gauche) / LARGEUR_TRACE;
    const i = Math.round(ratio * (points.length - 1));

    setSurvole(Math.min(Math.max(i, 0), points.length - 1));
  }

  const actif = survole !== null ? points[survole] : null;

  return (
    /*
     * `data-courbe` n'est pas décoratif : `verif:courbes` s'y accroche pour
     * distinguer cette carte du reste du tableau de bord. Sans repère stable,
     * le contrôle viserait par le texte du titre — et se casserait à la
     * première reformulation, en annonçant une régression qui n'existe pas.
     */
    <div data-courbe={libelle}>
      {/*
       * Le cadre du graphique — et RIEN d'autre.
       *
       * Les graduations se placent en pourcentage de la hauteur de leur parent
       * positionné. Tant que le tableau replié était dans ce même parent, les
       * pourcentages se comptaient sur une hauteur plus grande que le dessin :
       * les étiquettes glissaient vers le bas, d'autant plus loin qu'elles
       * étaient basses, et le « 0 » finissait sous la courbe.
       */}
      <div className="relative">
        {/* Graduations de l'axe vertical, en HTML par-dessus le tracé. */}
        {!vide &&
          echelle.map((v) => (
            <span
              key={v}
              aria-hidden="true"
              data-axe="y"
              className="pointer-events-none absolute left-0 z-10 -translate-y-1/2 pr-2 text-right text-[11px] leading-none text-ink-muted"
              style={{
                top: `${(y(v) / H) * 100}%`,
                width: `${(MARGE.gauche / L) * 100}%`,
              }}
            >
              {court(v)}
            </span>
          ))}

        {/* Jours nommés sous l'axe. */}
        {points.length > 1 &&
          nommes.map((i) => (
            <span
              key={i}
              aria-hidden="true"
              data-axe="x"
              className={`pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap text-[11px] leading-none text-ink-muted ${
                surMobile.has(i) ? "" : "hidden sm:block"
              }`}
              style={{
                left: `${(x(i) / L) * 100}%`,
                top: `${((base + 14) / H) * 100}%`,
              }}
            >
              {points[i].etiquette}
            </span>
          ))}

        {/* Rien à montrer : on le DIT. Une courbe plate sans un mot se lit comme
            une panne d'affichage, et c'est la première impression du service. */}
        {vide && (
          <span className="pointer-events-none absolute inset-x-0 top-1/3 z-10 text-center text-xs text-ink-muted">
            Aucun mouvement sur la période
          </span>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${L} ${H}`}
          className="h-auto w-full touch-none overflow-visible"
          role="img"
          aria-label={`${libelle}. Total sur la période : ${formatCFA(total)}. Le détail figure dans le tableau qui suit.`}
          onMouseMove={vide ? undefined : surDeplacement}
          onMouseLeave={() => setSurvole(null)}
        >
          <defs>
            {/*
             * C’EST L’AIRE QUI PORTE LA COURBE, pas le trait.
             *
             * Elle était à 24 % en haut et 2 % en bas : un voile. Le trait de
             * deux pixels faisait tout le travail, et la courbe se lisait comme
             * un fil cerné — une BORDURE posée sur du vide, là où elle devrait
             * se lire comme une masse.
             *
             * 30 % en haut, 3 % en bas. Sur le blanc de la carte, le haut donne
             * un mauve tenu (#CEB8C8) : assez présent pour que la forme existe
             * seule, assez dilué pour que les graduations restent lisibles au
             * travers. Au-delà, l’aire mange sa propre grille.
             *
             * Le fond DOIT rester un dégradé et non un aplat : une masse pleine
             * jusqu’à l’axe pèse autant en bas qu’en haut, et l’œil lit alors
             * une surface au lieu d’une évolution.
             */}
            <linearGradient id={`${id}-aire`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={couleur} stopOpacity="0.3" />
              <stop offset="100%" stopColor={couleur} stopOpacity="0.03" />
            </linearGradient>

            {/* Le volet qui découvre la courbe. Voir `.animate-revelation`. */}
            <clipPath id={`${id}-revelation`}>
              <rect
                x="0"
                y="0"
                width={L}
                height={H}
                className="animate-revelation"
              />
            </clipPath>
          </defs>

          {/*
           * Grille en retrait : elle situe, elle ne se regarde pas. Une ligne
           * par graduation — au-delà, le quadrillage concurrence la courbe.
           *
           * Elle prend la TEINTE DE LA COURBE, très diluée, et non le jeton
           * `--color-hairline`. Celui-ci est un vert sauge, accordé au fond de
           * page : sous une courbe violette, il posait une seconde famille de
           * couleur dans un cadre qui n’en demandait aucune. Un graphique qui
           * change de teinte entre sa grille et son tracé donne l’impression
           * de deux dessins superposés.
           *
           * Elle lit `couleur`, la même variable que le trait et le dégradé :
           * les trois ne peuvent donc plus diverger.
           *
           * 13 % — mesuré, pas choisi à l’œil. Une grille doit rester SOUS le
           * seuil où elle attire le regard, là où le tracé est à 100 % et
           * l’aire à 30 %. Au-dessus de 20 %, elle rivalise avec le bas de
           * l’aire et le graphique paraît quadrillé.
           */}
          {(vide ? [0, 0.25, 0.5, 0.75, 1].map((f) => f * plafond) : echelle).map(
            (v) => (
              <line
                key={v}
                x1={MARGE.gauche}
                x2={L - MARGE.droite}
                y1={y(v)}
                y2={y(v)}
                stroke={couleur}
                strokeOpacity="0.13"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            )
          )}

          <g clipPath={`url(#${id}-revelation)`}>
            {!vide && (
              <path d={aire} fill={`url(#${id}-aire)`} className="animate-aire" />
            )}

            {/*
             * La ligne se découvre à l'ouverture, sous un volet qui glisse.
             *
             * Elle se dessinait d'elle-même, par pointillés animés sur un tracé
             * normalisé — et le dernier tiers de la courbe n'apparaissait jamais :
             * `vector-effect` fait compter les pointillés en pixels d'écran, où
             * `pathLength` ne veut plus rien dire. Le détail est dans
             * `.animate-revelation`.
             *
             * La règle globale `prefers-reduced-motion` ramène la durée à zéro
             * pour qui l'a demandé — la courbe est alors simplement là.
             */}
            <path
              /* Repère du contrôle : deux `<path>` cohabitent, l'aire et la
                 ligne. Sans lui, `verif:courbes` viserait le premier venu. */
              data-trace="ligne"
              d={ligne}
              fill="none"
              /*
               * MÊME couleur que l’aire, et un trait FIN.
               *
               * `stroke` et les `stop` du dégradé reçoivent la même valeur : le
               * trait n’est pas une bordure d’une autre teinte, c’est le bord de
               * la masse, à pleine opacité. Deux couleurs différentes — un
               * contour sombre sur un remplissage clair — dessinent un objet
               * cerné, et c’est précisément ce qu’on ne veut plus.
               *
               * 1,5 px et non 2 : à deux, le contour domine son propre
               * remplissage. Et non 1 : `vector-effect` compte en pixels
               * d’ÉCRAN, or sur un téléphone à faible densité un trait d’un
               * pixel se fait avaler par l’anticrénelage — la courbe pâlit par
               * endroits, ce qui ressemble à un défaut d’affichage.
               *
               * Ce trait fin n’est possible que parce que la teinte tient
               * 12,9:1 sur le blanc, très au-dessus des 3:1 exigés d’un élément
               * graphique. Le vert clair d’avant (3,5:1) l’interdisait.
               */
              stroke={couleur}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>

          {/* Le dernier point, toujours marqué : c'est celui qu'on cherche. */}
          {points.length > 0 && (
            <circle
              cx={x(points.length - 1)}
              cy={y(points[points.length - 1].valeur)}
              r="3.5"
              fill={couleur}
              /* Anneau BLANC, et non `--color-cream` : ce jeton est passé au
                 vert sauge du fond de page, alors que la carte qui porte la
                 courbe est restée blanche. L’anneau détourait le point d’une
                 couleur qui n’existe nulle part autour de lui. */
              stroke="#fff"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Repère de survol : trait vertical et point grossi. */}
          {actif && survole !== null && (
            <g>
              <line
                x1={x(survole)}
                x2={x(survole)}
                y1={MARGE.haut}
                y2={base}
                stroke={couleur}
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
                opacity="0.55"
              />
              <circle
                cx={x(survole)}
                cy={y(actif.valeur)}
                r="5"
                fill={couleur}
                stroke="#fff"
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
        </svg>

        {/* Infobulle. Suit le point, reste dans le cadre aux extrémités. */}
        {actif && survole !== null && (
          <div
            className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 rounded-xl border border-hairline bg-white px-3 py-2 text-center shadow-lg"
            style={{
              left: `${Math.min(Math.max((x(survole) / L) * 100, 16), 86)}%`,
            }}
          >
            <span className="block text-[11px] text-ink-muted">
              {actif.etiquetteLongue}
            </span>
            <span className="block font-bold text-heading">
              {formatCFA(actif.valeur)}
            </span>
          </div>
        )}
      </div>

      {/*
       * Les mêmes chiffres, en tableau.
       *
       * Un graphique se lit à l'œil : il exclut qui n'y voit pas, et il ne se
       * copie pas. Le tableau est replié pour ne pas encombrer, mais il est
       * dans la page — pas derrière un appel réseau.
       */}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-ink-muted hover:text-brand">
          Voir les chiffres
        </summary>
        <table className="mt-2 w-full text-left text-xs">
          <caption className="sr-only">{libelle}, jour par jour</caption>
          <thead>
            <tr className="text-ink-muted">
              <th scope="col" className="py-1 font-semibold">
                Jour
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Montant
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.etiquetteLongue} className="border-t border-hairline">
                <td className="py-1">{p.etiquetteLongue}</td>
                <td className="py-1 text-right tabular-nums">
                  {formatCFA(p.valeur)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
