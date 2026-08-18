import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { DashboardNav } from "@/components/ui/DashboardNav";
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
  const funds = await prisma.fund.findMany();

  const totalSecuredAmount = funds
    .filter((f) => f.secured)
    .reduce((acc, f) => acc + f.amount, 0);

  const totalReleasedAmount = funds
    .filter((f) => f.released)
    .reduce((acc, f) => acc + f.amount, 0);

  const users = await prisma.user.findMany({
    include: { sellerProfile: true, driverProfile: true, customerProfile: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <DashboardNav
        userName={user.name}
        roleName="Administration KOLI"
        roleBadgeColor="bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300"
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 rounded-2xl p-6 sm:p-8 text-white shadow-xl shadow-slate-900/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border border-slate-800">
          <div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold uppercase tracking-wider mb-2 inline-block">
              Super-Admin Control Panel
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Console Administrateur KOLI 🛡️
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Supervision globale des utilisateurs, fonds sécurisés, livraisons et litiges (Mode Test MVP).
            </p>
          </div>
        </div>

        {/* Global KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Total Utilisateurs
            </span>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {usersCount}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {sellersCount} Vendeurs • {driversCount} Livreurs • {customersCount} Clients
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Commandes Total
            </span>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {totalOrdersCount}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Sur toute la plateforme
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Volume Séquestré (Test)
            </span>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {formatCFA(totalSecuredAmount)}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Fonds actuellement bloqués
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Volume Libéré (Test)
            </span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {formatCFA(totalReleasedAmount)}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Fonds transférés aux vendeurs
            </p>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Derniers utilisateurs inscrits
            </h2>
            <p className="text-xs text-slate-500">
              Vérification des comptes et statuts
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <th className="pb-3">Nom</th>
                  <th className="pb-3">Téléphone / Email</th>
                  <th className="pb-3">Rôle</th>
                  <th className="pb-3">Statut Compte</th>
                  <th className="pb-3">Statut Vérification Vendeur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-4 font-bold">{u.name}</td>
                    <td className="py-4 text-xs font-mono text-slate-500">
                      {u.phone}
                      {u.email && <span className="block text-slate-400 font-sans">{u.email}</span>}
                    </td>
                    <td className="py-4">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800">
                        {u.role}
                      </span>
                    </td>
                    <td className="py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        u.status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                      }`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="py-4">
                      {u.sellerProfile ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                          {u.sellerProfile.verificationStatus}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
