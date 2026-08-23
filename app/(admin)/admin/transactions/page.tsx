import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { TransactionType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import { NAV_ADMIN } from "@/lib/navigation";
import { chargerJournal, LIBELLES_TYPE } from "@/lib/finance/journal";
import {
  TableauJournal,
  TotauxJournal,
} from "@/components/domain/TableauJournal";
import { pluriel } from "@/lib/format";

export const metadata: Metadata = { title: "Transactions" };

const PAR_PAGE = 30;

function typeValide(valeur: string | undefined): TransactionType | undefined {
  if (!valeur) return undefined;
  return valeur in LIBELLES_TYPE ? (valeur as TransactionType) : undefined;
}

export default async function TransactionsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/connexion");
  }

  const { q, type: typeBrut, page: pageBrute } = await searchParams;
  const page = Math.max(1, Number(pageBrute) || 1);

  const journal = await chargerJournal({
    type: typeValide(typeBrut),
    reference: q,
    page,
    parPage: PAR_PAGE,
  });

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <DashboardNav
        userName={user.name}
        roleName="Administrateur"
        homeHref="/admin/dashboard"
        navItems={NAV_ADMIN}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Journal financier
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Le registre complet des mouvements (§40), toutes commandes et tous
            vendeurs confondus. Mode test : aucun argent réel n&apos;a circulé.
          </p>
        </div>

        {/* Sans cet avertissement, un lecteur additionnerait les totaux ci-
            dessous et obtiendrait un chiffre qui ne veut rien dire. */}
        <div className="rounded-2xl border border-hairline bg-white p-4">
          <p className="text-xs text-ink-muted">
            <span className="font-semibold text-ink">
              Ces totaux ne s&apos;additionnent pas entre eux.
            </span>{" "}
            « Paiement du client » et « Mise sous séquestre » décrivent le même
            argent vu de deux côtés — l&apos;encaissement, puis la part réservée
            au vendeur. Seule la commission constitue une recette pour KOLI.
          </p>
        </div>

        <TotauxJournal totaux={journal.totauxParType} />

        <BarreRecherche
          placeholder="Référence de commande…"
          filtres={[
            {
              cle: "type",
              libelle: "Filtrer par nature d'écriture",
              libelleTous: "Toutes les natures",
              options: Object.entries(LIBELLES_TYPE).map(
                ([valeur, libelle]) => ({ valeur, libelle })
              ),
            },
          ]}
        />

        <div className="bg-white rounded-2xl border border-hairline shadow-sm p-6">
          <p className="text-xs text-ink-muted mb-4">
            {pluriel(journal.total, "écriture", "écritures")}
          </p>

          <TableauJournal lignes={journal.lignes} montrerVendeur />

          <Pagination
            page={page}
            total={journal.total}
            parPage={PAR_PAGE}
            parametres={{ q, type: typeBrut }}
            chemin="/admin/transactions"
          />
        </div>
      </main>
    </div>
  );
}
