import Link from "next/link";

/**
 * Pagination (§46 : « Ne pas charger inutilement des milliers de données »).
 *
 * Composant serveur : la navigation se fait par liens, donc elle fonctionne
 * sans JavaScript — utile sur les terminaux d'entree de gamme et les reseaux
 * instables du public vise.
 */
export function Pagination({
  page,
  total,
  parPage,
  parametres = {},
  chemin,
}: {
  page: number;
  total: number;
  parPage: number;
  /** Paramètres à conserver (recherche, filtres). */
  parametres?: Record<string, string | undefined>;
  chemin: string;
}) {
  const pages = Math.max(1, Math.ceil(total / parPage));
  if (pages <= 1) return null;

  const lien = (n: number) => {
    const p = new URLSearchParams();
    for (const [cle, valeur] of Object.entries(parametres)) {
      if (valeur) p.set(cle, valeur);
    }
    if (n > 1) p.set("page", String(n));
    const q = p.toString();
    return q ? `${chemin}?${q}` : chemin;
  };

  const debut = (page - 1) * parPage + 1;
  const fin = Math.min(page * parPage, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 pt-4"
    >
      <p className="text-xs text-ink-muted">
        {debut}–{fin} sur {total}
      </p>

      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={lien(page - 1)}
            rel="prev"
            className="inline-flex items-center min-h-[44px] px-4 rounded-xl border border-hairline text-sm font-semibold hover:bg-brand-soft"
          >
            ← Précédent
          </Link>
        ) : (
          <span className="inline-flex items-center min-h-[44px] px-4 rounded-xl border border-hairline text-sm text-ink-muted opacity-50">
            ← Précédent
          </span>
        )}

        <span className="text-xs text-ink-muted px-1">
          Page {page} / {pages}
        </span>

        {page < pages ? (
          <Link
            href={lien(page + 1)}
            rel="next"
            className="inline-flex items-center min-h-[44px] px-4 rounded-xl border border-hairline text-sm font-semibold hover:bg-brand-soft"
          >
            Suivant →
          </Link>
        ) : (
          <span className="inline-flex items-center min-h-[44px] px-4 rounded-xl border border-hairline text-sm text-ink-muted opacity-50">
            Suivant →
          </span>
        )}
      </div>
    </nav>
  );
}
