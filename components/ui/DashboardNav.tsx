"use client";

import { useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";

export interface NavItem {
  label: string;
  href: string;
}

interface DashboardNavProps {
  userName: string;
  roleName: string;
  roleBadgeColor?: string;
  /** Accueil de l'espace : le logo y renvoie, pas vers le site public. */
  homeHref: string;
  /** Uniquement des routes existantes — un lien mort est pire que pas de lien. */
  navItems?: NavItem[];
}

export function DashboardNav({
  userName,
  roleName,
  roleBadgeColor = "bg-brand-soft text-brand dark:bg-amber-950/80 dark:text-amber-300 border border-brand-border dark:border-amber-700",
  homeHref,
  navItems = [],
}: DashboardNavProps) {
  const [menuOuvert, setMenuOuvert] = useState(false);

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-hairline dark:border-slate-800 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        <Link
          href={homeHref}
          aria-label="Accueil de mon espace KOLI"
          className="flex items-center gap-2 group min-h-[44px] shrink-0"
        >
          <span className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center text-white font-bold text-lg shadow-md shadow-brand/25 group-hover:scale-105 transition-transform border border-brand-border/40">
            K
          </span>
          <span className="font-bold text-lg sm:text-xl tracking-tight text-brand dark:text-white">
            KOLI
          </span>
        </Link>

        {/* Navigation horizontale a partir de la tablette (§8 : « navigation
            complete » sur grand ecran). */}
        {navItems.length > 0 && (
          <nav className="hidden lg:flex items-center gap-1 min-w-0">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex items-center min-h-[44px] px-3 rounded-lg text-sm font-semibold text-ink-muted dark:text-slate-300 hover:text-brand hover:bg-brand-soft dark:hover:text-emerald-400 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="hidden xl:block text-sm font-semibold text-brand dark:text-white truncate max-w-[14rem]">
            {userName}
          </span>

          {/* §75 : l'indicateur de mode test reste visible a toutes les tailles. */}
          <span className="shrink-0 px-2.5 py-1 rounded-full bg-test-mode-surface dark:bg-amber-950/80 text-test-mode dark:text-amber-300 text-[11px] font-semibold border border-brand-border/60 dark:border-amber-700 whitespace-nowrap">
            ⚡ Test
          </span>

          <form action={logoutAction} className="hidden lg:block shrink-0">
            <button
              type="submit"
              className="min-h-[44px] px-3 rounded-lg border border-hairline dark:border-slate-800 text-ink-muted dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900 text-xs font-medium transition-all flex items-center gap-1.5"
            >
              <svg
                className="w-4 h-4 shrink-0"
                aria-hidden="true"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              <span>Déconnexion</span>
            </button>
          </form>

          {/* Menu mobile (§8, §10, §68). */}
          <button
            type="button"
            onClick={() => setMenuOuvert((v) => !v)}
            aria-expanded={menuOuvert}
            aria-controls="menu-espace"
            aria-label={menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}
            className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-hairline dark:border-slate-800 text-brand dark:text-slate-200"
          >
            <svg
              className="w-5 h-5"
              aria-hidden="true"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {menuOuvert ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {menuOuvert && (
        <div
          id="menu-espace"
          className="lg:hidden border-t border-hairline dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-1"
        >
          <div className="pb-2 mb-1 border-b border-slate-100 dark:border-slate-800">
            <span className="block text-sm font-semibold text-brand dark:text-white truncate">
              {userName}
            </span>
            <span
              className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${roleBadgeColor}`}
            >
              {roleName}
            </span>
          </div>

          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOuvert(false)}
              className="flex items-center min-h-[48px] px-3 rounded-lg text-sm font-semibold text-brand dark:text-slate-200 hover:bg-brand-soft dark:hover:bg-slate-800"
            >
              {item.label}
            </Link>
          ))}

          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full flex items-center min-h-[48px] px-3 rounded-lg text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              Déconnexion
            </button>
          </form>
        </div>
      )}
    </header>
  );
}
