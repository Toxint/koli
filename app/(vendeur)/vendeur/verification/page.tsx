import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { MenuEspace } from "@/components/ui/MenuEspace";
import { chargerDossierKyc } from "@/lib/kyc/lecture";
import { LIBELLE_STATUT_KYC } from "@/lib/kyc/types";
import { DepotPieceKyc } from "@/components/domain/DepotPieceKyc";
import { FormulaireIdentiteKyc } from "@/components/domain/FormulaireIdentiteKyc";
import { Icone } from "@/components/ui/Icone";

export const metadata: Metadata = { title: "Vérification" };

const JOUR_FR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

function poids(octets: number | null): string {
  if (!octets) return "";
  // En dessous d'un kilo-octet, on affiche les octets : arrondir donnait
  // « 0 Ko », qui se lit comme un fichier vide alors qu'il ne l'est pas.
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}

const CLASSES_STATUT: Record<string, string> = {
  PENDING: "bg-brand-soft text-brand",
  VERIFIED: "bg-emerald-50 text-emerald-800",
  REJECTED: "bg-red-50 text-danger",
};

/**
 * Dossier de vérification du vendeur (§37).
 *
 * **Rien ici ne bloque la vente.** Le §37 est explicite : « la fonctionnalité
 * KYC doit être préparée mais ne doit pas bloquer tout le MVP ». Le vendeur
 * constitue son dossier quand il peut ; il continue de vendre entre-temps.
 * La page le dit, plutôt que de laisser croire à un passage obligé.
 */
export default async function PageVerificationVendeur() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  const dossier = await chargerDossierKyc(user.sellerProfile.id);
  if (!dossier) redirect("/vendeur/dashboard");

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <MenuEspace user={user} nomAffiche={user.sellerProfile.businessName} />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ma vérification
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Un compte vérifié rassure vos clients. Vous pouvez vendre dès
            maintenant : la vérification se fait en parallèle.
          </p>
        </div>

        {dossier.aDesRefus && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-4"
          >
            <p className="text-sm font-semibold text-danger flex items-center gap-2">
              <Icone nom="alerte" className="w-4 h-4" />
              Une pièce a été refusée
            </p>
            <p className="text-xs text-ink-muted mt-1">
              Le motif est indiqué sous la pièce concernée. Corrigez et
              renvoyez-la.
            </p>
          </div>
        )}

        {dossier.toutesAcceptees && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
              <Icone nom="valide" className="w-4 h-4" />
              Vos pièces obligatoires sont acceptées
            </p>
          </div>
        )}

        {/* §37 : « identité, téléphone ». */}
        <section className="carte-koli bg-white rounded-2xl p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="font-semibold">Votre identité</h2>
            <p className="text-xs text-ink-muted mt-1">
              Le nom doit être exactement celui de votre pièce — pas le nom de
              votre boutique.
            </p>
          </div>

          <FormulaireIdentiteKyc valeurActuelle={dossier.nomLegal} />

          <div className="pt-3 border-t border-hairline">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Téléphone du compte
            </span>
            <p className="text-sm mt-0.5">{dossier.telephone}</p>
            <p className="text-xs text-ink-muted mt-0.5">
              Pour le modifier, passez par votre profil : c&apos;est aussi
              votre identifiant de connexion.
            </p>
          </div>
        </section>

        {/* §37 : « documents, statut ». */}
        <section className="carte-koli bg-white rounded-2xl p-5 sm:p-6">
          <h2 className="font-semibold">Vos pièces</h2>
          <p className="text-xs text-ink-muted mt-1 mb-4">
            Photo ou PDF, 5 Mo maximum. Assurez-vous que tout est lisible.
          </p>

          <ul className="divide-y divide-hairline">
            {dossier.pieces.map((piece) => (
              <li key={piece.code} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold">{piece.libelle}</span>
                  {piece.requise ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-danger">
                      Obligatoire
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                      Facultatif
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

                <p className="text-xs text-ink-muted mt-0.5">{piece.aide}</p>

                {piece.document && (
                  <p className="text-xs text-ink-muted mt-1 break-all">
                    {piece.document.nomOrigine}
                    {piece.document.taille
                      ? ` · ${poids(piece.document.taille)}`
                      : ""}{" "}
                    · envoyée le {JOUR_FR.format(piece.document.deposeeLe)}
                  </p>
                )}

                {/* Le motif du refus, à l'endroit où il sert : sous la pièce
                    à corriger, et non dans un message général. */}
                {piece.document?.motifRefus && (
                  <p
                    role="alert"
                    className="text-xs text-danger mt-1 rounded-xl bg-red-50 border border-red-200 px-3 py-2"
                  >
                    Motif du refus : {piece.document.motifRefus}
                  </p>
                )}

                <DepotPieceKyc
                  type={piece.code}
                  dejaDeposee={piece.document !== null}
                />
              </li>
            ))}
          </ul>
        </section>

        <p className="text-xs text-ink-muted">
          Vos pièces ne sont consultables que par vous et par
          l&apos;administration de KOLI. Elles ne sont jamais visibles par vos
          clients.
        </p>
      </main>
    </div>
  );
}
