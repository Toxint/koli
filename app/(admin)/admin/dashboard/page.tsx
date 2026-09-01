import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/actions";
import { MenuEspace } from "@/components/ui/MenuEspace";
import { formatCFA, pluriel } from "@/lib/format";
import { libelleStatut, classesBadgeStatut } from "@/lib/orders/statusLabels";
import { Icone } from "@/components/ui/Icone";
import {
  chargerStatistiquesAdmin,
  chargerActivitesRecentes,
} from "@/lib/admin/stats";
import { MentionModeTest } from "@/components/ui/MentionModeTest";

/** Une tuile de chiffre clé. */
function Tuile({
  titre,
  valeur,
  detail,
  href,
}: {
  titre: string;
  valeur: string | number;
  detail?: string;
  href?: string;
}) {
  const contenu = (
    <>
      <span className="text-xs font-bold text-ink-muted uppercase tracking-wider block mb-1">
        {titre}
      </span>
      <div className="text-2xl font-bold text-brand dark:text-white break-words">
        {valeur}
      </div>
      {detail && (
        <p className="text-[11px] text-ink-muted mt-1 break-words">{detail}</p>
      )}
    </>
  );

  const classes = "block bg-white p-5 rounded-2xl";

  // Les tuiles cliquables mènent à la page qui détaille le chiffre : sans cela,
  // l'administrateur lit un nombre sans pouvoir remonter à ce qu'il recouvre.
  // Seules celles-ci reçoivent `carte-koli` et sa réponse au survol : animer
  // une tuile sur laquelle on ne peut pas cliquer promettrait une action qui
  // n'existe pas.
  return href ? (
    <Link href={href} className={`${classes} carte-koli`}>
      {contenu}
    </Link>
  ) : (
    <div className={`${classes} border border-hairline`}>{contenu}</div>
  );
}

