"use client";

import { useState } from "react";
import { formatCFA } from "@/lib/format";
import { simulatePaymentAction } from "@/lib/payments/actions";

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
}

export function PayFlow({ order }: PayFlowProps) {
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
      const res = await simulatePaymentAction(order.id, outcome);
      if (res.success && res.status) {
        setStatus(res.status);
      } else {
        setError(res.error || "Échec du paiement");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  if (status === "FUNDS_SECURED" || status === "CUSTOMER_CONFIRMED" || status === "DELIVERED" || status === "FUNDS_RELEASED" || status === "COMPLETED") {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl mx-auto shadow-lg shadow-emerald-500/20">
          ✅
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">
          Paiement Sécurisé KOLI Confirmé !
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Vos fonds sont conservés en **Mode Test (KOLI Hold)**. Le vendeur a été notifié et prépare l'expédition de votre colis.
        </p>

        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl text-left text-xs space-y-2">
          <div className="flex justify-between font-medium">
            <span className="text-slate-400">Référence :</span>
            <span className="font-mono font-bold text-emerald-600">{order.reference}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-slate-400">Montant total :</span>
            <span className="font-bold text-slate-900 dark:text-white">{formatCFA(grandTotal)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-slate-400">Destinataire :</span>
            <span>{order.buyerName} ({order.buyerPhone})</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-slate-400">Adresse :</span>
            <span>{order.buyerAddress}, {order.buyerCity}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 mb-2">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-500 flex items-center justify-center text-slate-950 font-black text-2xl shadow-lg shadow-amber-500/20 border border-amber-300/40 animate-float">
            K
          </div>
          <span className="font-black text-2xl tracking-tight text-slate-900 dark:text-white">
            KOLI <span className="text-amber-500 font-mono text-sm uppercase tracking-widest font-extrabold">PAY</span>
          </span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">
          Paiement Sécurisé de la Commande {order.reference}
        </h1>
        <p className="text-xs text-slate-500">
          Vendu par <span className="font-bold text-amber-600 dark:text-amber-400">{order.sellerName}</span>
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 text-red-700 text-sm text-center font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Order Summary Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-sm space-y-4">
          <h2 className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Récapitulatif de la commande
          </h2>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {order.items.map((item) => (
              <div key={item.id} className="py-3 flex justify-between items-center text-sm">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">
                    {item.name}
                  </span>
                  <span className="text-xs text-slate-400">
                    Quantité : {item.quantity} × {formatCFA(item.unitPrice)}
                  </span>
                </div>
                <span className="font-black text-slate-900 dark:text-white">
                  {formatCFA(item.unitPrice * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs space-y-2">
            <div className="flex justify-between text-slate-500">
              <span>Sous-total articles :</span>
              <span className="font-semibold">{formatCFA(subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Frais de livraison :</span>
              <span className="font-semibold">{formatCFA(order.deliveryFee)}</span>
            </div>
            <div className="flex justify-between text-base font-black text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-800">
              <span>Total à régler :</span>
              <span className="text-amber-600 dark:text-amber-400">{formatCFA(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Payment Simulation Box */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-amber-300/40 dark:border-amber-500/20 p-6 shadow-xl shadow-amber-500/5 space-y-6">
          <div>
            <div className="inline-block px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 text-[10px] font-black uppercase tracking-wider mb-2 border border-amber-300/50">
              ⚡ Mode Test MVP
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              Simulation de Paiement Sécurisé
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Aucun argent réel n'est prélevé. Choisissez le scénario de test pour continuer.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleSimulatePayment("SUCCESS")}
              className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer border border-amber-300/60"
            >
              {loading ? (
                <span>Traitement en cours...</span>
              ) : (
                "💳 Simuler un Paiement Réussi (Orange/Wave/MTN)"
              )}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => handleSimulatePayment("FAILURE")}
              className="w-full py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition-colors"
            >
              ❌ Simuler un Échec de Paiement (Solde insuffisant)
            </button>
          </div>

          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-xs">
            🛡️ <strong>Garantie KOLI Protect :</strong> Les fonds restent sous séquestre jusqu'à la livraison effective et la saisie du code OTP.
          </div>
        </div>
      </div>
    </div>
  );
}
