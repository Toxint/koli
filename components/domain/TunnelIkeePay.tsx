"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icone } from "@/components/ui/Icone";
import { etatDeLaCommandeAction } from "@/lib/payments/actions";

/**
 * Le tunnel de paiement iKeePay, dans une iframe.
 *
 * L'acheteur KOLI arrive par un lien WhatsApp et n'a pas de compte. C'est
 * iKeePay qui lui demande son numéro, son opérateur, son code OTP, et qui gère
 * les redirections Wave et Orange. Aucun numéro de payeur ne transite par KOLI.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  `ikeepay-success` NE CONCLUT RIEN.                                      │
 * │                                                                          │
 * │  C'est un `postMessage` envoyé au navigateur. N'importe qui peut         │
 * │  l'émettre depuis la console, ou depuis une page tierce ouverte à côté.  │
 * │  Le prendre pour un verdict, c'est offrir un colis à qui sait ouvrir     │
 * │  les outils de développement.                                            │
 * │                                                                          │
 * │  Il sert d'unique chose : savoir qu'il est temps de DEMANDER AU SERVEUR. │
 * │  Le verdict arrive par le rappel signé, et c'est la base qui fait foi.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Leur documentation montre un écouteur qui ne vérifie pas `event.origin` :
 *
 *     window.addEventListener('message', (e) => {
 *       if (e.data === 'ikeepay-success') alert("Paiement validé !");
 *     });
 *
 * Sans ce contrôle, **toute** page capable de nous poster un message est crue.
 * Ici l'origine est comparée à celle du tunnel, et tout le reste est ignoré
 * en silence — un message d'une origine inconnue n'est pas une erreur à
 * signaler, c'est du bruit à ne pas écouter.
 */

/** Rythme de la relance après un succès annoncé. */
const INTERVALLE_MS = 3_000;

/**
 * Combien de fois on redemande avant de renoncer.
 *
 * Quarante fois trois secondes, soit deux minutes. Un rappel Mobile Money
 * arrive en quelques secondes ; au-delà de deux minutes, c'est qu'il s'est
 * perdu — et l'écran doit le dire plutôt que tourner indéfiniment.
 */
const RELANCES_MAX = 40;

/** Les états qui signifient que le paiement a abouti côté KOLI. */
const ABOUTIS = new Set([
  "PAYMENT_CONFIRMED",
  "FUNDS_SECURED",
  "SELLER_ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED",
  "DELIVERED",
  "COMPLETED",
]);

type Etape = "attente" | "tunnel" | "confirmation" | "abouti" | "perdu";

