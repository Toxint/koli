import Link from "next/link";
import { notFound } from "next/navigation";
import { chargerContexteLitige } from "@/lib/disputes/actions";
import {
  libelleMotif,
  libelleStatutLitige,
  classesStatutLitige,
  litigeEstClos,
} from "@/lib/disputes/libelles";
import { libelleStatut } from "@/lib/orders/statusLabels";
import { formatCFA } from "@/lib/format";
import { BarreCompte } from "@/components/ui/BarreCompte";
import { FilLitige } from "@/components/domain/FilLitige";
import { ArbitrageLitige } from "@/components/domain/ArbitrageLitige";
import { Icone } from "@/components/ui/Icone";

const DATE_FR = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
});

/**
 * Page d'un litige (§31-33).
 *
 * Contrairement au lien de paiement, elle ne s'ouvre PAS sur simple possession
 * de la reference : le litige contient le detail du differend et les
 * coordonnees de l'acheteur. Seules les trois parties y accedent — client,
 * vendeur mis en cause, administration (`roleDansLitige`).
 */
export const dynamic = "force-dynamic";

export default async function PageLitige({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const contexte = await chargerContexteLitige(reference);

  // Ni commande, ni droit d'y acceder : meme reponse. Distinguer les deux
  // permettrait de deviner quelles references existent.
  if (!contexte?.commande.dispute) notFound();

  const { commande, role, auteurs, utilisateur } = contexte;
  const litige = commande.dispute!;
  const clos = litigeEstClos(litige.status);

  const nomsParId = new Map(auteurs.map((a) => [a.id, a]));
  const messages = litige.messages.map((m) => ({
    id: m.id,
    auteurId: m.authorUserId,
    auteurNom: nomsParId.get(m.authorUserId)?.name ?? "Utilisateur",
    auteurRole: nomsParId.get(m.authorUserId)?.role ?? "CLIENT",
    corps: m.body ?? "",
    date: m.createdAt,
  }));

  const montantVendeur = commande.fund?.amount ?? 0;

  return (
    <main className="min-h-screen bg-cream py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-4">
        <BarreCompte
          retourHref={role === "admin" ? "/admin/litiges" : `/pay/${commande.reference}`}
          retourLibelle={
            role === "admin" ? "Retour aux litiges" : "Retour au suivi de la commande"
          }
          connecte
          nomCompte={utilisateur?.name}
        />

        <section className="carte-koli bg-white rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">Litige</h1>
              <Link
                href={`/pay/${commande.reference}`}
                className="inline-flex items-center min-h-[44px] text-xs font-mono text-ink-muted hover:text-brand break-all"
              >
                {commande.reference}
              </Link>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${classesStatutLitige(litige.status)}`}
            >
              {libelleStatutLitige(litige.status)}
            </span>
          </div>

          <dl className="divide-y divide-hairline">
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-xs text-ink-muted shrink-0">Motif</dt>
              <dd className="text-sm font-medium text-right">
                {libelleMotif(litige.reason)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-xs text-ink-muted shrink-0">Ouvert le</dt>
              <dd className="text-sm font-medium text-right">
                {DATE_FR.format(litige.createdAt)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-xs text-ink-muted shrink-0">Commande</dt>
              <dd className="text-sm font-medium text-right">
                {libelleStatut(commande.status)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-xs text-ink-muted shrink-0">Vendeur</dt>
              <dd className="text-sm font-medium text-right break-words min-w-0">
                {commande.seller.businessName || commande.seller.user.name}
              </dd>
            </div>
          </dl>

          {!clos && (
            <p className="flex items-start gap-2 text-xs text-ink-muted rounded-xl bg-test-mode-surface border border-brand-border/60 p-3">
              <Icone nom="cadenas" className="w-4 h-4 shrink-0 text-test-mode" />
              <span>
                Les fonds — {formatCFA(montantVendeur)} — restent bloques
                jusqu&apos;a la decision de KOLI. Le vendeur n&apos;est pas paye
                entre-temps (§33).
              </span>
            </p>
          )}
        </section>

        {role === "admin" && !clos && (
          <ArbitrageLitige
            reference={commande.reference}
            montantVendeur={montantVendeur}
            montantClient={montantVendeur + commande.deliveryFee}
          />
        )}

        <div className="carte-koli bg-white rounded-2xl p-5 sm:p-6">
          <FilLitige
            reference={commande.reference}
            messages={messages}
            utilisateurId={utilisateur?.id ?? ""}
            clos={clos}
          />
        </div>
      </div>
    </main>
  );
}
