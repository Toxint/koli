"use client";

import { useState } from "react";
import { validateDeliveryOtpAction } from "@/lib/deliveries/actions";

interface ValidateOtpModalProps {
  deliveryId: string;
  orderReference: string;
  buyerName: string;
  isDelivered?: boolean;
}

/**
 * Le code OTP n'est volontairement PAS transmis a ce composant : il n'appartient
 * qu'au client (§27). Le livreur doit le lui demander de vive voix — c'est ce
 * qui fait de l'OTP une preuve de remise (§28).
 */
export function ValidateOtpModal({
  deliveryId,
  orderReference,
  buyerName,
  isDelivered = false,
}: ValidateOtpModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleOpen = () => {
    setIsOpen(true);
    setError(null);
    setSuccessMsg(null);
  };

  const handleClose = () => {
    setIsOpen(false);
    setOtpInput("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await validateDeliveryOtpAction(deliveryId, otpInput);
      if (res.success) {
        setSuccessMsg(res.message || "Livraison validée avec succès !");
        setTimeout(() => {
          handleClose();
        }, 3000);
      } else {
        setError(res.error || "Code OTP invalide.");
      }
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  if (isDelivered) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        <span>Colis remis — en attente de confirmation du client</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-extrabold text-xs uppercase tracking-wider shadow-md shadow-amber-500/20 hover:shadow-amber-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 border border-amber-300/50 cursor-pointer"
      >
        <span className="text-sm">🔑</span>
        <span>Valider la Livraison (Code OTP)</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-amber-400/40 dark:border-amber-500/30 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl shadow-amber-500/10 space-y-6 relative overflow-hidden">
            {/* Top Golden Sheen Header */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-600" />

            <div className="flex justify-between items-center">
              <div>
                <span className="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-widest block">
                  Confirmation de Livraison
                </span>
                <h3 className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                  Code OTP du Client
                </h3>
              </div>
              <button
                onClick={handleClose}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg p-1 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Demandez au client <strong className="text-slate-900 dark:text-white">{buyerName}</strong> le code OTP reçu lors de sa commande (<strong className="font-mono text-amber-600 dark:text-amber-400">{orderReference}</strong>).
            </p>

            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-medium flex items-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs font-bold space-y-1 text-center animate-gold-pulse">
                <div className="text-2xl">🎉</div>
                <p>{successMsg}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Saisir le Code à 4 chiffres
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  placeholder="••••"
                  className="w-full px-4 py-3.5 rounded-2xl border-2 border-amber-300 dark:border-amber-500/50 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-center text-2xl font-black tracking-[0.3em] focus:outline-none focus:ring-4 focus:ring-amber-500/30 focus:border-amber-500 transition-all placeholder:text-slate-400 placeholder:tracking-normal placeholder:text-sm"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-1/3 py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading || !!successMsg}
                  className="w-2/3 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-slate-950" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Validation...</span>
                    </>
                  ) : (
                    "Valider la livraison"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
