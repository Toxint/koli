import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/actions";
import { chargerNotifications } from "@/lib/notifications/lecture";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { Pagination } from "@/components/ui/Pagination";
import { Icone } from "@/components/ui/Icone";
import { navigationDuRole, accueilDuRole, libelleRole } from "@/lib/navigation";
import { MarquerLu, ToutMarquerLu } from "@/components/domain/MarquerLu";
import { pluriel } from "@/lib/format";

export const metadata: Metadata = { title: "Notifications" };

const PAR_PAGE = 25;

const DATE_FR = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Boîte de notifications (§45).
 *
 * Une seule route pour les quatre rôles : la notification est la même notion
 * pour tout le monde, seuls son libellé et son lien changent. Quatre pages
 * quasi identiques auraient divergé à la première correction.
 */
export default async function PageNotifications({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filtre?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");

  const { page: pageBrute, filtre } = await searchParams;
  const page = Math.max(1, Number(pageBrute) || 1);
  const seulementNonLues = filtre === "non-lues";

  const { lignes, total, nonLues } = await chargerNotifications({
    userId: user.id,
    role: user.role,
    page,
    parPage: PAR_PAGE,
    seulementNonLues,
  });

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <DashboardNav
        userName={user.name}
        roleName={libelleRole(user.role)}
        homeHref={accueilDuRole(user.role)}
        navItems={navigationDuRole(user.role)}
        notificationsNonLues={nonLues}
      />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Notifications
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              {nonLues === 0
                ? "Tout est lu."
                : `${pluriel(nonLues, "notification non lue", "notifications non lues")}`}
            </p>
          </div>

          {nonLues > 0 && <ToutMarquerLu />}
        </div>

        {/* Deux onglets plutôt qu'un menu déroulant : il n'y a que deux états,
            et un lien se touche du pouce sans ouvrir de liste. */}
        <div className="flex gap-2">
          {[
            { libelle: "Toutes", actif: !seulementNonLues, href: "/notifications" },
            {
              libelle: "Non lues",
              actif: seulementNonLues,
              href: "/notifications?filtre=non-lues",
            },
          ].map((onglet) => (
            <Link
              key={onglet.href}
              href={onglet.href}
              aria-current={onglet.actif ? "page" : undefined}
              className={`inline-flex items-center min-h-[44px] px-4 rounded-xl text-xs font-bold transition-all ${
                onglet.actif
                  ? "bg-brand text-white shadow-md"
                  : "border border-hairline hover:bg-brand-soft/40"
              }`}
            >
              {onglet.libelle}
            </Link>
          ))}
        </div>

        <div className="carte-koli bg-white rounded-2xl p-4 sm:p-6">
          {lignes.length === 0 ? (
            <div className="text-center py-12">
              <Icone nom="cloche" className="w-9 h-9 mx-auto text-brand" />
              <p className="text-sm font-semibold mt-2">
                {seulementNonLues
                  ? "Aucune notification non lue"
                  : "Aucune notification"}
              </p>
              <p className="text-xs text-ink-muted mt-2 max-w-sm mx-auto">
                Vous serez prévenu ici à chaque étape : paiement, mise en
                livraison, remise du colis, versement.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {lignes.map((n) => (
                <li
                  key={n.id}
                  className={`py-3 first:pt-0 last:pb-0 ${
                    n.lue ? "" : "border-l-2 border-brand -ml-4 pl-4"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      className={`text-sm ${n.lue ? "font-medium" : "font-bold"}`}
                    >
                      {n.titre}
                    </span>
                    {!n.lue && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-soft text-brand">
                        Nouveau
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-ink-muted mt-0.5 break-words">
                    {n.detail}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                    <span className="text-xs text-ink-muted">
                      {DATE_FR.format(n.quand)}
                    </span>

                    {/* §45 : le lien vers l'objet concerné. Une notification
                        qui annonce sans y mener informe sans servir. */}
                    {n.lien && (
                      <Link
                        href={n.lien}
                        className="inline-flex items-center min-h-[44px] text-xs font-bold text-brand hover:underline"
                      >
                        {n.reference ? `Voir ${n.reference}` : "Voir"}
                      </Link>
                    )}

                    {!n.lue && <MarquerLu id={n.id} />}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Pagination
            page={page}
            total={total}
            parPage={PAR_PAGE}
            parametres={{ filtre }}
            chemin="/notifications"
          />
        </div>
      </main>
    </div>
  );
}