function Section({
  titre,
  sousTitre,
  children,
}: {
  titre: string;
  sousTitre?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-hairline dark:border-slate-800 shadow-sm p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{titre}</h2>
        {sousTitre && <p className="text-xs text-ink-muted mt-0.5">{sousTitre}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function AdminDashboardPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/connexion");
  }

  const [s, activites] = await Promise.all([
    chargerStatistiquesAdmin(),
    chargerActivitesRecentes(12),
  ]);

  const dateFr = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <MenuEspace user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="bg-brand rounded-2xl p-6 sm:p-8 text-white shadow-lg shadow-brand/20 border border-brand-border">
          <span className="px-3 py-1 rounded-full bg-white/20 text-white text-xs font-mono font-bold uppercase tracking-wider mb-2 inline-block">
            Console d&apos;administration
          </span>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            Administration KOLI
          </h1>
          <p className="text-white/90 text-sm mt-1">
            Supervision des utilisateurs, des fonds, des livraisons et des
            litiges<MentionModeTest> — mode test, aucun mouvement d&apos;argent
            réel</MentionModeTest>.
          </p>
        </div>

        {/* ── Personnes ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Tuile
            titre="Utilisateurs"
            valeur={s.utilisateurs.total}
            detail={`${pluriel(s.utilisateurs.vendeurs, "vendeur")} · ${pluriel(s.utilisateurs.livreurs, "livreur")} · ${pluriel(s.utilisateurs.clients, "client")}`}
            href="/admin/utilisateurs"
          />
          <Tuile
            titre="Comptes suspendus"
            valeur={s.utilisateurs.suspendus}
            detail={
              s.utilisateurs.suspendus === 0
                ? "Aucun compte bloqué"
                : "À réexaminer"
            }
            href="/admin/utilisateurs?compte=SUSPENDED"
          />
          <Tuile
            titre="Vendeurs vérifiés"
            valeur={`${s.vendeurs.verifies} / ${s.utilisateurs.vendeurs}`}
            detail={`${s.vendeurs.enAttente} en attente · ${pluriel(s.vendeurs.rejetes, "rejeté")}`}
            href="/admin/vendeurs"
          />
          <Tuile
            titre="Commandes"
            valeur={s.commandes.total}
            detail={`${pluriel(s.commandes.terminees, "terminée")}`}
          />
        </div>

        {/* ── Argent (mode test) ────────────────────────────────── */}
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold">Flux financiers</h2>
            <MentionModeTest>
              <span className="px-3 py-1 rounded-full bg-test-mode-surface text-test-mode text-[11px] font-semibold border border-brand-border/60 whitespace-nowrap">
                <Icone nom="eclair" className="w-3.5 h-3.5" /> Mode test — aucun paiement réel
              </span>
            </MentionModeTest>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Tuile
              titre="Paiements réussis"
              valeur={s.paiements.reussis}
              detail={`${s.paiements.enAttente} en attente · ${pluriel(s.paiements.echoues, "échoué")}`}
            />
            <Tuile
              titre="Volume encaissé"
              valeur={formatCFA(s.paiements.volumeEncaisse)}
              detail="Articles + frais de livraison"
            />
            <Tuile
              titre="Fonds séquestrés"
              valeur={formatCFA(s.fonds.sequestre)}
              detail="Engagement actuel de la plateforme"
            />
            <Tuile
              titre="Fonds libérés"
              valeur={formatCFA(s.fonds.libere)}
              detail="Versés aux vendeurs après confirmation client"
            />
          </div>
        </div>

        {/* ── Litiges, remboursements, commissions ──────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Section
            titre="Litiges"
            sousTitre="§29 — signalement d'un problème par le client"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{s.litiges.ouverts}</span>
              <span className="text-xs text-ink-muted">
                {s.litiges.ouverts >= 2 ? "ouverts" : "ouvert"} sur{" "}
                {s.litiges.total}
              </span>
            </div>
            {s.litiges.total === 0 && (
              <p className="text-xs text-ink-muted mt-3">
                Le module de litiges n&apos;est pas encore ouvert aux
                utilisateurs : le bouton « Signaler un problème » arrive en
                phase 21. Le compteur reflète la base réelle.
              </p>
            )}
          </Section>

          <Section titre="Remboursements" sousTitre="§22 — retour de fonds au client">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">
                {s.remboursements.enAttente}
              </span>
              <span className="text-xs text-ink-muted">
                en attente sur {s.remboursements.total}
              </span>
            </div>
            <p className="text-sm font-semibold mt-2">
              {formatCFA(s.remboursements.volume)}
            </p>
            {s.remboursements.total === 0 && (
              <p className="text-xs text-ink-muted mt-3">
                Aucun remboursement possible tant que les litiges ne sont pas
                ouverts (phase 22).
              </p>
            )}
          </Section>

          <Section titre="Commission KOLI" sousTitre="§41 — taux configurable">
            {s.commission.tauxActif === null ? (
              <>
                <p className="text-sm text-danger font-medium">
                  Aucun taux actif : rien n&apos;est prélevé.
                </p>
                <Link
                  href="/admin/commissions"
                  className="inline-flex items-center justify-center min-h-[44px] px-4 mt-3 rounded-xl bg-brand hover:bg-brand-strong text-white text-xs font-bold"
                >
                  Configurer la commission
                </Link>
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">
                    {s.commission.tauxActif} %
                  </span>
                  <span className="text-xs text-ink-muted">taux en vigueur</span>
                </div>
                <p className="text-sm font-semibold mt-2">
                  {formatCFA(s.commission.prelevee)}
                </p>
                {/* Ce chiffre est désormais lu au journal, et non plus projeté.
                    La distinction compte : la version précédente annonçait une
                    recette que la plateforme n'avait jamais encaissée. */}
                <p className="text-xs text-ink-muted mt-3">
                  Réellement prélevé sur{" "}
                  {pluriel(
                    s.commission.nombrePrelevements,
                    "libération",
                    "libérations"
                  )}
                  , au moment du versement au vendeur.
                </p>
                <Link
                  href="/admin/commissions"
                  className="inline-flex items-center gap-1 min-h-[44px] mt-1 text-xs font-semibold text-brand hover:underline"
                >
                  Régler le taux
                  <Icone nom="fleche-droite" className="w-3.5 h-3.5" />
                </Link>
              </>
            )}
          </Section>
        </div>

        {/* ── Répartition des commandes ─────────────────────────── */}
        <Section
          titre="Répartition des commandes"
          sousTitre="Où en sont les commandes de la plateforme"
        >
          {s.commandes.parStatut.length === 0 ? (
            <p className="text-sm text-ink-muted">Aucune commande enregistrée.</p>
          ) : (
            <ul className="space-y-2">
              {s.commandes.parStatut.map((ligne) => {
                const pourcentage = Math.round(
                  (ligne.nombre / s.commandes.total) * 100
                );
                return (
                  <li key={ligne.statut} className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${classesBadgeStatut(ligne.statut)}`}
                    >
                      {libelleStatut(ligne.statut)}
                    </span>
                    {/* Barre décorative : la valeur chiffrée reste lisible à
                        côté, la couleur ne porte donc aucune information seule. */}
                    <span
                      aria-hidden="true"
                      className="flex-1 min-w-0 h-2 rounded-full bg-hairline overflow-hidden"
                    >
                      <span
                        className="block h-full bg-brand"
                        style={{ width: `${Math.max(pourcentage, 2)}%` }}
                      />
                    </span>
                    <span className="text-xs font-semibold shrink-0 tabular-nums">
                      {ligne.nombre}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* ── Activités récentes ────────────────────────────────── */}
        <Section
          titre="Activités récentes"
          sousTitre="Derniers changements de statut, toutes commandes confondues"
        >
          {activites.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Aucune activité pour l&apos;instant.
            </p>
          ) : (
            <ul className="space-y-3 divide-y divide-hairline dark:divide-slate-800">
              {activites.map((a) => (
                <li
                  key={a.id}
                  className="pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold break-all">
                        {a.reference}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${classesBadgeStatut(a.vers)}`}
                      >
                        {libelleStatut(a.vers)}
                      </span>
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5 break-words">
                      {a.vendeur}
                      {a.de ? ` · depuis « ${libelleStatut(a.de)} »` : ""}
                    </p>
                  </div>
                  <time
                    dateTime={a.date.toISOString()}
                    className="text-xs text-ink-muted whitespace-nowrap shrink-0"
                  >
                    {dateFr.format(a.date)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </main>
    </div>
  );
}
