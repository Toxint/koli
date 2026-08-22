import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Prisma, UserRole, UserStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { NAV_ADMIN } from "@/lib/navigation";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import { BoutonSuspension } from "@/components/domain/BoutonSuspension";
import { pluriel } from "@/lib/format";
import { Icone } from "@/components/ui/Icone";

export const metadata: Metadata = { title: "Utilisateurs" };

const PAR_PAGE = 20;

const LIBELLE_ROLE: Record<string, string> = {
  ADMIN: "Administrateur",
  SELLER: "Vendeur",
  DRIVER: "Livreur",
  CLIENT: "Client",
};

export default async function AdminUtilisateursPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    role?: string;
    compte?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/connexion");
  }

  const { q, role, compte, page: pageBrute } = await searchParams;
  const page = Math.max(1, Number(pageBrute) || 1);

  // §46 : recherche, filtre et pagination en base.
  const where: Prisma.UserWhereInput = {
    ...(role ? { role: role as UserRole } : {}),
    ...(compte ? { status: compte as UserStatus } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q } },
            { phone: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : {}),
  };

  const [utilisateurs, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { sellerProfile: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAR_PAGE,
      take: PAR_PAGE,
    }),
    prisma.user.count({ where }),
  ]);

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[15.5rem]">
      <DashboardNav
        userName={user.name}
        roleName="Admin"
        homeHref="/admin/dashboard"
        navItems={NAV_ADMIN}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Utilisateurs
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {pluriel(total, "compte")} — recherche, filtre et suspension (§35).
          </p>
        </div>

        {/* Deux filtres distincts : le role et l'etat du compte. Ils etaient
            auparavant confondus sous un unique parametre « statut » qui
            filtrait en realite par role — impossible d'isoler les comptes
            suspendus, que le §35 demande pourtant de pouvoir reexaminer. */}
        <BarreRecherche
          placeholder="Nom, téléphone ou email…"
          filtres={[
            {
              cle: "role",
              libelle: "Filtrer par rôle",
              libelleTous: "Tous les rôles",
              options: [
                { valeur: "SELLER", libelle: "Vendeurs" },
                { valeur: "CLIENT", libelle: "Clients" },
                { valeur: "DRIVER", libelle: "Livreurs" },
                { valeur: "ADMIN", libelle: "Administrateurs" },
              ],
            },
            {
              cle: "compte",
              libelle: "Filtrer par état du compte",
              libelleTous: "Tous les comptes",
              options: [
                { valeur: "ACTIVE", libelle: "Actifs" },
                { valeur: "SUSPENDED", libelle: "Suspendus" },
              ],
            },
          ]}
        />

        <div className="rounded-2xl border border-hairline p-4 sm:p-6">
          {utilisateurs.length === 0 ? (
            <div className="text-center py-12">
              <Icone nom="utilisateurs" className="w-8 h-8 mx-auto text-brand" />
              <p className="text-sm font-semibold">
                Aucun utilisateur ne correspond à cette recherche
              </p>
            </div>
          ) : (
            /* §8 : cartes sur mobile, grille à partir de la tablette. */
            <ul className="space-y-3 md:space-y-0 md:divide-y md:divide-hairline">
              <li className="hidden md:grid md:grid-cols-[1.3fr_1.5fr_.9fr_.9fr_auto] md:gap-4 md:pb-3 border-b border-hairline text-xs font-semibold text-ink-muted uppercase tracking-wider">
                <span>Nom</span>
                <span>Contact</span>
                <span>Rôle</span>
                <span>Statut</span>
                <span className="text-right">Action</span>
              </li>

              {utilisateurs.map((u) => (
                <li
                  key={u.id}
                  className="rounded-2xl border border-hairline p-4 md:border-0 md:rounded-none md:p-0 md:py-4 md:grid md:grid-cols-[1.3fr_1.5fr_.9fr_.9fr_auto] md:gap-4 md:items-center"
                >
                  <span className="block font-semibold break-words">
                    {u.name}
                  </span>

                  <div className="mt-1 md:mt-0 min-w-0">
                    <a
                      href={`tel:${u.phone.replace(/\s/g, "")}`}
                      className="inline-flex items-center min-h-[44px] md:min-h-0 text-xs font-mono text-ink-muted whitespace-nowrap hover:text-brand"
                    >
                      {u.phone}
                    </a>
                    {u.email && (
                      <span className="block text-xs text-ink-muted break-all">
                        {u.email}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 md:mt-0 flex flex-wrap gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-soft text-brand">
                      {LIBELLE_ROLE[u.role] ?? u.role}
                    </span>
                    <span
                      className={`md:hidden px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        u.status === "ACTIVE"
                          ? "bg-brand-soft text-brand"
                          : "bg-red-100 text-danger"
                      }`}
                    >
                      {u.status === "ACTIVE" ? "Actif" : "Suspendu"}
                    </span>
                  </div>

                  <div className="hidden md:block">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        u.status === "ACTIVE"
                          ? "bg-brand-soft text-brand"
                          : "bg-red-100 text-danger"
                      }`}
                    >
                      {u.status === "ACTIVE" ? "Actif" : "Suspendu"}
                    </span>
                  </div>

                  <div className="mt-3 md:mt-0 md:text-right">
                    {u.id === user.id ? (
                      <span className="text-xs text-ink-muted">
                        Votre compte
                      </span>
                    ) : (
                      <BoutonSuspension
                        userId={u.id}
                        nom={u.name}
                        statut={u.status}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Pagination
            page={page}
            total={total}
            parPage={PAR_PAGE}
            parametres={{ q, role, compte }}
            chemin="/admin/utilisateurs"
          />
        </div>
      </main>
    </div>
  );
}
