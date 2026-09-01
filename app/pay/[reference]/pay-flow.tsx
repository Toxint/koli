"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCFA } from "@/lib/format";
import { simulatePaymentAction } from "@/lib/payments/actions";
import { confirmReceptionAction } from "@/lib/orders/actions";
import { Icone } from "@/components/ui/Icone";
import { FormulaireLitige } from "@/components/domain/FormulaireLitige";
import { FriseLivraison } from "@/components/domain/FriseLivraison";
import { JALONS, indiceJalon } from "@/lib/deliveries/jalons";
import type { OrderStatus } from "@prisma/client";
import { LogoKoli } from "@/components/ui/LogoKoli";

interface PayFlowProps {
  order: {
    id: string;
    reference: string;
    buyerName: string;
    buyerPhone: string;
    buyerCountry: string;
    buyerCity: string;
    buyerAddress: string;
    buyerLandmark?: string | null;
    deliveryFee: number;
    status: string;
    sellerName: string;
    items: {
      id: string;
      name: string;
      unitPrice: number;
      quantity: number;
    }[];
  };
  /** Vrai uniquement si le visiteur est le client authentifié de cette commande. */
  estLeClient?: boolean;
  /** Code de réception (§27) — transmis au seul client, jamais au vendeur ni au livreur. */
  codeReception?: string | null;
  /**
   * L'argent est-il simulé ?
   *
   * Un PROP et non la règle CSS `[data-mention-test]` : ici les phrases ne
   * disparaissent pas, elles CHANGENT. « Aucun argent réel n'a été prélevé »
   * masqué laisserait un message incomplet ; remplacé, il dit ce qui s'est
   * réellement passé.
   *
   * C'est l'écran que voit l'acheteur au moment de payer. Aucun autre n'a plus
   * besoin de dire la vérité sur ce qui arrive à son argent.
   */
  modeTest?: boolean;
}

