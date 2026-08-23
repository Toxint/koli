"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ajouterMessageLitigeAction } from "@/lib/disputes/actions";
import { Icone } from "@/components/ui/Icone";

const DATE_FR = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

const LIBELLE_ROLE: Record<string, string> = {
  ADMIN: "KOLI",
  SELLER: "Vendeur",
  CLIENT: "Client",
  DRIVER: "Livreur",
};

export interface MessageLitige {
  id: string;
  auteurId: string;
  auteurNom: string;
  auteurRole: string;
  corps: string;
  date: Date;
}

/**
 * Fil du litige (§31) — les trois parties s'y répondent.
 *
 * Chaque message porte le rôle de son auteur, pas seulement son nom : dans un
 * différend, savoir qui parle — le client, le vendeur ou KOLI — change le sens
 * de ce qui est dit.
 */
export function FilLitige({
  reference,
  messages,
  utilisateurId,
  clos,
}: {
  reference: string;
  messages: MessageLitige[];
  utilisateurId: string;
  clos: boolean;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const envoyer = async (formData: FormData) => {
    setEnCours(true);
    setErreur(null);

    const res = await ajouterMessageLitigeAction(reference, formData);
    if (res.success) {
      router.refresh();
      // Le champ se vide de lui-même : le formulaire est non contrôlé.
      (document.getElementById("message") as HTMLTextAreaElement | null)?.form?.reset();
    } else {
      setErreur(res.error);
    }
    setEnCours(false);
  };

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">Échanges</h2>

      <ol className="space-y-3">
        {messages.map((m) => {
          const deMoi = m.auteurId === utilisateurId;
          const deKoli = m.auteurRole === "ADMIN";

          return (
            <li
              key={m.id}
              className={`rounded-2xl border p-4 ${
                deKoli
                  ? "border-brand-border bg-brand-soft/60"
                  : deMoi
                    ? "border-hairline bg-white"
                    : "border-hairline bg-cream/60"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  {deKoli && <Icone nom="bouclier" className="w-3.5 h-3.5" />}
                  {m.auteurNom}
                  <span className="font-normal text-ink-muted">
                    · {LIBELLE_ROLE[m.auteurRole] ?? m.auteurRole}
                  </span>
                </span>
                <time
                  dateTime={m.date.toISOString()}
                  className="text-xs text-ink-muted whitespace-nowrap"
                >
                  {DATE_FR.format(m.date)}
                </time>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">
                {m.corps}
              </p>
            </li>
          );
        })}
      </ol>

      {clos ? (
        <p className="text-xs text-ink-muted">
          Ce litige est tranché : le fil est clos.
        </p>
      ) : (
        <form action={envoyer} className="space-y-2">
          {erreur && (
            <p
              role="alert"
              className="p-3 rounded-xl bg-red-50 text-danger text-sm font-medium"
            >
              {erreur}
            </p>
          )}

          <label htmlFor="message" className="block text-xs font-semibold">
            Ajouter un message
          </label>
          <textarea
            id="message"
            name="message"
            rows={3}
            required
            minLength={2}
            maxLength={2000}
            placeholder="Apportez une précision, une preuve, une proposition…"
            className="w-full px-4 py-3 rounded-xl border border-hairline bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand min-h-[88px] resize-y"
          />
          <button
            type="submit"
            disabled={enCours}
            className="min-h-[48px] px-5 rounded-2xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm disabled:opacity-50"
          >
            {enCours ? "Envoi…" : "Envoyer"}
          </button>
        </form>
      )}
    </section>
  );
}
