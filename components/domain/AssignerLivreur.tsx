"use client";

import { useState } from "react";
import { assignDriverAction, type DriverOption } from "@/lib/deliveries/assign";
import Link from "next/link";
import { Icone } from "@/components/ui/Icone";

interface AssignerLivreurProps {
  orderReference: string;
  drivers: DriverOption[];
  /** Nom du livreur déjà assigné, s'il y en a un. */
  livreurActuel?: string | null;
}

/**
 * Assignation d'un livreur par le vendeur (§26, §57 « Assigner un livreur »).
 *
 * Sans cette étape, une commande créée n'apparaissait dans le tableau de bord
 * d'aucun livreur : le parcours s'arrêtait au paiement.
 */
export function AssignerLivreur({
  orderReference,
  drivers,
  livreurActuel = null,
}: AssignerLivreurProps) {
  const [choix, setChoix] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [assigneA, setAssigneA] = useState<string | null>(livreurActuel);
  const [erreur, setErreur] = useState<string | null>(null);

  const idSelect = `livreur-${orderReference}`;

  if (assigneA) {
    return (
      <div className="flex items-center gap-2 text-xs font-semibold text-brand">
        <Icone nom="livreur" className="w-4 h-4" />
        <span>Livreur : {assigneA}</span>
      </div>
    );
  }

  /*
   * Equipe vide — on dit QUOI FAIRE, pas seulement qu il n y a personne.
   *
   * « Aucun livreur disponible » laissait croire a une panne passagere, alors
   * que depuis le §5.3 la cause est toujours la meme et l action toujours la
   * meme : le vendeur n a encore invite personne. Un message qui ne mene nulle
   * part fait chercher le probleme au mauvais endroit.
   */
  if (drivers.length === 0) {
    return (
      <p className="text-xs text-ink-muted">
        Aucun livreur dans votre équipe.{" "}
        <Link
          href="/vendeur/livreurs"
          className="font-semibold text-brand underline underline-offset-2"
        >
          Invitez votre livreur
        </Link>{" "}
        pour pouvoir lui confier cette course.
      </p>
    );
  }

  const assigner = async () => {
    if (!choix) {
      setErreur("Choisissez un livreur.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const res = await assignDriverAction(orderReference, choix);
      if (res.success) {
        setAssigneA(res.driverName);
      } else {
        setErreur(res.error);
      }
    } catch {
      setErreur("Erreur réseau. Veuillez réessayer.");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="w-full space-y-2">
      <label
        htmlFor={idSelect}
        className="block text-xs font-semibold text-ink-muted"
      >
        Assigner un livreur
      </label>

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          id={idSelect}
          value={choix}
          onChange={(e) => setChoix(e.target.value)}
          /* `min-w-0` : sans lui, un <select> reclame la largeur de sa plus
             longue option (ici « Kouassi Express — Moto YBR 125 -
             Immatriculation AB-123-CI », soit 448px) et pousse toute la page
             en debordement horizontal sur un ecran de 320px. */
          className="flex-1 w-full min-w-0 min-h-[44px] px-3 rounded-xl border border-hairline bg-white text-sm"
        >
          <option value="">Choisir…</option>
          {/*
             La ZONE plutot que le vehicule, et la disponibilite en toutes
             lettres.

             Le vehicule ne decide de rien : le vendeur sait deja que son
             livreur est a moto. Ce qu il cherche, c est OU celui-ci tourne
             (§5.3) — la seule information qui fasse choisir entre deux noms.
             Le vehicule reste en fin de ligne, entre parentheses.

             `disabled` sur les indisponibles plutot que de les RETIRER de la
             liste : un livreur qui disparait se lit comme un compte supprime,
             et le vendeur va chercher la panne ailleurs. La, il lit la raison,
             et il sait qu il n a qu a l appeler. */}
          {drivers.map((d) => (
            <option key={d.id} value={d.id} disabled={!d.available}>
              {d.name}
              {d.zone ? ` — ${d.zone}` : ""}
              {d.vehicle ? ` (${d.vehicle})` : ""}
              {d.available ? "" : " — indisponible"}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={assigner}
          disabled={enCours}
          className="min-h-[44px] px-4 rounded-xl bg-brand hover:bg-brand-strong text-white font-semibold text-xs transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {enCours ? "Assignation…" : "Assigner"}
        </button>
      </div>

      {erreur && (
        <p role="alert" className="text-xs text-danger font-medium">
          {erreur}
        </p>
      )}
    </div>
  );
}
