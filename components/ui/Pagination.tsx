import Link from "next/link";

/**
 * Pagination (§46 : « Ne pas charger inutilement des milliers de données »).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Composant SERVEUR : la navigation se fait par des liens, donc elle      │
 * │  fonctionne sans une ligne de JavaScript.                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * C'est délibéré et cela le restera : le public visé est sur terminal
 * d'entrée de gamme et réseau instable (§70). Une pagination pilotée par un
 * état React laisserait quelqu'un bloqué sur la première page le temps que le
 * script arrive — et sur une liste de commandes, la page 2 est souvent celle
 * qu'on cherche.
 *
 * ── Les numéros, et pourquoi ils valent mieux que « Précédent / Suivant » ──
 *
 * Deux flèches obligent à parcourir. Des numéros permettent de SAUTER, et
 * surtout ils disent où l'on est dans quoi : « page 3 sur 15 » se lit d'un
 * coup d'œil, « Suivant » ne dit rien de la distance qui reste.
 */

/**
 * Les pages à afficher, avec leurs trous.
 *
 * On garde toujours la première, la dernière, et une fenêtre autour de la page
 * courante. Le reste devient une ellipse — jamais deux d'affilée, et jamais
 * une ellipse qui remplacerait un seul numéro : « 1 … 3 » occupe la place de
 * « 1 2 3 » en disant moins.
 */
function pagesAffichees(page: number, pages: number, fenetre = 1): (number | "…")[] {
  const gardees = new Set<number>([1, pages]);
  for (let p = page - fenetre; p <= page + fenetre; p++) {
    if (p >= 1 && p <= pages) gardees.add(p);
  }

  const triees = [...gardees].sort((a, b) => a - b);
  const sortie: (number | "…")[] = [];

  for (let i = 0; i < triees.length; i++) {
    const n = triees[i];
    const precedent = triees[i - 1];
    if (precedent !== undefined && n - precedent > 1) {
      // Un seul numéro sauté : on l'écrit plutôt que de le cacher.
      if (n - precedent === 2) sortie.push(precedent + 1);
      else sortie.push("…");
    }
    sortie.push(n);
  }

  return sortie;
}

export function Pagination({
  page,
  total,
  parPage,
  parametres = {},
  chemin,
  /** Ce qu'on compte, au pluriel : « commandes », « produits », « résultats ». */
  nom = "résultats",
}: {
  page: number;
  total: number;
  parPage: number;
  /** Paramètres à conserver (recherche, filtres). */
  parametres?: Record<string, string | undefined>;
  chemin: string;
  nom?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / parPage));

  const lien = (n: number) => {
    const p = new URLSearchParams();
    for (const [cle, valeur] of Object.entries(parametres)) {
      if (valeur) p.set(cle, valeur);
    }
    if (n > 1) p.set("page", String(n));
    const q = p.toString();
    return q ? `${chemin}?${q}` : chemin;
  };

  const debut = total === 0 ? 0 : (page - 1) * parPage + 1;
  const fin = Math.min(page * parPage, total);

  /*
   * Une seule page ⇒ on affiche quand même le décompte.
   *
   * L'ancienne version ne rendait RIEN. Sur une liste de trois commandes, le
   * vendeur ne voyait donc nulle part combien il en avait — et sur une liste
   * VIDE, rien ne distinguait « aucune commande » de « la page n'a pas fini
   * de charger ».
   */
  /*
   * ⚠ 44 px, et pas 40 : ce sont des CIBLES TACTILES (§74).
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │  Le défaut n'est apparu QU'EN CAMPAGNE, et sans qu'une ligne de code │
   * │  bouge : la pagination ne rend ses numéros qu'à partir de DEUX       │
   * │  pages. Tant que l'administration comptait peu d'utilisateurs, les   │
   * │  boutons n'existaient pas, et `verif:responsive` n'avait rien à      │
   * │  mesurer. La campagne a créé assez de comptes pour les faire naître. │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * C'est la même famille que le montant qui débordait le tableau de bord
   * livreur : un écran juste aujourd'hui, faux demain, selon la DONNÉE. Un
   * « 1 » et un « 2 » côte à côte à 40 px, sur un téléphone, se touchent l'un
   * pour l'autre — et l'on change de page sans l'avoir voulu.
   */
  const CASE =
    "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border text-sm font-medium transition-colors";

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-3"
    >
      <p className="text-xs text-ink-muted">
        Affichage de <strong className="font-semibold text-ink">{debut}</strong> à{" "}
        <strong className="font-semibold text-ink">{fin}</strong> sur{" "}
        <strong className="font-semibold text-ink">{total}</strong> {nom}
      </p>

      {pages > 1 && (
        <ul className="flex items-center gap-1">
          <li>
            {page > 1 ? (
              <Link
                href={lien(page - 1)}
                rel="prev"
                aria-label="Page précédente"
                className={`${CASE} border-hairline text-ink-muted hover:bg-brand-soft hover:text-brand`}
              >
                ‹
              </Link>
            ) : (
              /* Désactivé : un `<span>`, pas un lien mort. Un lien qui ne mène
                 nulle part reste focalisable au clavier et annonce une
                 destination qui n'existe pas. */
              <span
                aria-hidden="true"
                className={`${CASE} border-hairline/60 text-ink-muted/40`}
              >
                ‹
              </span>
            )}
          </li>

          {pagesAffichees(page, pages).map((p, i) =>
            p === "…" ? (
              <li key={`trou-${i}`} aria-hidden="true">
                <span className="px-1 text-sm text-ink-muted">…</span>
              </li>
            ) : (
              <li key={p}>
                <Link
                  href={lien(p)}
                  aria-label={`Page ${p}`}
                  aria-current={p === page ? "page" : undefined}
                  className={`${CASE} ${
                    p === page
                      ? "border-brand bg-brand-soft font-semibold text-brand"
                      : "border-hairline text-ink-muted hover:bg-brand-soft hover:text-brand"
                  }`}
                >
                  {p}
                </Link>
              </li>
            )
          )}

          <li>
            {page < pages ? (
              <Link
                href={lien(page + 1)}
                rel="next"
                aria-label="Page suivante"
                className={`${CASE} border-hairline text-ink-muted hover:bg-brand-soft hover:text-brand`}
              >
                ›
              </Link>
            ) : (
              <span
                aria-hidden="true"
                className={`${CASE} border-hairline/60 text-ink-muted/40`}
              >
                ›
              </span>
            )}
          </li>
        </ul>
      )}
    </nav>
  );
}
