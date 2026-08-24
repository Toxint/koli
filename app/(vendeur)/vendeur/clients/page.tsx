import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { MenuEspace } from "@/components/ui/MenuEspace";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import { formatCFA, pluriel } from "@/lib/format";
import { chargerClientsVendeur } from "@/lib/sellers/clients";
import { Icone } from "@/components/ui/Icone";

const PAR_PAGE = 20;

const JOUR_FR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/**
 * Clients du vendeur (phase 7, §10).
 *
 * Un client est un ACHETEUR identifié par son téléphone, et non un compte :
 * beaucoup commandent sans jamais s'inscrire, et ce sont eux aussi des clients.
 */
export default async function VendeurClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  const { q, page: pageBrute } = await searchParams;
  const page = Math.max(1, Number(pageBrute) || 1);

  const { clients, total } = await chargerClientsVendeur({
    sellerId: user.sellerProfile.id,
    recherche: q,
    page,
    parPage: PAR_PAGE,
  });

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <MenuEspace user={user} nomAffiche={user.sellerProfile.businessName || user.name} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mes clients</h1>
          <p className="text-xs text-ink-muted mt-1">
            {pluriel(total, "acheteur")} — les plus récents en premier
          </p>
        </div>

        <BarreRecherche placeholder="Nom, téléphone ou email…" />

        <div className="bg-white rounded-2xl border border-hairline shadow-sm p-6">
          {clients.length === 0 ? (
            <div className="text-center py-12">
              <Icone
                nom="utilisateurs"
                className="w-9 h-9 mx-auto mb-2 text-brand"
              />
              <p className="text-sm font-semibold">
                {q
                  ? "Aucun client ne correspond à cette recherche"
                  : "Aucun client pour l'instant"}
              </p>
              {!q && (
                <>
                  <p className="text-xs text-ink-muted mt-2 max-w-sm mx-auto">
                    Vos acheteurs apparaîtront ici dès votre première commande,
                    qu&apos;ils aient un compte KOLI ou non.
                  </p>
                  <Link
                    href="/vendeur/commandes/nouvelle"
                    className="inline-flex items-center justify-center min-h-[44px] px-5 mt-4 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-semibold"
                  >
                    Créer une commande
                  </Link>
                </>
              )}
            </div>
          ) : (
            /* Cartes et non tableau : six colonnes sont illisibles sur un
               téléphone, et elles y débordaient. */
            <div className="space-y-4 divide-y divide-hairline">
              {clients.map((client) => (
                <div
                  key={client.telephone}
                  className="pt-4 first:pt-0 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4"
                >
                  <div className="min-w-0">
                    <h2 className="font-semibold text-base break-words">
                      {client.nom}
                    </h2>

                    <a
                      href={`tel:${client.telephone.replace(/\s/g, "")}`}
                      className="inline-flex items-center gap-1.5 min-h-[44px] text-xs font-mono text-ink-muted hover:text-brand whitespace-nowrap"
                    >
                      <Icone nom="telephone" className="w-3.5 h-3.5" />
                      {client.telephone}
                    </a>

                    {client.email && (
                      <span className="block text-xs text-ink-muted break-all">
                        {client.email}
                      </span>
                    )}
                    {client.ville && (
                      <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                        <Icone nom="position" className="w-3.5 h-3.5" />
                        {client.ville}
                      </span>
                    )}

                    <p className="text-xs text-ink-muted mt-1">
                      {pluriel(client.commandes, "commande")} ·{" "}
                      {pluriel(client.terminees, "terminée")} · dernière le{" "}
                      {JOUR_FR.format(client.derniereCommande)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0">
                    <div className="lg:text-right lg:min-w-[9rem]">
                      <span className="text-xs text-ink-muted block">
                        Total réglé
                      </span>
                      <span className="text-base font-semibold">
                        {formatCFA(client.totalRegle)}
                      </span>
                      {/* On dit ce que le chiffre recouvre : le total des
                          commandes créées gonflerait le montant de tout ce qui
                          n'a jamais été payé. */}
                      <span className="block text-[11px] text-ink-muted">
                        paiements aboutis
                      </span>
                    </div>

                    <Link
                      href={`/vendeur/commandes?q=${encodeURIComponent(client.telephone)}`}
                      aria-label={`Voir les commandes de ${client.nom}`}
                      className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg bg-brand-soft text-brand hover:brightness-95 text-xs font-bold whitespace-nowrap"
                    >
                      Ses commandes
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Pagination
            page={page}
            total={total}
            parPage={PAR_PAGE}
            parametres={{ q }}
            chemin="/vendeur/clients"
          />
        </div>
      </main>
    </div>
  );
}
