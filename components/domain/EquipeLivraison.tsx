"use client";

import { useState, useTransition } from "react";
import { Icone } from "@/components/ui/Icone";
import { retirerDeLEquipeAction } from "@/lib/drivers/equipe";
import {
  emettreInvitationAction,
  revoquerInvitationAction,
} from "@/lib/drivers/invitations";

/**
 * L'équipe de livraison, côté écran (§5.3).
 *
 * Deux blocs : le lien d'invitation, puis la liste. Dans cet ordre, parce que
 * l'équipe est vide au début et que la seule chose à faire est alors d'inviter
 * quelqu'un. Une liste vide en haut de page n'aide personne.
 */

export interface MembreAffiche {
  id: string;
  nom: string;
  vehicule: string | null;
  zone: string | null;
  disponible: boolean;
  actif: boolean;
  /** Sérialisée par le serveur : une `Date` ne traverse pas la frontière. */
  depuis: string;
  livraisons: number;
}

export interface InvitationAffichee {
  token: string;
  expiresAt: string;
  entrees: number;
}

const JOUR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

export function EquipeLivraison({
  equipe,
  invitation,
  origine,
}: {
  equipe: MembreAffiche[];
  invitation: InvitationAffichee | null;
  /** L'hôte réellement visité, pour bâtir un lien qui marche ailleurs. */
  origine: string | null;
}) {
  const [enCours, demarrer] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  const lien =
    invitation && origine
      ? `${origine}/inscription?invitation=${invitation.token}`
      : null;

  /**
   * Copier — avec un repli, parce que `navigator.clipboard` n'existe pas partout.
   *
   * Il est réservé aux contextes dits sûrs : HTTPS, ou `localhost`. Le serveur
   * de ce projet se visite couramment depuis un téléphone en `http://192.168…`,
   * où l'API est purement absente — le bouton n'aurait rien fait, sans le
   * moindre message. Le repli par `execCommand` est officiellement obsolète et
   * fonctionne précisément là où l'autre manque.
   */
  async function copier() {
    if (!lien) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(lien);
      } else {
        const champ = document.createElement("textarea");
        champ.value = lien;
        champ.setAttribute("readonly", "");
        champ.style.position = "fixed";
        champ.style.opacity = "0";
        document.body.appendChild(champ);
        champ.select();
        document.execCommand("copy");
        document.body.removeChild(champ);
      }
      setCopie(true);
      setTimeout(() => setCopie(false), 2200);
    } catch {
      setErreur("La copie a échoué. Sélectionnez le lien et copiez-le à la main.");
    }
  }

  function emettre() {
    setErreur(null);
    setMessage(null);
    demarrer(async () => {
      const res = await emettreInvitationAction();
      if (res.success) {
        setMessage(
          invitation
            ? "Nouveau lien créé. L'ancien ne fonctionne plus."
            : "Lien créé. Partagez-le avec vos livreurs."
        );
      } else {
        setErreur(res.error);
      }
    });
  }

  function revoquer() {
    setErreur(null);
    setMessage(null);
    demarrer(async () => {
      const res = await revoquerInvitationAction();
      if (res.success) {
        setMessage(
          "Lien fermé. Vos livreurs déjà inscrits restent dans l'équipe."
        );
      } else {
        setErreur(res.error);
      }
    });
  }

  function retirer(id: string, nom: string) {
    setErreur(null);
    setMessage(null);
    demarrer(async () => {
      const res = await retirerDeLEquipeAction(id);
      if (res.success) {
        setMessage(`${nom} ne fait plus partie de votre équipe.`);
      } else {
        setErreur(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* ═══════════ Le lien d'invitation ═══════════ */}
      <section className="rounded-2xl border border-hairline bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">Inviter un livreur</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Envoyez ce lien à votre livreur. Il crée son compte et rejoint
              votre équipe automatiquement.
            </p>
          </div>
          {invitation && (
            <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-bold text-brand">
              {invitation.entrees === 0
                ? "Aucune entrée"
                : `${invitation.entrees} entrée${invitation.entrees > 1 ? "s" : ""}`}
            </span>
          )}
        </div>

        {lien ? (
          <div className="mt-4 space-y-3">
            {/*
              * Le lien est dans un champ en LECTURE SEULE, pas dans un
              * paragraphe. On le sélectionne d'un geste, et sur un téléphone
              * l'appui long propose « copier » — ce qu'un texte libre ne fait
              * pas toujours. `readOnly` et non `disabled` : un champ désactivé
              * n'est ni sélectionnable ni lisible par un lecteur d'écran.
              */}
            <label htmlFor="lien-invitation" className="sr-only">
              Lien d&apos;invitation pour vos livreurs
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="lien-invitation"
                type="text"
                readOnly
                value={lien}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-xl border border-hairline bg-cream px-3 py-3 font-mono text-xs text-ink"
              />
              <button
                type="button"
                onClick={copier}
                className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-xs font-bold text-white hover:bg-brand-strong"
              >
                <Icone nom={copie ? "valide" : "lien"} className="h-3.5 w-3.5" />
                {copie ? "Copié" : "Copier le lien"}
              </button>
            </div>

            <p className="text-xs text-ink-muted">
              Valable jusqu&apos;au {JOUR.format(new Date(invitation!.expiresAt))}.
              Le même lien sert pour tous vos livreurs.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={emettre}
                disabled={enCours}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-brand disabled:opacity-50"
              >
                <Icone nom="nouveau" className="h-3.5 w-3.5" />
                Remplacer par un nouveau lien
              </button>
              <button
                type="button"
                onClick={revoquer}
                disabled={enCours}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-danger disabled:opacity-50"
              >
                <Icone nom="fermer" className="h-3.5 w-3.5" />
                Fermer le lien
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <button
              type="button"
              onClick={emettre}
              disabled={enCours}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-xs font-bold text-white hover:bg-brand-strong disabled:opacity-50"
            >
              <Icone nom="lien" className="h-3.5 w-3.5" />
              {enCours ? "Création…" : "Créer un lien d'invitation"}
            </button>
            {!origine && (
              <p className="mt-2 text-xs text-danger">
                L&apos;adresse du site n&apos;a pas pu être déterminée : le lien
                ne serait pas partageable.
              </p>
            )}
          </div>
        )}

        {/* Les messages sont annoncés : sans `role`, un lecteur d'écran ne
            signale rien et l'utilisateur ne sait pas si son geste a porté. */}
        {message && (
          <p role="status" className="mt-3 text-xs font-semibold text-success">
            {message}
          </p>
        )}
        {erreur && (
          <p role="alert" className="mt-3 text-xs font-semibold text-danger">
            {erreur}
          </p>
        )}
      </section>

      {/* ═══════════ L'équipe ═══════════ */}
      <section className="rounded-2xl border border-hairline bg-white p-6">
        <h2 className="text-sm font-bold">Votre équipe</h2>

        {equipe.length === 0 ? (
          <div className="py-10 text-center">
            <Icone nom="livreur" className="mx-auto mb-2 h-9 w-9 text-brand" />
            <p className="text-sm font-semibold">
              Aucun livreur dans votre équipe
            </p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-ink-muted">
              Créez un lien d&apos;invitation ci-dessus et envoyez-le à votre
              livreur habituel. Tant que votre équipe est vide, vous ne pourrez
              assigner personne à une livraison.
            </p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-hairline">
            {equipe.map((membre) => (
              <li
                key={membre.id}
                className="flex flex-wrap items-center gap-3 py-4"
              >
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand"
                >
                  <Icone nom="livreur" className="h-4 w-4 text-white" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                    {membre.nom}
                    {/*
                      * L'état ne tient PAS qu'à la couleur : le mot est écrit.
                      * §69 — une pastille verte contre une pastille grise ne
                      * dit rien à qui ne distingue pas les deux.
                      */}
                    {!membre.actif ? (
                      <span className="rounded-full bg-hairline px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                        Compte suspendu
                      </span>
                    ) : membre.disponible ? (
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
                        Disponible
                      </span>
                    ) : (
                      <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-deep">
                        Indisponible
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {membre.zone ?? "Zone non précisée"}
                    {membre.vehicule ? ` · ${membre.vehicule}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {membre.livraisons === 0
                      ? "Aucune course pour vous"
                      : `${membre.livraisons} course${membre.livraisons > 1 ? "s" : ""} pour vous`}{" "}
                    · dans votre équipe depuis le{" "}
                    {JOUR.format(new Date(membre.depuis))}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => retirer(membre.id, membre.nom)}
                  disabled={enCours}
                  className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-hairline px-3 text-xs font-semibold text-ink-muted hover:border-danger hover:text-danger disabled:opacity-50"
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}

        {equipe.length > 0 && (
          <p className="mt-4 border-t border-hairline pt-4 text-xs leading-relaxed text-ink-muted">
            Retirer un livreur ne l&apos;empêche pas de terminer une course déjà
            commencée : il pourra remettre le colis et saisir le code de
            réception. Vous ne pourrez simplement plus lui en confier de
            nouvelle.
          </p>
        )}
      </section>
    </div>
  );
}
