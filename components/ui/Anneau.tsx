/**
 * L'anneau de pourcentage — le cercle segmenté de la maquette de référence.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Une proportion, et une seule. Un chiffre au milieu, un libellé dessous. │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Cinq décisions, et chacune se déferait sans être écrite :
 *
 * - **Il porte une PROPORTION, jamais un total.** Un anneau dit « telle part
 *   de tel ensemble » ; y mettre un montant ou un décompte donnerait un
 *   dessin qui ne représente rien — la boucle serait pleine quoi qu'il
 *   arrive. Le composant prend donc `part` et `total`, et calcule lui-même.
 *
 * - **Dénominateur nul ⇒ on n'affiche PAS 0 %.** Zéro commande sur zéro n'est
 *   pas « 0 % de réussite », c'est une question sans objet. L'anneau reste
 *   vide et le chiffre devient « — » : un pourcentage faux se croit, un tiret
 *   se remarque.
 *
 * - **Segmenté, pas continu**, comme la référence — `stroke-dasharray` sur un
 *   cercle. Les tirets se comptent du regard, ce qu'un arc plein ne permet
 *   pas : on lit « un peu plus des trois quarts » sans lire le nombre.
 *
 * - **Le texte est en HTML posé PAR-DESSUS, jamais en `<text>` SVG.** Le SVG
 *   est mis à l'échelle, son texte aussi : un 11 px dans un repère de 120
 *   s'affiche à 20 sur un grand écran. C'est la même règle que pour les
 *   graduations des courbes.
 *
 * - **`aria-hidden` sur le dessin, la valeur dans le texte.** Un lecteur
 *   d'écran n'a rien à faire d'un cercle ; il doit entendre « 78 % — commandes
 *   terminées ». Le dessin ne porte donc aucune information qui ne soit pas
 *   écrite à côté.
 */
export function Anneau({
  part,
  total,
  libelle,
  couleur = "var(--color-brand)",
}: {
  part: number;
  /** Dénominateur. Zéro ⇒ l'anneau reste vide et le chiffre devient « — ». */
  total: number;
  libelle: string;
  couleur?: string;
}) {
  const mesurable = total > 0;
  const ratio = mesurable ? Math.min(1, Math.max(0, part / total)) : 0;
  const pourcent = Math.round(ratio * 100);

  /*
   * Rayon 52 dans un repère de 120 : la circonférence vaut donc 2πr ≈ 326,7.
   * On la calcule au lieu de l'écrire — une constante recopiée se désaccorde
   * du rayon à la première retouche, et l'anneau se remplit alors de travers
   * sans qu'aucune erreur ne le signale.
   */
  const R = 52;
  const CIRC = 2 * Math.PI * R;

  /* 22 segments : assez pour qu on les compte, assez peu pour qu ils restent
     distincts a 96 px de large sur un telephone. Le trait est passe a 16 :
     a 13, l anneau paraissait un filet pose autour du chiffre plutot qu une
     masse, et la reference en fait au contraire l element le plus epais de
     sa carte. */
  const SEGMENTS = 22;
  const pas = CIRC / SEGMENTS;
  const tiret = pas * 0.62;

  return (
    <div className="flex min-w-0 flex-col items-center justify-center">
      <div className="relative h-[9rem] w-[9rem]">
        <svg
          aria-hidden="true"
          viewBox="0 0 120 120"
          className="h-full w-full -rotate-90"
        >
          {/*
            * CHAQUE segment est dessiné séparément.
            *
            * Un seul cercle pointillé plus un `stroke-dashoffset` paraît plus
            * court, mais les deux réglages se disputent le même attribut :
            * l'un découpe les tirets, l'autre la part remplie, et l'on ne peut
            * pas exprimer les deux à la fois. Un tiret par élément rend le
            * remplissage EXACT et le code lisible.
            *
            * `dasharray = tiret, CIRC` ne laisse qu'un seul tiret visible, et
            * `dashoffset = -i × pas` le place au i-ème cran.
            */}
          {Array.from({ length: SEGMENTS }, (_, i) => {
            /* `round` et non `floor` : à 97 %, un plancher laisserait le
               dernier segment éteint et l'anneau paraîtrait incomplet alors
               qu'il est pratiquement plein. */
            const allumes = mesurable ? Math.round(ratio * SEGMENTS) : 0;
            return (
              <circle
                key={i}
                cx="60"
                cy="60"
                r={R}
                fill="none"
                stroke={i < allumes ? couleur : "var(--color-hairline)"}
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray={`${tiret} ${CIRC}`}
                strokeDashoffset={-i * pas}
              />
            );
          })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-titre text-[1.75rem] font-extrabold text-heading">
            {mesurable ? `${pourcent} %` : "—"}
          </span>
        </div>
      </div>

      <p className="mt-1 text-center text-xs text-ink-muted">{libelle}</p>
      <p className="sr-only">
        {mesurable
          ? `${pourcent} pour cent — ${libelle}, ${part} sur ${total}`
          : `${libelle} : aucune donnée`}
      </p>
    </div>
  );
}
