import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { MenuEspace } from "@/components/ui/MenuEspace";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import { chargerJournalAudit } from "@/lib/audit/liste";
import { libelleAction, resumerDetails } from "@/lib/audit/journal";
import { Icone } from "@/components/ui/Icone";
import { pluriel } from "@/lib/format";

export const metadata: Metadata = { title: "Journal d'audit" };

const PAR_PAGE = 30;

const DATE_FR = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const LIBELLE_ROLE: Record<string, string> = {
  ADMIN: "Administrateur",
  SELLER: "Vendeur",
  CUSTOMER: "Client",
  DRIVER: "Livreur",
};

/**
 * Journal d'audit (§48).
 *
 * « L'audit doit permettre de comprendre ce qui s'est passé. » Chaque ligne
 * répond donc aux quatre questions du §48 — qui, quoi, sur quoi, quand — et
 * ajoute le avant → après, sans lequel « taux modifié » n'apprend rien.
 */
export default async function JournalAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/connexion");
  }

  const { q, action, page: pageBrute } = await searchParams;
  const page = Math.max(1, Number(pageBrute) || 1);

  const journal = await chargerJournalAudit({
    action,
    recherche: q,
    page,
    parPage: PAR_PAGE,
  });

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <MenuEspace user={user} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Journal d&apos;audit
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            {pluriel(journal.total, "acte enregistré", "actes enregistrés")} ·
            en ajout seul, jamais modifiés
          </p>
        </div>

        <BarreRecherche
          placeholder="Référence, nom de l'auteur…"
          filtres={[
            {
              cle: "action",
              libelle: "Filtrer par type d'acte",
              libelleTous: "Tous les actes",
              options: journal.actionsPresentes.map((a) => ({
                valeur: a,
                libelle: libelleAction(a),
              })),
            },
          ]}
        />

        <div className="carte-koli bg-white rounded-2xl p-4 sm:p-6">
          {journal.lignes.length === 0 ? (
            <div className="text-center py-12">
              <Icone nom="document" className="w-9 h-9 mx-auto text-brand" />
              <p className="text-sm font-semibold mt-2">
                {q || action
                  ? "Aucun acte ne correspond à cette recherche"
                  : "Aucun acte enregistré pour l'instant"}
              </p>
              {!q && !action && (
                <p className="text-xs text-ink-muted mt-2 max-w-md mx-auto">
                  Le journal se remplit dès qu&apos;une décision est prise :
                  changement du taux de commission, suspension d&apos;un compte,
                  vérification d&apos;un vendeur, litige tranché, remboursement.
                </p>
              )}
            </div>
          ) : (
            /* Cartes empilées et non tableau : six colonnes ne tiennent pas sur
               un écran de 320px, et l'administration se consulte aussi depuis
               un téléphone. */
            <ul className="divide-y divide-hairline">
              {journal.lignes.map((ligne) => {
                const resume = resumerDetails(ligne.details);

                return (
                  <li key={ligne.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="font-semibold text-sm">
                      {libelleAction(ligne.action)}
                    </p>

                    {resume && (
                      <p className="text-sm mt-0.5 break-words">{resume}</p>
                    )}

                    {/* L'identifiant technique passe APRÈS et en retrait : il
                        sert à retrouver l'objet exact, mais ce n'est pas ce
                        qu'on lit. Mis en avant, il noyait la seule ligne qui
                        dit ce qui s'est réellement passé. */}
                    <p className="font-mono text-[11px] text-ink-muted mt-0.5 break-all">
                      {ligne.entite} · {ligne.entiteId}
                    </p>

                    <p className="text-xs text-ink-muted mt-0.5">
                      {ligne.acteur}
                      {ligne.acteurRole
                        ? ` (${LIBELLE_ROLE[ligne.acteurRole] ?? ligne.acteurRole})`
                        : ""}
                      {/* Le compte a disparu, mais l'acte reste attribué : le
                          nom a été recopié à l'écriture, précisément pour ça. */}
                      {!ligne.acteurExiste && " · compte supprimé depuis"}
                      {" — "}
                      {DATE_FR.format(ligne.quand)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          <Pagination
            page={page}
            total={journal.total}
            parPage={PAR_PAGE}
            parametres={{ q, action }}
            chemin="/admin/journal"
          />
        </div>
      </main>
    </div>
  );
}
