import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/actions";
import { MenuEspace } from "@/components/ui/MenuEspace";
import { Pagination } from "@/components/ui/Pagination";
import { Icone } from "@/components/ui/Icone";
import { pluriel } from "@/lib/format";
import {
  chargerDossierKyc,
  chargerDossiersEnAttente,
} from "@/lib/kyc/lecture";
import { LIBELLE_STATUT_KYC } from "@/lib/kyc/types";
import { ExaminerPieceKyc } from "@/components/domain/ExaminerPieceKyc";

export const metadata: Metadata = { title: "Vérifications KYC" };

const PAR_PAGE = 20;
const JOUR_FR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

const CLASSES_STATUT: Record<string, string> = {
  PENDING: "bg-brand-soft text-brand",
  VERIFIED: "bg-emerald-50 text-emerald-800",
  REJECTED: "bg-red-50 text-danger",
};

/**
 * Examen des dossiers KYC (§37).
 *
 * Deux vues dans une seule page : la file d'attente, et le dossier d'un
 * vendeur quand on en ouvre un (`?vendeur=<id>`). Deux routes distinctes
 * auraient obligé à revenir en arrière entre chaque décision.
 */
export default async function PageVerificationsAdmin({
  searchParams,
}: {
  searchParams: Promise<{ vendeur?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/connexion");

  const { vendeur: sellerId, page: pageBrute } = await searchParams;
  const page = Math.max(1, Number(pageBrute) || 1);

  const dossier = sellerId ? await chargerDossierKyc(sellerId) : null;
  const file = dossier
    ? null
    : await chargerDossiersEnAttente({ page, parPage: PAR_PAGE });

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <MenuEspace user={user} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {dossier ? (
          <>
            <div>
              <Link
                href="/admin/verifications"
                className="inline-flex items-center gap-1.5 min-h-[44px] text-xs font-bold text-brand hover:underline"
              >
                <Icone nom="fleche-droite" className="w-3.5 h-3.5 rotate-180" />
                Retour à la file
              </Link>
              <h1 className="text-2xl font-semibold tracking-tight mt-1">
                {dossier.enseigne || dossier.nomCompte}
              </h1>
            </div>

            <section className="carte-koli bg-white rounded-2xl p-5 sm:p-6">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Identité déclarée
              </h2>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-ink-muted">Nom légal :</dt>
                  <dd className="font-semibold">
                    {dossier.nomLegal ?? "— non renseigné —"}
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-ink-muted">Nom du compte :</dt>
                  <dd>{dossier.nomCompte}</dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="text-ink-muted">Téléphone :</dt>
                  <dd>{dossier.telephone}</dd>
                </div>
              </dl>

              {/* Un écart entre les deux noms n'est pas une fraude en soi —
                  beaucoup de comptes portent l'enseigne — mais c'est ce qu'il
                  faut regarder en premier. */}
              {dossier.nomLegal &&
                dossier.nomLegal.toLowerCase() !==
                  dossier.nomCompte.toLowerCase() && (
                  <p className="text-xs text-ink-muted mt-2 flex items-start gap-1.5">
                    <Icone nom="info" className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
                    Le nom légal diffère du nom du compte : vérifiez que la
                    pièce correspond bien au nom légal.
                  </p>
                )}
            </section>

            <section className="carte-koli bg-white rounded-2xl p-5 sm:p-6">
              <h2 className="font-semibold">Pièces</h2>
              <ul className="divide-y divide-hairline mt-2">
                {dossier.pieces.map((piece) => (
                  <li key={piece.code} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-semibold">
                        {piece.libelle}
                      </span>
                      {piece.requise && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-danger">
                          Obligatoire
                        </span>
                      )}
                      {piece.document && (
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            CLASSES_STATUT[piece.document.status] ?? ""
                          }`}
                        >
                          {LIBELLE_STATUT_KYC[piece.document.status]}
                        </span>
                      )}
                    </div>

                    {piece.document ? (
                      <>
                        <p className="text-xs text-ink-muted mt-0.5 break-all">
                          {piece.document.nomOrigine} · envoyée le{" "}
                          {JOUR_FR.format(piece.document.deposeeLe)}
                        </p>
                        {piece.document.motifRefus && (
                          <p className="text-xs text-danger mt-1">
                            Refusée : {piece.document.motifRefus}
                          </p>
                        )}
                        <ExaminerPieceKyc
                          documentId={piece.document.id}
                          statut={piece.document.status}
                        />
                      </>
                    ) : (
                      <p className="text-xs text-ink-muted mt-0.5">
                        Aucune pièce déposée.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {/* La décision finale reste celle du §36, sur la page vendeurs :
                le KYC l'éclaire, il ne la remplace pas. */}
            <p className="text-xs text-ink-muted">
              Examiner les pièces ne change pas le statut du vendeur. Cette
              décision se prend depuis{" "}
              <Link
                href={`/admin/vendeurs?q=${encodeURIComponent(dossier.enseigne || dossier.nomCompte)}`}
                className="font-bold text-brand hover:underline"
              >
                la page Vendeurs
              </Link>
              .
            </p>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Vérifications
              </h1>
              <p className="text-xs text-ink-muted mt-1">
                {pluriel(
                  file?.total ?? 0,
                  "dossier en attente",
                  "dossiers en attente"
                )}{" "}
                · le plus ancien en premier
              </p>
            </div>

            <div className="carte-koli bg-white rounded-2xl p-4 sm:p-6">
              {(file?.dossiers.length ?? 0) === 0 ? (
                <div className="text-center py-12">
                  <Icone nom="bouclier" className="w-9 h-9 mx-auto text-brand" />
                  <p className="text-sm font-semibold mt-2">
                    Aucun dossier en attente
                  </p>
                  <p className="text-xs text-ink-muted mt-2 max-w-sm mx-auto">
                    Les pièces déposées par les vendeurs apparaissent ici dès
                    leur envoi.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-hairline">
                  {file?.dossiers.map((d) => (
                    <li key={d.sellerId} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap justify-between items-center gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold break-words">
                            {d.vendeur}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {d.nomLegal ?? "nom légal non renseigné"} ·{" "}
                            {d.telephone}
                          </p>
                          <p className="text-xs text-ink-muted">
                            {pluriel(
                              d.piecesEnAttente,
                              "pièce à examiner",
                              "pièces à examiner"
                            )}
                            {d.deposeLe
                              ? ` · depuis le ${JOUR_FR.format(d.deposeLe)}`
                              : ""}
                          </p>
                        </div>

                        <Link
                          href={`/admin/verifications?vendeur=${d.sellerId}`}
                          className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg bg-brand-soft text-brand hover:bg-brand-soft/70 text-xs font-bold shrink-0"
                        >
                          Examiner
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {file && (
                <Pagination
                  page={page}
                  total={file.total}
                  parPage={PAR_PAGE}
                  parametres={{}}
                  chemin="/admin/verifications"
                />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
