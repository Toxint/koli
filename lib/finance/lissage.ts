/**
 * Le lissage des courbes — une spline cubique MONOTONE (Fritsch–Carlson).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Ce choix n'est pas esthétique. Un lissage ordinaire — Catmull-Rom,      │
 * │  tangentes centrées — DÉPASSE ses propres points.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Après une journée vide suivie d'une forte journée, une spline ordinaire
 * plonge sous zéro avant de remonter. Sur un graphique d'argent, ce creux
 * inventé se lit comme une perte qui n'a pas eu lieu — et il n'est écrit nulle
 * part dans les données.
 *
 * La spline monotone reste bornée par ses propres points : elle ne peut ni
 * inventer une bosse au-dessus du plus fort jour, ni un creux sous le plus
 * faible. `verif:courbes` l'exige explicitement.
 *
 * ── Pourquoi ce fichier existe ──────────────────────────────────────────────
 *
 * La fonction vivait dans `CourbePerformance`, et les courbes MINIATURES des
 * blocs de revenu avaient donc leur propre tracé — une polyligne anguleuse.
 * Deux lissages différents dans la même page, c'est deux formes différentes
 * pour la même série : le grand graphique disait une chose, la vignette à côté
 * en disait une autre.
 *
 * Elle est ici parce qu'elle est PURE — aucune base, aucun réseau, aucun
 * React —, ce qui la rend aussi éprouvable sans monter le moindre composant.
 */
export function cheminLisse(pts: { x: number; y: number }[]): string {
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
