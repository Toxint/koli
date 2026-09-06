import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { TransactionType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { MenuEspace } from "@/components/ui/MenuEspace";
import { BarreRecherche } from "@/components/ui/BarreRecherche";
import { Pagination } from "@/components/ui/Pagination";
import { chargerJournal, LIBELLES_TYPE } from "@/lib/finance/journal";
import { chargerSoldeVendeur } from "@/lib/finance/solde";
import {
  TableauJournal,
  TotauxJournal,
} from "@/components/domain/TableauJournal";
import { formatMontant, pluriel } from "@/lib/format";
import { deviseDuVendeur } from "@/data/markets";
import { Icone } from "@/components/ui/Icone";
import { MentionModeTest } from "@/components/ui/MentionModeTest";

export const metadata: Metadata = { title: "Transactions" };

const PAR_PAGE = 25;

/** Liste blanche : le type vient de l'URL, donc du visiteur. */
function typeValide(valeur: string | undefined): TransactionType | undefined {
  if (!valeur) return undefined;
  return valeur in LIBELLES_TYPE ? (valeur as TransactionType) : undefined;
}

export default async function TransactionsVendeurPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  /*
   * La devise du vendeur, une fois pour tout l'écran.
   *
   * Un vendeur a un pays, donc une monnaie ; et depuis que la commande suit
   * le vendeur et non l'acheteur, TOUTES ses écritures sont dans cette
   * monnaie. Rien ne se mélange ici — contrairement aux écrans de
   * l'administration, qui agrègent plusieurs vendeurs.
   */
  const devise = deviseDuVendeur(user.sellerProfile.country);

  const { q, type: typeBrut, page: pageBrute } = await searchParams;
  const page = Math.max(1, Number(pageBrute) || 1);
  const type = typeValide(typeBrut);

  const sellerId = user.sellerProfile.id;

  const [journal, solde] = await Promise.all([
    // `sellerId` est imposé ici et non lu depuis l'URL : c'est ce qui empêche
    // un vendeur de consulter le journal d'un concurrent en changeant un
    // paramètre.
    chargerJournal({ sellerId, type, reference: q, page, parPage: PAR_PAGE }),
    chargerSoldeVendeur(sellerId),
  ]);

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <MenuEspace
        user={user}
        nomAffiche={user.sellerProfile.businessName || user.name}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Mes transactions
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Chaque mouvement d&apos;argent de vos commandes, dans l&apos;ordre.
            <MentionModeTest>
              Tous les montants sont simulés — KOLI fonctionne en mode test.
            </MentionModeTest>
          </p>
        </div>

        {/* La commission (§41) mérite d'être expliquée là où on la subit :
            voir « −1 025 FCFA » sans savoir pourquoi est déstabilisant. */}
        {solde.commissionRetenue > 0 && (
          <div className="rounded-2xl border border-brand-border bg-brand-soft/40 p-4 flex gap-3">
            <Icone
              nom="pourcentage"
              className="w-5 h-5 shrink-0 text-brand mt-0.5"
            />
            <p className="text-xs text-ink">
              <span className="font-semibold">
                {formatMontant(solde.commissionRetenue, devise)} de commission
                KOLI
              </span>{" "}
              ont été retenus sur {formatMontant(solde.brutLibere, devise)} de
              fonds libérés. La commission n&apos;est prélevée qu&apos;au moment
              où l&apos;argent vous est versé : une commande remboursée ne vous
              coûte rien.
            </p>
          </div>
        )}

        <TotauxJournal totaux={journal.totauxParType} />

        <BarreRecherche
          placeholder="Référence de commande…"
          filtres={[
            {
              cle: "type",
              libelle: "Filtrer par nature d'écriture",
              libelleTous: "Toutes les natures",
              options: Object.entries(LIBELLES_TYPE).map(
                ([valeur, libelle]) => ({ valeur, libelle }),
              ),
            },
          ]}
        />

        <div className="bg-white rounded-2xl border border-hairline shadow-sm p-6">
          <p className="text-xs text-ink-muted mb-4">
            {pluriel(journal.total, "écriture", "écritures")}
          </p>

          <TableauJournal
            lignes={journal.lignes}
            lienCommande={(reference) => `/pay/${reference}`}
          />

          <Pagination
            page={page}
            total={journal.total}
            parPage={PAR_PAGE}
            parametres={{ q, type: typeBrut }}
            chemin="/vendeur/transactions"
          />
        </div>
      </main>
    </div>
  );
}
