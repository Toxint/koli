"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/lib/auth/actions";
import { Icone } from "@/components/ui/Icone";
import type { NavItem } from "@/lib/navigation";

export type { NavItem };

interface DashboardNavProps {
  userName: string;
  roleName: string;
  roleBadgeColor?: string;
  /** Accueil de l'espace : le logo y renvoie, pas vers le site public. */
  homeHref: string;
  /** Uniquement des routes existantes — un lien mort est pire que pas de lien. */
  navItems?: NavItem[];
}

/**
 * Menu latéral des espaces connectés (§10).
 *
 * Fixe à gauche à partir de 1024px, tiroir glissant en dessous. Les pages
 * réservent la place avec `lg:pl-[15.5rem]` : la barre étant `fixed`, elle
 * sort du flux et recouvrirait sinon le contenu.
 *
 * Le composant conserve son nom et ses props d'origine bien qu'il ne soit plus
 * un en-tête horizontal : les quinze pages qui l'utilisent n'ont ainsi rien à
 * changer d'autre que la classe de leur conteneur.
 */
export function DashboardNav({
  userName,
  roleName,
  homeHref,
  navItems = [],
}: DashboardNavProps) {
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  const chemin = usePathname();

  /**
   * Entrée active = le plus long préfixe correspondant.
   *
   * Une simple comparaison `startsWith` allumerait « Commandes » ET
   * « Nouvelle commande » sur /vendeur/commandes/nouvelle ; l'égalité stricte,
   * elle, n'allumerait rien sur /vendeur/produits/<id>.
   */
  const hrefActif = navItems
    .filter((i) => chemin === i.href || chemin.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  // Fermeture au clavier (§69) : un tiroir qui ne se ferme qu'à la souris
  // piège l'utilisateur au clavier.
  useEffect(() => {
    if (!tiroirOuvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTiroirOuvert(false);
    };
    document.addEventListener("keydown", surTouche);
    // Le fond ne doit pas défiler sous le tiroir.
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = avant;
    };
  }, [tiroirOuvert]);

  const initiales = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? "")
    .join("");

  const hrefProfil =
    navItems.find((i) => i.icone === "profil")?.href ?? homeHref;

  const contenu = (
    <div
      data-menu-koli=""
      className="flex h-full flex-col gap-5 bg-menu bg-gradient-to-b from-menu to-menu-deep px-3.5 py-5 lg:rounded-3xl"
    >
      <Link
        href={homeHref}
        aria-label="Accueil de mon espace KOLI"
        onClick={() => setTiroirOuvert(false)}
        className="flex items-center gap-2.5 px-1.5 min-h-[44px] shrink-0 group"
      >
        <span className="w-9 h-9 rounded-xl bg-gold flex items-center justify-center text-menu-deep font-bold text-lg group-hover:scale-105 transition-transform">
          K
        </span>
        <span className="font-bold text-xl tracking-tight text-white">
          KOLI
        </span>
      </Link>

      {/* Carte d'identité : rappelle en permanence sous quel compte on agit —
          un vendeur et un administrateur ne voient pas les mêmes montants. */}
      <Link
        href={hrefProfil}
        onClick={() => setTiroirOuvert(false)}
        className="flex items-center gap-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2.5 min-h-[44px] transition-colors"
      >
        <span
          aria-hidden="true"
          className="w-10 h-10 shrink-0 rounded-full bg-gold text-menu-deep flex items-center justify-center font-bold text-sm"
        >
          {initiales || "K"}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white truncate">
            {userName}
          </span>
          <span className="block text-[11px] text-white/70 truncate">
            {roleName} · Voir mon profil
          </span>
        </span>
      </Link>

      <nav aria-label="Navigation de l'espace" className="min-w-0 flex-1">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const actif = item.href === hrefActif;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setTiroirOuvert(false)}
                  aria-current={actif ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-2xl px-3 min-h-[46px] text-sm font-semibold transition-colors ${
                    actif
                      ? "bg-white text-brand-strong shadow-sm"
                      : "text-white/75 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icone nom={item.icone} className="w-5 h-5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-2 shrink-0">
        {/* §75 : l'indicateur de mode test reste visible à toutes les tailles. */}
        <div className="rounded-2xl bg-white/10 border border-gold/30 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gold">
            <Icone nom="eclair" className="w-3.5 h-3.5" /> Mode test
          </span>
          <span className="block text-[11px] text-white/70 mt-0.5">
            Aucun paiement réel
          </span>
        </div>

        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 rounded-2xl px-3 min-h-[46px] text-sm font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Icone nom="deconnexion" className="w-5 h-5 shrink-0" />
            <span>Déconnexion</span>
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Barre latérale permanente à partir du laptop. */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-[15.5rem] z-40 p-3">
        {contenu}
      </aside>

      {/* En-tête compact sur mobile et tablette. */}
      <header className="lg:hidden sticky top-0 z-30 bg-menu bg-gradient-to-r from-menu to-menu-deep">
        <div className="px-4 h-16 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setTiroirOuvert(true)}
            aria-expanded={tiroirOuvert}
            aria-controls="tiroir-menu"
            aria-label="Ouvrir le menu"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 text-white"
          >
            <svg
              className="w-5 h-5"
              aria-hidden="true"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link
            href={homeHref}
            aria-label="Accueil de mon espace KOLI"
            className="flex items-center gap-2 min-h-[44px]"
          >
            <span className="w-8 h-8 rounded-lg bg-gold flex items-center justify-center text-menu-deep font-bold">
              K
            </span>
            <span className="font-bold text-lg tracking-tight text-white">
              KOLI
            </span>
          </Link>

          <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-gold text-[11px] font-semibold border border-gold/30 whitespace-nowrap">
            <Icone nom="eclair" className="w-3.5 h-3.5" /> Test
          </span>
        </div>
      </header>

      {tiroirOuvert && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Voile cliquable : fermer en touchant à côté est le geste attendu. */}
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setTiroirOuvert(false)}
            className="absolute inset-0 bg-menu-deep/60"
          />
          <div
            id="tiroir-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de l'espace"
            className="relative w-[15.5rem] max-w-[85vw] h-full animate-tiroir overflow-y-auto"
          >
            {contenu}
          </div>
        </div>
      )}
    </>
  );
}