export function TunnelIkeePay({
  reference,
  checkoutUrl,
  onAbouti,
}: {
  reference: string;
  /** Bâtie par le serveur — voir `IkeePayProvider.initiate`. */
  checkoutUrl: string;
  /** Prévient la page que la commande est passée à payée. */
  onAbouti: (status: string) => void;
}) {
  const [etape, setEtape] = useState<Etape>("attente");
  const [pret, setPret] = useState(false);
  const relances = useRef(0);

  /**
   * L'origine du tunnel, tirée de l'adresse elle-même.
   *
   * Pas une constante écrite en dur : l'adresse vient de la configuration
   * (`IKEEPAY_CHECKOUT_URL`), et deux valeurs qui doivent concorder finissent
   * toujours par diverger. Celle-ci ne peut pas se tromper.
   */
  const origineTunnel = (() => {
    try {
      return new URL(checkoutUrl).origin;
    } catch {
      return null;
    }
  })();

  /** Demande au SERVEUR où en est la commande. Le seul verdict qui compte. */
  const demanderAuServeur = useCallback(async () => {
    const etat = await etatDeLaCommandeAction(reference).catch(() => null);
    if (etat && ABOUTIS.has(etat.status)) {
      setEtape("abouti");
      onAbouti(etat.status);
      return true;
    }
    return false;
  }, [reference, onAbouti]);

  /* ── Les messages du tunnel ── */
  useEffect(() => {
    if (!origineTunnel) return;

    const ecouter = (e: MessageEvent) => {
      // LE contrôle. Un message d'ailleurs n'est pas discuté, il est ignoré.
      if (e.origin !== origineTunnel) return;

      if (e.data === "ikeepay-ready") setPret(true);

      if (e.data === "ikeepay-success") {
        // On referme et on interroge le serveur. On ne marque RIEN ici.
        setEtape("confirmation");
        relances.current = 0;
      }

      if (e.data === "ikeepay-close") setEtape("attente");
    };

    window.addEventListener("message", ecouter);
    return () => window.removeEventListener("message", ecouter);
  }, [origineTunnel]);

  /* ── La relance, tant que le rappel n'est pas arrivé ── */
  useEffect(() => {
    if (etape !== "confirmation") return;

    const minuterie = setInterval(async () => {
      relances.current += 1;
      if (await demanderAuServeur()) return;

      if (relances.current >= RELANCES_MAX) {
        // On ne dit PAS « échec » : le paiement a peut-être abouti chez
        // iKeePay et le rappel s'est perdu. Annoncer un échec ferait payer
        // deux fois quelqu'un qui a déjà payé.
        setEtape("perdu");
      }
    }, INTERVALLE_MS);

    return () => clearInterval(minuterie);
  }, [etape, demanderAuServeur]);

  if (!origineTunnel) {
    return (
      <p role="alert" className="text-xs font-semibold text-danger">
        L&apos;adresse du tunnel de paiement est invalide. Prévenez le vendeur —
        ne réessayez pas, aucun paiement n&apos;a été engagé.
      </p>
    );
  }

  if (etape === "abouti") {
    return (
      <p role="status" className="text-sm font-semibold text-success">
        <Icone nom="valide" className="h-4 w-4" /> Paiement confirmé.
      </p>
    );
  }

  if (etape === "confirmation" || etape === "perdu") {
    return (
      <div role="status" className="space-y-2 text-center">
        <p className="text-sm font-semibold text-brand">
          {etape === "confirmation"
            ? "Nous confirmons votre paiement…"
            : "Votre paiement est en cours de vérification."}
        </p>
        <p className="text-xs leading-relaxed text-ink-muted">
          {etape === "confirmation"
            ? "Cela prend quelques secondes. Ne fermez pas cette page."
            : "Si votre compte a été débité, la commande se mettra à jour d'elle-même. Ne payez pas une seconde fois — contactez le vendeur si rien ne change."}
        </p>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setEtape("tunnel")}
        className="flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-xs font-semibold uppercase tracking-wider text-white shadow-lg shadow-brand/25 hover:bg-brand-strong"
      >
        <Icone nom="solde" className="h-4 w-4" /> Payer {reference}
      </button>

      {etape === "tunnel" && (
        /*
         * L'habillage reste MASQUÉ jusqu'à `ikeepay-ready`.
         *
         * C'est ce que recommande leur documentation, et la raison est bonne :
         * une iframe affichée avant d'être prête montre un rectangle blanc au
         * milieu de la page, le temps du chargement. Sur réseau mobile lent,
         * ce blanc dure et se lit comme une panne.
         */
        <div
          className={`fixed inset-0 z-50 items-center justify-center bg-black/40 backdrop-blur-sm ${
            pret ? "flex" : "hidden"
          }`}
        >
          <div className="relative h-[90vh] w-full max-w-[450px]">
            <iframe
              src={checkoutUrl}
              title="Paiement sécurisé"
              className="h-full w-full border-none bg-transparent"
            />
          </div>
        </div>
      )}

      {etape === "tunnel" && !pret && (
        <p role="status" className="mt-3 text-center text-xs text-ink-muted">
          Ouverture du paiement sécurisé…
        </p>
      )}
    </>
  );
}