export function PayFlow({
  order,
  estLeClient = false,
  codeReception = null,
  modeTest = true,
}: PayFlowProps) {
  const [status, setStatus] = useState(order.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = order.items.reduce(
    (acc, item) => acc + item.unitPrice * item.quantity,
    0
  );
  const grandTotal = subtotal + order.deliveryFee;

  const handleSimulatePayment = async (outcome: "SUCCESS" | "FAILURE") => {
    setLoading(true);
    setError(null);
    try {
      // L'action est indexee sur la reference : c'est elle qui circule dans le
      // lien de paiement et qui fait office de capacite (voir lib/payments/actions.ts).
      const res = await simulatePaymentAction(order.reference, outcome);
      if (res.success) {
        setStatus(res.status);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReception = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await confirmReceptionAction(order.reference);
      if (res.success) {
        setStatus(res.status);
      } else {
        setError(res.error);
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  // Un litige ouvert n'est ni un paiement a faire, ni une reception a
  // confirmer : sans ce cas, la commande retombait sur l'ecran de paiement et
  // reproposait « Simuler un paiement » a un client qui conteste.
  const enLitige =
    status === "DISPUTE_OPEN" ||
    status === "REFUND_PENDING" ||
    status === "REFUNDED";

  /**
   * Payé = tout ce qui se trouve SUR LA FRISE, à partir du séquestre.
   *
   * La liste était énumérée à la main et oubliait les états intermédiaires —
   * livreur désigné, colis récupéré, en route, arrivé. Une commande assignée à
   * un livreur retombait donc sur l'écran de paiement, qui proposait de régler
   * une seconde fois une commande déjà payée. C'est le défaut le plus grave
   * qu'un écran puisse avoir : il ne se plante pas, il ment.
   *
   * En le déduisant de la frise, tout état ajouté à celle-ci est couvert
   * d'office. Un état hors parcours — litige, remboursement, échec — rend
   * `-1` et suit son propre chemin.
   */
  const positionFrise = indiceJalon(status as OrderStatus);
  const estPaye = positionFrise >= 0;

  if (enLitige) {
    const rembourse = status === "REFUND_PENDING" || status === "REFUNDED";
    const rembourseTraite = status === "REFUNDED";

    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-test-mode-surface text-test-mode flex items-center justify-center mx-auto">
          <Icone nom={rembourse ? "argent" : "bouclier"} className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-semibold">
          {rembourseTraite
            ? "Commande remboursée"
            : rembourse
              ? "Remboursement en cours"
              : "Litige en cours d'examen"}
        </h1>
        <p className="text-sm text-ink-muted">
          {rembourseTraite
            ? `Le remboursement a été traité.${modeTest ? " Aucun mouvement réel n'a lieu en mode test." : ""}`
            : rembourse
              ? "KOLI a tranché en faveur du client. Le remboursement est enclenché."
              : "Les fonds restent bloqués : le vendeur ne sera pas payé tant que KOLI n'a pas tranché (§33)."}
        </p>

        <div className="bg-white border border-hairline p-4 rounded-xl text-left text-xs space-y-2">
          <div className="flex justify-between font-medium">
            <span className="text-ink-muted">Référence :</span>
            <span className="font-mono font-bold text-brand">
              {order.reference}
            </span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-ink-muted">Montant concerné :</span>
            <span className="font-bold">{formatCFA(grandTotal)}</span>
          </div>
        </div>

        <Link
          href={`/litige/${order.reference}`}
          className="inline-flex items-center justify-center w-full min-h-[48px] px-4 rounded-2xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm"
        >
          Suivre le litige
        </Link>
      </div>
    );
  }

  if (estPaye) {
    // §29 : une fois le colis remis, le client doit confirmer la réception.
    // C'est cette confirmation — et elle seule — qui libère les fonds au vendeur.
    const attendConfirmation = status === "DELIVERED";
    const estTermine = status === "FUNDS_RELEASED" || status === "COMPLETED";

    // Entre le paiement et la remise, l'ecran annoncait invariablement
    // « Paiement securise KOLI confirme » — vrai, mais sans interet : le client
    // sait qu'il a paye, ce qu'il veut savoir c'est OU EST SON COLIS.
    const jalon = JALONS[positionFrise];
    const enChemin = !attendConfirmation && !estTermine && positionFrise > 0;

    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-4">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto shadow-lg ${
            attendConfirmation
              ? "bg-brand-soft text-brand shadow-brand/25"
              : "bg-brand-soft text-brand shadow-brand/25"
          }`}
        >
          <Icone nom={attendConfirmation ? "colis" : "valide"} className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-semibold text-brand dark:text-white">
          {attendConfirmation
            ? "Avez-vous reçu votre commande ?"
            : estTermine
              ? "Commande terminée"
              : enChemin
                ? jalon.libelleClient
                : "Paiement sécurisé KOLI confirmé"}
        </h1>
        <p className="text-sm text-ink-muted dark:text-slate-300">
          {attendConfirmation
            ? "Le livreur a marqué votre colis comme remis. Confirmez la réception pour que le vendeur soit payé (simulation)."
            : estTermine
              ? modeTest
                ? "Vous avez confirmé la réception. Les fonds seraient versés au vendeur — aucun mouvement réel n'a lieu en mode test."
                : "Vous avez confirmé la réception. Les fonds sont versés au vendeur."
              : enChemin
                ? jalon.detailClient
                : modeTest
                  ? "Votre paiement simulé est enregistré. Aucun argent réel n'a été prélevé ni détenu. Le vendeur voit la commande comme payée et prépare l'expédition."
                  : "Votre paiement est enregistré. Le montant est conservé jusqu'à votre confirmation de réception : le vendeur n'est pas encore payé."}
        </p>

        <span className="inline-block px-3 py-1 rounded-full bg-test-mode-surface dark:bg-amber-950/80 text-test-mode dark:text-amber-300 text-[11px] font-bold uppercase tracking-wider border border-brand-border/60">
          <Icone nom="eclair" className="w-3.5 h-3.5" /> Mode test — aucun paiement réel
        </span>

        {/* Code de réception (§27) — visible du seul client authentifié. */}
        {codeReception && !estTermine && (
          <div className="bg-brand-soft dark:bg-emerald-950/50 border-2 border-brand-border dark:border-emerald-800 rounded-2xl p-5 space-y-2">
            <span className="block text-[11px] font-bold uppercase tracking-widest text-brand dark:text-emerald-400">
              Votre code de réception
            </span>
            <span className="block font-mono text-4xl font-bold tracking-[0.25em] text-brand dark:text-emerald-300">
              {codeReception}
            </span>
            <p className="text-xs text-brand/80 dark:text-emerald-300/80">
              Communiquez ce code au livreur <strong>uniquement</strong> lorsque
              vous avez le colis entre les mains. Ne le partagez avec personne
              d&apos;autre.
            </p>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 border border-hairline dark:border-slate-800 p-4 rounded-xl text-left text-xs space-y-2">
          <div className="flex justify-between font-medium">
            <span className="text-ink-muted">Référence :</span>
            <span className="font-mono font-bold text-brand">{order.reference}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-ink-muted">Montant total :</span>
            <span className="font-bold text-brand dark:text-white">{formatCFA(grandTotal)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-ink-muted">Destinataire :</span>
            <span>{order.buyerName} ({order.buyerPhone})</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-ink-muted">Adresse :</span>
            <span>{order.buyerAddress}, {order.buyerCity}</span>
          </div>
        </div>

        {/* §26 : la frise de suivi. Elle repond a la seule question que se
            pose un client entre l'expedition et la remise. */}
        <div className="bg-white dark:bg-slate-900 border border-hairline dark:border-slate-800 p-5 rounded-xl text-left">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-3">
            Suivi de votre colis
          </h2>
          <FriseLivraison statut={status as OrderStatus} />
        </div>

        {error && (
          <div role="alert" className="p-4 rounded-2xl bg-red-50 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {attendConfirmation && estLeClient && (
          <div className="space-y-3 pt-2">
            <button
              type="button"
              disabled={loading}
              onClick={handleConfirmReception}
              className="w-full min-h-[48px] py-4 px-4 rounded-2xl bg-brand hover:bg-brand-strong text-white font-semibold text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/25 transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Traitement en cours…" : "Oui, j'ai reçu ma commande"}
            </button>

          </div>
        )}

        {/* §31 : ce bouton etait inerte. Le client n'avait donc qu'un seul
            geste possible — confirmer la reception, ce qui verse l'argent au
            vendeur. Celui qui recoit un colis vide, ou qui ne recoit jamais
            rien, n'avait litteralement aucun recours.
            Propose des que les fonds sont sequestres, et pas seulement apres
            livraison : le tout premier motif du §31 est « produit non recu ». */}
        {estLeClient && !estTermine && (
          <div className="pt-2">
            <FormulaireLitige reference={order.reference} />
          </div>
        )}

        {/* Le vendeur et le livreur atteignent aussi cette page via le lien
            partagé : seul le client peut confirmer, et donc déclencher le
            versement. */}
        {attendConfirmation && !estLeClient && (
          <div className="pt-2">
            <Link
              href={`/connexion?redirect=/pay/${order.reference}`}
              className="inline-flex items-center justify-center w-full min-h-[48px] px-4 rounded-2xl border border-brand-border dark:border-emerald-800 text-brand dark:text-emerald-400 font-bold text-xs"
            >
              Connectez-vous pour confirmer la réception
            </Link>
            <p className="mt-2 text-xs text-ink-muted">
              Seul le client destinataire peut confirmer avoir reçu la commande.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 mb-2">
          <LogoKoli taille={44} className="animate-float shrink-0" />
          <span className="font-bold text-2xl tracking-tight text-brand dark:text-white">
            KOLI <span className="text-amber-500 font-mono text-sm uppercase tracking-widest font-semibold">PAY</span>
          </span>
        </div>
        <h1 className="text-2xl font-bold text-brand dark:text-white">
          Paiement Sécurisé de la Commande {order.reference}
        </h1>
        <p className="text-xs text-ink-muted">
          Vendu par <span className="font-bold text-brand dark:text-amber-400">{order.sellerName}</span>
        </p>
      </div>

      {error && (
        <div role="alert" className="p-4 rounded-2xl bg-red-50 text-red-700 text-sm text-center font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Order Summary Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-hairline/80 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider dark:text-amber-400">
            Récapitulatif de la commande
          </h2>

          <div className="divide-y divide-hairline dark:divide-slate-800">
            {order.items.map((item) => (
              <div key={item.id} className="py-3 flex justify-between items-center text-sm">
                <div>
                  <span className="font-bold text-brand dark:text-white block">
                    {item.name}
                  </span>
                  <span className="text-xs text-ink-muted">
                    Quantité : {item.quantity} × {formatCFA(item.unitPrice)}
                  </span>
                </div>
                <span className="font-bold text-brand dark:text-white">
                  {formatCFA(item.unitPrice * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-hairline dark:border-slate-800 text-xs space-y-2">
            <div className="flex justify-between text-ink-muted">
              <span>Sous-total articles :</span>
              <span className="font-semibold">{formatCFA(subtotal)}</span>
            </div>
            <div className="flex justify-between text-ink-muted">
              <span>Frais de livraison :</span>
              <span className="font-semibold">{formatCFA(order.deliveryFee)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-brand dark:text-white pt-2 border-t border-hairline dark:border-slate-800">
              <span>Total à régler :</span>
              <span className="text-brand dark:text-amber-400">{formatCFA(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Payment Simulation Box */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-brand-border/40 dark:border-amber-500/20 p-6 shadow-xl shadow-amber-500/5 space-y-6">
          <div>
            {/*
              * ⚠ CE BLOC EST CELUI DE LA SIMULATION.
              *
              * En mode réel il doit céder la place au tunnel iKeePay
              * (`PaymentIntent.checkoutUrl`), qui n'est pas encore branché ici.
              * Les textes sont donc conditionnés dès maintenant — annoncer
              * « aucun argent réel n'est prélevé » sur l'écran de paiement
              * serait le pire endroit possible pour le dire à tort — mais les
              * boutons de scénario, eux, restent à remplacer.
              */}
            {modeTest && (
              <div className="inline-block px-3 py-1 rounded-full bg-brand-soft dark:bg-amber-950 text-brand dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider mb-2 border border-brand-border/50">
                <Icone nom="eclair" className="w-3.5 h-3.5" /> Mode test MVP
              </div>
            )}
            <h2 className="text-lg font-bold dark:text-white">
              {modeTest ? "Simulation de Paiement Sécurisé" : "Paiement sécurisé"}
            </h2>
            <p className="text-xs text-ink-muted mt-1">
              {modeTest
                ? "Aucun argent réel n'est prélevé. Choisissez le scénario de test pour continuer."
                : "Le montant est conservé jusqu'à votre confirmation de réception : le vendeur n'est pas payé avant."}
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSimulatePayment("SUCCESS")}
              className="w-full py-4 px-4 rounded-2xl bg-brand hover:bg-brand-strong text-white font-semibold text-xs uppercase tracking-wider shadow-lg shadow-brand/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer border border-brand-border/60"
            >
              {loading ? (
                <span>Traitement en cours...</span>
              ) : (
                <><Icone nom="solde" className="w-4 h-4" /> Simuler un paiement réussi</>
              )}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleSimulatePayment("FAILURE")}
              className="w-full py-3 px-4 rounded-xl border border-hairline dark:border-slate-700 hover:bg-brand-soft dark:hover:bg-slate-800 text-brand dark:text-slate-300 font-semibold text-xs transition-colors"
            >
              <Icone nom="fermer" className="w-4 h-4" /> Simuler un paiement échoué
            </button>
          </div>

          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-xs">
            <Icone nom="bouclier" className="w-4 h-4 inline-block" /> <strong>Garantie KOLI :</strong> le vendeur n&apos;est payé qu&apos;après que vous ayez confirmé avoir reçu votre commande.
            {modeTest
              ? " En mode test, aucun montant réel n'est prélevé ni détenu."
              : " Le montant est conservé par notre partenaire agréé, pas par KOLI."}
          </div>
        </div>
      </div>
    </div>
  );
}
