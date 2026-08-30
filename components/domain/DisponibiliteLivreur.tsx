"use client";

import { useState, useTransition } from "react";
import { Icone } from "@/components/ui/Icone";
import { definirDisponibiliteAction } from "@/lib/drivers/equipe";

/**
 * Le livreur dit s'il prend des courses, et où il tourne (§5.3, §26).
 *
 * **C'est lui qui le déclare, et personne d'autre.** Une disponibilité qu'un
 * vendeur pourrait remettre à « oui » ne voudrait plus rien dire : le livreur
 * se retrouverait avec des colis qu'il n'a pas acceptés, et le client
 * attendrait une course que personne ne fait.
 *
 * Les deux champs partent ENSEMBLE, en un seul enregistrement. Séparés, on
 * aurait le cas d'un livreur disponible dans une zone qu'il vient de changer
 * mais pas encore enregistrée — et le vendeur choisirait sur l'ancienne.
 */
export function DisponibiliteLivreur({
  disponibleInitial,
  zoneInitiale,
  vendeurs,
}: {
  disponibleInitial: boolean;
  zoneInitiale: string;
  /** Les boutiques pour lesquelles il travaille, et depuis quand. */
  vendeurs: { boutique: string; depuis: string }[];
}) {
  const [disponible, setDisponible] = useState(disponibleInitial);
  const [zone, setZone] = useState(zoneInitiale);
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  /**
   * Enregistre, et REVIENT EN ARRIÈRE si le serveur refuse.
   *
   * Le bouton bascule immédiatement — c'est ce qu'on attend d'un interrupteur,
   * et attendre l'aller-retour donnerait l'impression qu'il ne répond pas. Mais
   * sans ce retour en arrière, un échec laissait le bouton sur « Je prends des
   * courses » alors que le registre disait le contraire : le livreur se croyait
   * disponible et n'aurait reçu aucune course, sans jamais comprendre pourquoi.
   *
   * L'écran ne doit jamais affirmer un état que la base ne porte pas.
   */
  function enregistrer(prochaineDisponibilite: boolean, prochaineZone: string) {
    setMessage(null);
    demarrer(async () => {
      const donnees = new FormData();
      donnees.set("disponible", prochaineDisponibilite ? "1" : "0");
      donnees.set("zone", prochaineZone);
      const res = await definirDisponibiliteAction(donnees);

      if (!res.success) {
        setDisponible(!prochaineDisponibilite);
        setMessage(res.error);
        return;
      }

      setDisponible(res.disponible);
      setMessage(
        res.disponible
          ? "Vous êtes disponible. Vos vendeurs peuvent vous confier des courses."
          : "Vous êtes indisponible. Personne ne peut plus vous assigner de course."
      );
    });
  }

  const JOUR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-hairline bg-white p-6">
        <h2 className="text-sm font-bold">Ma disponibilité</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Vos vendeurs le voient avant de vous confier une livraison.
        </p>

        {/*
          * Un bouton, pas une case à cocher.
          *
          * `aria-pressed` porte l'état — et le LIBELLÉ change aussi : un bouton
          * dont seule la couleur bascule laisse dans le doute sur ce qu'il fera
          * au prochain appui. On lit ce que l'on est, pas ce qui va arriver.
          */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            aria-pressed={disponible}
            disabled={enCours}
            onClick={() => {
              const prochain = !disponible;
              setDisponible(prochain);
              enregistrer(prochain, zone);
            }}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 text-xs font-bold disabled:opacity-50 ${
              disponible
                ? "bg-brand text-white hover:bg-brand-strong"
                : "border border-hairline bg-white text-ink-muted hover:border-brand hover:text-brand"
            }`}
          >
            <Icone
              nom={disponible ? "valide" : "horloge"}
              className="h-3.5 w-3.5"
            />
            {disponible ? "Je prends des courses" : "Je ne prends pas de course"}
          </button>
          <span className="text-xs text-ink-muted">
            Appuyez pour changer.
          </span>
        </div>

        <div className="mt-6">
          <label
            htmlFor="zone-livreur"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand"
          >
            Où livrez-vous ?
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="zone-livreur"
              type="text"
              maxLength={80}
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="Ex: Yopougon, Adjamé et Plateau"
              aria-describedby="aide-zone-livreur"
              className="min-w-0 flex-1 rounded-xl border border-hairline bg-white px-4 py-3 text-sm"
            />
            <button
              type="button"
              disabled={enCours}
              onClick={() => enregistrer(disponible, zone)}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-hairline px-5 text-xs font-bold text-brand hover:border-brand disabled:opacity-50"
            >
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
          <p id="aide-zone-livreur" className="mt-1 text-xs text-ink-muted">
            Écrivez-le comme vous le diriez. Vos vendeurs le lisent pour savoir
            quelles courses vous confier.
          </p>
        </div>

        {message && (
          <p role="status" className="mt-4 text-xs font-semibold text-brand">
            {message}
          </p>
        )}
      </section>

      {/*
        * Pour qui il travaille.
        *
        * Un rattachement qu'on subit sans le voir n'est pas un rattachement,
        * c'est une inscription à son insu. Le livreur doit pouvoir constater
        * qui peut lui envoyer des courses.
        */}
      <section className="rounded-2xl border border-hairline bg-white p-6">
        <h2 className="text-sm font-bold">Je livre pour</h2>
        {vendeurs.length === 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            Aucun vendeur pour l&apos;instant. Un vendeur vous ajoute en vous
            envoyant son lien d&apos;invitation — ouvrez-le, et vous
            apparaîtrez ici.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-hairline">
            {vendeurs.map((v) => (
              <li
                key={v.boutique + v.depuis}
                className="flex items-center gap-3 py-3"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand"
                >
                  <Icone nom="boutique" className="h-3.5 w-3.5 text-white" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{v.boutique}</p>
                  <p className="text-[11px] text-ink-muted">
                    depuis le {JOUR.format(new Date(v.depuis))}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
