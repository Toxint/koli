"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { formatCFA } from "@/lib/format";
import { Icone } from "@/components/ui/Icone";

/**
 * Deux données qui vivent hors de React : l'adresse de la page et les
 * capacités du navigateur.
 *
 * `useSyncExternalStore` est fait pour ça — les lire dans un effet puis les
 * poser en état provoque un rendu de plus et brouille l'accord entre le rendu
 * serveur et le rendu client. Rien n'y change en cours de vie : l'abonnement
 * est donc vide, et c'est légitime.
 */
const NE_CHANGE_JAMAIS = () => () => {};

const lireAdresse = () => window.location.href;
/** Au rendu serveur, il n'y a pas d'adresse à afficher. */
const adresseServeur = () => "";

const lirePartageNatif = () =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";
const partageNatifServeur = () => false;

/**
 * Télécharger et partager un reçu (§38).
 *
 * Le besoin est concret : un client n'arrive pas à ouvrir son reçu, et il faut
 * pouvoir le lui renvoyer par WhatsApp ou par SMS depuis le téléphone qu'on a
 * en main.
 *
 * **Deux contraintes de plateforme dictent la conception.**
 *
 * 1. `navigator.share` et `navigator.clipboard` n'existent QUE dans un
 *    contexte sécurisé — HTTPS ou localhost. KOLI se teste depuis une adresse
 *    réseau en clair (`http://192.168.x.x`), et sera un jour ouvert sur des
 *    connexions que l'on ne maîtrise pas. Un unique bouton « Partager » qui
 *    s'appuierait dessus ne ferait donc RIEN sur l'appareil principal de la
 *    cible, sans le moindre message. Les liens WhatsApp et SMS sont toujours
 *    proposés en clair : eux fonctionnent partout.
 *
 * 2. Le schéma `sms:` diffère : iOS attend `&body=`, Android `?body=`. Se
 *    tromper ouvre l'application de messagerie avec un message vide.
 *
 * **Pas de bibliothèque PDF.** Le public visé est majoritairement sur réseau
 * mobile lent (§70) ; embarquer un générateur de PDF de plusieurs centaines de
 * kilo-octets pour une page que le navigateur sait déjà imprimer en PDF serait
 * un mauvais échange. Le bouton déclenche l'impression, où « Enregistrer au
 * format PDF » est proposé aussi bien sur Android que sur iOS.
 */
