"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { examinerPieceKycAction } from "@/lib/kyc/actions";
import { Icone } from "@/components/ui/Icone";

/**
 * Décision d'examen d'une pièce (§37).
 *
 * Accepter est immédiat ; **refuser demande un motif**. Un refus sans
 * explication laisse le vendeur devant un mur : il ne sait pas quoi corriger,
 * et redéposera exactement la même pièce. Le formulaire de refus s'ouvre donc
 * plutôt que de partir au premier clic.
 */
export function ExaminerPieceKyc({
  documentId,
  statut,
}: {
  documentId: string;
  statut: string;
}) {
  const [enCours, demarrer] = useTransition();
  const [refusOuvert, setRefusOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();

  const decider = (decision: "VERIFIED" | "REJECTED", motif = "") => {
    const donnees = new FormData();
    donnees.set("decision", decision);
    donnees.set("motif", motif);

    demarrer(async () => {
      setErreur(null);
      const res = await examinerPieceKycAction(documentId, donnees);
      if (!res.success) {
        setErreur(res.error);
        return;
      }
      setRefusOuvert(false);
      router.refresh();
    });
  };

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2">
        {/* Le lien de consultation passe par la route protégée : le fichier
            n'est jamais servi directement depuis le disque. */}
        <a
          href={`/api/kyc/${documentId}`}
          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-lg border border-hairline hover:bg-brand-soft/40 text-xs font-bold"
        >
          <Icone nom="telechargement" className="w-3.5 h-3.5" />
          Ouvrir la pièce
        </a>

        {statut !== "VERIFIED" && (
          <button
            type="button"
            disabled={enCours}
            onClick={() => decider("VERIFIED")}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-lg bg-brand-soft text-brand hover:bg-brand-soft/70 text-xs font-bold transition-all disabled:opacity-60"
          >
            <Icone nom="valide" className="w-3.5 h-3.5" />
            Accepter
          </button>
        )}

        {statut !== "REJECTED" && (
          <button
            type="button"
            disabled={enCours}
            onClick={() => setRefusOuvert((o) => !o)}
            aria-expanded={refusOuvert}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-lg border border-red-200 text-danger hover:bg-red-50 text-xs font-bold transition-all disabled:opacity-60"
          >
            <Icone nom="fermer" className="w-3.5 h-3.5" />
            Refuser
          </button>
        )}
      </div>

      {refusOuvert && (
        <form
          action={(donnees) =>
            decider("REJECTED", String(donnees.get("motif") ?? ""))
          }
          className="mt-2 space-y-2"
        >
          <label htmlFor={`motif-${documentId}`} className="block text-xs font-semibold">
            Qu&apos;est-ce qui ne va pas ? Le vendeur lira ce message.
          </label>
          <textarea
            id={`motif-${documentId}`}
            name="motif"
            required
            minLength={5}
            rows={2}
            placeholder="Ex. : la photo est floue, le numéro n'est pas lisible."
            className="w-full px-3 py-2 rounded-xl border border-hairline bg-white text-base"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={enCours}
              className="min-h-[44px] px-4 rounded-lg bg-danger text-white text-xs font-bold disabled:opacity-60"
            >
              {enCours ? "…" : "Confirmer le refus"}
            </button>
            <button
              type="button"
              onClick={() => setRefusOuvert(false)}
              className="min-h-[44px] px-4 rounded-lg border border-hairline text-xs font-bold"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {erreur && (
        <p role="alert" className="text-xs text-danger font-medium mt-1">
          {erreur}
        </p>
      )}
    </div>
  );
}
