import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PaymentStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { MenuEspace } from "@/components/ui/MenuEspace";
import {
  CarteListe,
  Cellule,
  Colonne,
  EnTeteListe,
  EnTeteTableau,
  LigneTableau,
  ListeVide,
  Pastille,
} from "@/components/ui/Liste";
import { formatMontant } from "@/lib/format";
import { commeDevise } from "@/data/markets";
import { ACTIONS_AUDIT } from "@/lib/audit/journal";
import { Icone } from "@/components/ui/Icone";

export const metadata: Metadata = { title: "Rapprochement" };

/** Au-delà, un paiement en attente n'est plus un client en train de valider. */
const ATTENTE_MINUTES = 30;
/** Les rappels écartés restent pertinents une semaine : au-delà, on les a vus. */
const JOURS_REJETS = 7;
/** Borné (§46) : c'est une liste de travail, pas un historique. */
const PLAFOND = 100;

const DATE_FR = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** « 3 h », « 2 j » — l'ancienneté se lit d'un coup d'œil, pas en calculant. */
function depuis(date: Date, maintenant: Date): string {
  const minutes = Math.floor((maintenant.getTime() - date.getTime()) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 48) return `${heures} h`;
  return `${Math.floor(heures / 24)} j`;
}

/** Les détails du journal sont du JSON en texte ; une ligne illisible ne casse pas l'écran. */
function lireDetails(brut: string | null): Record<string, unknown> {
  if (!brut) return {};
  try {
    const v = JSON.parse(brut);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Le RAPPROCHEMENT quotidien avec iKeePay — un travail humain, pour l'instant.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  iKeePay ne signe pas ses rappels et n'offre aucune route pour relire   │
 * │  l'état d'une transaction (réponse du 13 septembre 2026 : « le webhook  │
 * │  et vos historiques du Dashboard comme source de vérification »).       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Un rappel PERDU laisse donc un client débité et une commande figée en
 * attente — et rien, dans le code, ne peut le rattraper. La seule défense est
 * de COMPARER, chaque jour, ce que KOLI croit en attente à ce qu'iKeePay a
 * encaissé. Cet écran rassemble les deux listes qu'il faut vérifier, et rien
 * d'autre.
 *
 * ── Ce qu'il montre ─────────────────────────────────────────────────────────
 *
 * **1. Les paiements en attente depuis plus de trente minutes.** Un client qui
 * valide sur son téléphone met une à deux minutes. Au-delà, c'est soit un
 * paiement abandonné — sans conséquence —, soit un rappel perdu — un client
 * débité. Seul le tableau de bord iKeePay les distingue.
 *
 * **2. Les rappels ÉCARTÉS de la semaine.** iKeePay a dit « payé », et KOLI a
 * refusé de le croire : référence inconnue, montant hors tolérance. Chacun est
 * soit une tentative de fraude, soit un vrai paiement que KOLI a laissé filer —
 * c'est exactement ainsi que les deux paiements du 6 septembre ont été perdus.
 *
 * ⚠ **Il ne CONCLUT rien, et il n'a aucun bouton.** Marquer un paiement comme
 * abouti à la main ferait expédier un colis sur la seule parole d'un écran ;
 * c'est un pouvoir qui ne se donne pas sans une décision explicite. Le jour où
 * la route de vérification d'iKeePay existera, c'est `consulter()` qui
 * tranchera, et cet écran pourra se vider de lui-même.
 *
 * ⚠ En mode iKeePay, ces paiements n'EXPIRENT pas : le fournisseur ne donne
 * aucune échéance (`initiate()` ne rend pas d'`expiresAt`), et le rattrapage
 * les laisse donc en attente. C'est voulu — expirer un paiement dont le rappel
 * s'est perdu effacerait la seule trace d'un client débité.
 */
export default async function AdminRapprochementPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/connexion");
  }

  const maintenant = new Date();
  const seuil = new Date(maintenant.getTime() - ATTENTE_MINUTES * 60_000);
  const debutRejets = new Date(maintenant.getTime() - JOURS_REJETS * 86_400_000);

  const filtreAttente = {
    status: { in: [PaymentStatus.PENDING, PaymentStatus.AWAITING_CUSTOMER] },
    createdAt: { lt: seuil },
  };

  const [enAttente, totalAttente, rejets] = await Promise.all([
    prisma.payment.findMany({
      where: filtreAttente,
      include: {
        order: {
          select: {
            reference: true,
            currency: true,
            buyerName: true,
            buyerPhone: true,
            seller: { select: { businessName: true } },
          },
        },
      },
      // Le plus ancien d'abord : c'est le client qui attend depuis le plus
      // longtemps une commande qu'il a peut-être payée.
      orderBy: { createdAt: "asc" },
      take: PLAFOND,
    }),
    prisma.payment.count({ where: filtreAttente }),
    prisma.auditLog.findMany({
      where: {
        action: ACTIONS_AUDIT.PAYMENT_CALLBACK_DISCARDED,
        createdAt: { gte: debutRejets },
      },
      orderBy: { createdAt: "desc" },
      take: PLAFOND,
    }),
  ]);

  return (
    <div className="min-h-screen bg-cream text-ink">
      <MenuEspace user={user} />

      <main className="mx-auto max-w-[86rem] space-y-6 px-4 py-6 sm:px-6">
        <EnTeteListe titre="Rapprochement" />

        <div className="rounded-2xl border border-brand-border bg-brand-soft/50 p-4">
          <p className="flex items-start gap-2 text-sm text-ink">
            <Icone nom="info" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>
              <strong>Chaque jour</strong>, cherchez chaque référence ci-dessous
              dans le <strong>tableau de bord iKeePay</strong>. S&apos;il la
              marque <strong>COMPLETED</strong>, le client a été débité et son
              rappel n&apos;est jamais arrivé : la commande est bloquée chez
              KOLI. Rien ici ne le corrige automatiquement.
            </span>
          </p>
        </div>

        <section className="space-y-3" data-section="attente">
          <h2 className="font-titre text-lg font-bold text-heading">
            En attente depuis plus de {ATTENTE_MINUTES} minutes
            <span className="ml-1 font-normal text-ink-muted">({totalAttente})</span>
          </h2>
          {totalAttente > PLAFOND && (
            <p className="text-xs text-ink-muted">
              Les {PLAFOND} plus anciens sont affichés.
            </p>
          )}

          <CarteListe>
            {enAttente.length === 0 ? (
              <ListeVide
                titre="Rien à rapprocher"
                explication="Aucun paiement n'attend son rappel depuis plus d'une demi-heure."
              />
            ) : (
              <table className="w-full min-w-[56rem] border-collapse">
                <caption className="sr-only">
                  Paiements en attente de rappel, les plus anciens d&apos;abord
                </caption>
                <EnTeteTableau>
                  <Colonne>Référence à chercher</Colonne>
                  <Colonne aDroite>Montant</Colonne>
                  <Colonne>Client</Colonne>
                  <Colonne>Vendeur</Colonne>
                  <Colonne>Créé le</Colonne>
                  <Colonne aDroite>Attente</Colonne>
                </EnTeteTableau>
                <tbody>
                  {enAttente.map((p) => (
                    <LigneTableau key={p.id}>
                      <Cellule>
                        {/* La référence de COMMANDE : c'est elle qu'iKeePay
                            reçoit en `order_id`, donc celle qu'on retrouve
                            dans leur tableau de bord. */}
                        <span
                          data-reference={p.order.reference}
                          className="font-mono text-sm font-bold text-brand"
                        >
                          {p.order.reference}
                        </span>
                      </Cellule>
                      <Cellule aDroite>
                        <span className="font-semibold text-ink">
                          {formatMontant(p.amount, commeDevise(p.order.currency))}
                        </span>
                      </Cellule>
                      <Cellule>
                        <span className="block font-semibold text-ink">{p.order.buyerName}</span>
                        <span className="block font-mono text-xs text-ink-muted">
                          {p.order.buyerPhone}
                        </span>
                      </Cellule>
                      <Cellule>
                        <span className="text-ink">{p.order.seller.businessName}</span>
                      </Cellule>
                      <Cellule>
                        <span className="text-ink-muted">{DATE_FR.format(p.createdAt)}</span>
                      </Cellule>
                      <Cellule aDroite>
                        <Pastille classes="bg-gold-soft text-gold-deep">
                          {depuis(p.createdAt, maintenant)}
                        </Pastille>
                      </Cellule>
                    </LigneTableau>
                  ))}
                </tbody>
              </table>
            )}
          </CarteListe>
        </section>

        <section className="space-y-3" data-section="rejets">
          <h2 className="font-titre text-lg font-bold text-heading">
            Rappels écartés — {JOURS_REJETS} derniers jours
            <span className="ml-1 font-normal text-ink-muted">({rejets.length})</span>
          </h2>
          <p className="text-xs text-ink-muted">
            iKeePay a annoncé un paiement que KOLI a refusé de croire. Chacun est
            soit une tentative de fraude, soit un vrai paiement laissé de côté :
            vérifiez-les tous.
          </p>

          <CarteListe>
            {rejets.length === 0 ? (
              <ListeVide
                titre="Aucun rappel écarté"
                explication="Tous les rappels reçus cette semaine correspondaient à un paiement attendu."
              />
            ) : (
              <table className="w-full min-w-[56rem] border-collapse">
                <caption className="sr-only">Rappels de paiement écartés</caption>
                <EnTeteTableau>
                  <Colonne>Référence reçue</Colonne>
                  <Colonne>Motif du refus</Colonne>
                  <Colonne aDroite>Montant annoncé</Colonne>
                  <Colonne>Reçu le</Colonne>
                </EnTeteTableau>
                <tbody>
                  {rejets.map((r) => {
                    const d = lireDetails(r.metadata);
                    const montant = typeof d.montantRecu === "number" ? d.montantRecu : null;
                    const devise = typeof d.deviseRecue === "string" ? d.deviseRecue : "";
                    return (
                      <LigneTableau key={r.id}>
                        <Cellule>
                          <span
                            data-reference={r.entityId ?? ""}
                            className="font-mono text-sm font-bold text-brand"
                          >
                            {r.entityId ?? "—"}
                          </span>
                        </Cellule>
                        <Cellule className="whitespace-normal">
                          <span className="block max-w-[26rem] text-ink">
                            {typeof d.motif === "string" ? d.motif : "motif non consigné"}
                          </span>
                        </Cellule>
                        <Cellule aDroite>
                          {/* La devise est celle que le RAPPEL annonce, pas celle
                              de la commande : c'est souvent précisément là que
                              l'écart est né (796 CDF pour une commande en XOF). */}
                          <span className="text-ink">
                            {montant === null ? "—" : `${montant.toLocaleString("fr-FR")} ${devise}`.trim()}
                          </span>
                        </Cellule>
                        <Cellule>
                          <span className="text-ink-muted">{DATE_FR.format(r.createdAt)}</span>
                        </Cellule>
                      </LigneTableau>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CarteListe>
        </section>
      </main>
    </div>
  );
}