export function PartagerFacture({
  numero,
  reference,
  total,
  vendeur,
}: {
  numero: string;
  reference: string;
  total: number;
  vendeur: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [copie, setCopie] = useState(false);
  const champLien = useRef<HTMLInputElement>(null);

  // L'adresse est lue sur la page elle-même, jamais reconstruite depuis une
  // variable de configuration : le destinataire doit recevoir l'origine
  // RÉELLEMENT visitée. Une URL en dur renverrait un visiteur de 192.168.x.x
  // vers « localhost », c'est-à-dire vers son propre téléphone.
  const lien = useSyncExternalStore(
    NE_CHANGE_JAMAIS,
    lireAdresse,
    adresseServeur
  );
  const partageNatif = useSyncExternalStore(
    NE_CHANGE_JAMAIS,
    lirePartageNatif,
    partageNatifServeur
  );

  const message = `Reçu KOLI ${numero}
Commande ${reference} — ${vendeur}
Total réglé : ${formatCFA(total)}

Voir le reçu : ${lien}`;

  /** iOS attend `sms:&body=`, Android `sms:?body=`. */
  const lienSms = () => {
    const corps = encodeURIComponent(message);
    const estIOS =
      typeof navigator !== "undefined" &&
      /iPad|iPhone|iPod/.test(navigator.userAgent);
    return estIOS ? `sms:&body=${corps}` : `sms:?body=${corps}`;
  };

  const lienWhatsapp = `https://wa.me/?text=${encodeURIComponent(message)}`;

  const copier = useCallback(async () => {
    // Chemin moderne, puis repli sur la sélection du champ. Le second marche
    // sans contexte sécurisé ; si les deux échouent, le lien reste visible et
    // sélectionnable à la main, ce qui n'est jamais un cul-de-sac.
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
    } catch {
      const champ = champLien.current;
      if (!champ) return;
      champ.select();
      champ.setSelectionRange(0, lien.length);
      try {
        setCopie(document.execCommand("copy"));
      } catch {
        setCopie(false);
      }
    }
  }, [lien]);

  useEffect(() => {
    if (!copie) return;
    const t = setTimeout(() => setCopie(false), 2500);
    return () => clearTimeout(t);
  }, [copie]);

  const partager = async () => {
    try {
      await navigator.share({ title: `Reçu KOLI ${numero}`, text: message });
    } catch {
      // Refus de l'utilisateur ou plateforme récalcitrante : on déplie les
      // choix explicites plutôt que de laisser le geste sans effet.
      setOuvert(true);
    }
  };

  return (
    <div className="imprimer-masquer space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-xl bg-brand hover:bg-brand-strong text-white text-sm font-bold shadow-md transition-all"
        >
          <Icone nom="telechargement" className="w-4 h-4" />
          Télécharger
        </button>

        <button
          type="button"
          onClick={() => (partageNatif ? partager() : setOuvert((o) => !o))}
          aria-expanded={partageNatif ? undefined : ouvert}
          className="inline-flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-xl border border-brand-border bg-white hover:bg-brand-soft/50 text-brand text-sm font-bold transition-all"
        >
          <Icone nom="partage" className="w-4 h-4" />
          Partager
        </button>
      </div>

      <p className="text-xs text-ink-muted">
        « Télécharger » ouvre l&apos;impression de votre navigateur : choisissez{" "}
        <span className="font-medium">« Enregistrer au format PDF »</span>.
      </p>

      {ouvert && (
        <div className="rounded-2xl border border-hairline bg-white p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <a
              href={lienWhatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-xl bg-brand-soft text-brand hover:bg-brand-soft/70 text-xs font-bold transition-all"
            >
              <Icone nom="message" className="w-4 h-4" />
              Envoyer par WhatsApp
            </a>

            <a
              href={lienSms()}
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-xl bg-brand-soft text-brand hover:bg-brand-soft/70 text-xs font-bold transition-all"
            >
              <Icone nom="telephone" className="w-4 h-4" />
              Envoyer par SMS
            </a>

            <button
              type="button"
              onClick={copier}
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-xl border border-hairline hover:bg-brand-soft/40 text-xs font-bold transition-all"
            >
              <Icone nom={copie ? "valide" : "lien"} className="w-4 h-4" />
              {copie ? "Lien copié" : "Copier le lien"}
            </button>
          </div>

          {/* Le lien reste affiché et sélectionnable : si la copie échoue —
              elle le peut, hors contexte sécurisé — l'utilisateur n'est pas
              bloqué, il le sélectionne à la main. */}
          <label className="block">
            <span className="sr-only">Lien du reçu</span>
            <input
              ref={champLien}
              readOnly
              value={lien}
              onFocus={(e) => e.currentTarget.select()}
              /* 16px minimum : en dessous, iOS zoome à la mise au point. */
              className="w-full min-h-[44px] px-3 rounded-xl border border-hairline bg-cream text-base font-mono text-ink-muted"
            />
          </label>

          {/* La référence tient lieu de clé d'accès (§38) : le dire évite
              qu'un vendeur diffuse dans un groupe un lien qui porte le nom,
              le téléphone et l'adresse de son client. */}
          <p className="text-xs text-ink-muted">
            <Icone
              nom="info"
              className="w-3.5 h-3.5 text-brand mr-1 align-[-0.15em]"
            />
            Toute personne recevant ce lien pourra consulter le reçu, qui porte
            les coordonnées du client. Ne le partagez qu&apos;avec les
            personnes concernées.
          </p>
        </div>
      )}
    </div>
  );
}
