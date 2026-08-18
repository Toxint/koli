"use client";

import Link from "next/link";
import { logoutAction } from "@/lib/auth/actions";

interface DashboardNavProps {
  userName: string;
  roleName: string;
  roleBadgeColor?: string;
}

export function DashboardNav({ userName, roleName, roleBadgeColor = "bg-amber-100 text-amber-900 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700" }: DashboardNavProps) {
  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand logo & role */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-500 flex items-center justify-center text-slate-950 font-black text-lg shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform border border-amber-300/40">
              K
            </div>
            <span className="font-black text-xl tracking-tight text-slate-900 dark:text-white hidden sm:inline">
              KOLI <span className="text-amber-500 text-xs font-mono font-bold tracking-widest uppercase">SAAS</span>
            </span>
          </Link>

          <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${roleBadgeColor}`}>
            {roleName}
          </span>
        </div>

        {/* User profile & logout */}
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <span className="block text-sm font-extrabold text-slate-900 dark:text-white">
              {userName}
            </span>
            <span className="block text-[11px] text-amber-600 dark:text-amber-400 font-extrabold">
              ⚡ Mode Test Actif
            </span>
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-900 text-xs font-medium transition-all flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Déconnexion</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
