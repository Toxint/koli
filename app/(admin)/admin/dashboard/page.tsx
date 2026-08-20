import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { NAV_ADMIN } from "@/lib/navigation";
import { formatCFA } from "@/lib/format";

export default async function AdminDashboardPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/connexion");
  }

  const usersCount = await prisma.user.count();
  const sellersCount = await prisma.sellerProfile.count();
  const driversCount = await prisma.driverProfile.count();
  const customersCount = await prisma.customerProfile.count();

  const totalOrdersCount = await prisma.order.count();

  // Agrege en base plutot que de charger toutes les lignes en memoire (§46, §70).
  // `released` ne remet pas `secured` a false : sans le filtre `released: false`,
  // les fonds deja verses restaient comptes comme sequestres et l'engagement
  // de la plateforme etait surevalue de tout le volume libere.
  const [sequestre, libere] = await Promise.all([
    prisma.fund.aggregate({
      where: { secured: true, released: false },
      _sum: { amount: true },
    }),
    prisma.fund.aggregate({
      where: { released: true },
      _sum: { amount: true },
    }),
  ]);

  const totalSecuredAmount = sequestre._sum.amount ?? 0;
  const totalReleasedAmount = libere._sum.amount ?? 0;

  const users = await prisma.user.findMany({
    include: { sellerProfile: true, driverProfile: true, customerProfile: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-brand dark:text-white">
      <DashboardNav
        userName={user.name}
        roleName="Admin"
        roleBadgeColor="bg-brand-soft text-brand border border-brand-border"
        homeHref="/admin/dashboard"
        navItems={NAV_ADMIN}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="bg-brand rounded-2xl p-6 sm:p-8 text-white shadow-lg shadow-brand/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border border-brand-border">
          <div>
            <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-mono font-bold uppercase tracking-wider mb-2 inline-block">
              Console d&apos;administration
            </span>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              Administration KOLI 🛡️
            </h1>
            <p className="text-white/90 text-sm mt-1">
              Supervision des utilisateurs, des fonds sécurisés, des livraisons et des litiges (mode test).
            </p>
          </div>
        </div>

        {/* Global KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-hairline dark:border-slate-800 shadow-sm">
            <span className="text-xs font-bold text-ink-muted uppercase tracking-wider block mb-1">
              Total Utilisateurs
            </span>
            <div className="text-2xl font-bold text-brand dark:text-white">
              {usersCount}
            </div>
            <p className="text-[11px] text-ink-muted mt-1">
              {sellersCount} Vendeurs • {driversCount} Livreurs • {customersCount} Clients
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-hairline dark:border-slate-800 shadow-sm">
            <span className="text-xs font-bold text-ink-muted uppercase tracking-wider block mb-1">
              Commandes Total
            </span>
            <div className="text-2xl font-bold text-brand dark:text-white">
              {totalOrdersCount}
            </div>
            <p className="text-[11px] text-ink-muted mt-1">
              Sur toute la plateforme
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-hairline dark:border-slate-800 shadow-sm">
            <span className="text-xs font-bold text-ink-muted uppercase tracking-wider block mb-1">
              Volume Séquestré (Test)
            </span>
            <div className="text-2xl font-bold text-brand dark:text-amber-400">
              {formatCFA(totalSecuredAmount)}
            </div>
            <p className="text-[11px] text-ink-muted mt-1">
              Fonds actuellement bloqués
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-hairline dark:border-slate-800 shadow-sm">
            <span className="text-xs font-bold text-ink-muted uppercase tracking-wider block mb-1">
              Volume Libéré (Test)
            </span>
            <div className="text-2xl font-bold text-brand dark:text-emerald-400">
              {formatCFA(totalReleasedAmount)}
            </div>
            <p className="text-[11px] text-ink-muted mt-1">
              Fonds transférés aux vendeurs
            </p>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-hairline dark:border-slate-800 shadow-sm p-6">
          <div className="mb-6">
            <h2 className="text-lg font-bold dark:text-white">
              Derniers utilisateurs inscrits
            </h2>
            <p className="text-xs text-ink-muted">
              Vérification des comptes et statuts
            </p>
          </div>

          {/* §8 et §68 : cartes sur mobile, grille a partir de la tablette.
              Le tableau a 5 colonnes demandait ~509px pour une carte de 240px. */}
          {users.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-hairline dark:border-slate-800 rounded-xl">
              <span className="text-4xl block mb-2">👥</span>
              <p className="text-sm font-semibold text-brand dark:text-slate-300">
                Aucun utilisateur inscrit pour l&apos;instant
              </p>
            </div>
          ) : (
            <ul className="space-y-3 md:space-y-0 md:divide-y md:divide-hairline md:dark:divide-slate-800/60">
              <li className="hidden md:grid md:grid-cols-[1.2fr_1.6fr_.8fr_.9fr_1fr] md:gap-4 md:pb-3 border-b border-hairline dark:border-slate-800 text-xs font-bold text-ink-muted dark:text-slate-400 uppercase tracking-wider">
                <span>Nom</span>
                <span>Contact</span>
                <span>Rôle</span>
                <span>Compte</span>
                <span>Vérification</span>
              </li>

              {users.map((u) => (
                <li
                  key={u.id}
                  className="rounded-2xl border border-hairline dark:border-slate-800 p-4 md:border-0 md:rounded-none md:p-0 md:py-4 md:grid md:grid-cols-[1.2fr_1.6fr_.8fr_.9fr_1fr] md:gap-4 md:items-center"
                >
                  <span className="block font-bold break-words">{u.name}</span>

                  <div className="mt-1 md:mt-0 min-w-0">
                    <a
                      href={`tel:${u.phone.replace(/\s/g, "")}`}
                      className="inline-flex items-center min-h-[44px] md:min-h-0 text-xs font-mono text-ink-muted dark:text-slate-400 whitespace-nowrap hover:text-brand"
                    >
                      {u.phone}
                    </a>
                    {u.email && (
                      <span className="block text-xs text-ink-muted dark:text-slate-400 break-all">
                        {u.email}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 md:mt-0 flex flex-wrap gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-soft text-brand dark:bg-slate-800 dark:text-slate-300">
                      {u.role}
                    </span>
                    <span
                      className={`md:hidden px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        u.status === "ACTIVE"
                          ? "bg-brand-soft text-brand dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      }`}
                    >
                      {u.status}
                    </span>
                    {u.sellerProfile && (
                      <span className="md:hidden px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        {u.sellerProfile.verificationStatus}
                      </span>
                    )}
                  </div>

                  <div className="hidden md:block">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        u.status === "ACTIVE"
                          ? "bg-brand-soft text-brand dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      }`}
                    >
                      {u.status}
                    </span>
                  </div>

                  <div className="hidden md:block">
                    {u.sellerProfile ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        {u.sellerProfile.verificationStatus}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-muted dark:text-slate-400">
                        Non applicable
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
