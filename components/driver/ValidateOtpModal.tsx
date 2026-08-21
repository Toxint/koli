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
      <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-brand-soft dark:bg-emerald-950/80 border border-brand-border dark:border-emerald-700 text-brand dark:text-emerald-300 text-xs font-bold">
        <svg
          className="w-4 h-4 shrink-0 mt-0.5"
          aria-hidden="true"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
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
        className="w-full sm:w-auto min-h-[48px] px-4 rounded-xl bg-brand hover:bg-brand-strong text-white font-semibold text-xs uppercase tracking-wider shadow-md shadow-brand/25 hover:shadow-brand/40 transition-all flex items-center justify-center gap-2 border border-brand-border/50 cursor-pointer"
      >
        <span className="text-sm">🔑</span>
        <span>Valider la Livraison (Code OTP)</span>
      </button>

      {isOpen && (
        /* `overflow-y-auto` + `items-start` : sans cela, l'ouverture du pave
           numerique du telephone poussait le champ de saisie et le bouton de
           validation sous le clavier, sans aucun moyen de faire defiler. */
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titre-modale-otp"
          onKeyDown={(e) => {
            if (e.key === "Escape") handleClose();
          }}
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto bg-ink/60 animate-fade-in"
        >
          <div className="bg-white dark:bg-slate-900 border border-white/30 dark:border-amber-500/30 rounded-3xl p-6 sm:p-8 max-w-md w-full my-auto shadow-2xl shadow-brand/20 space-y-6 relative overflow-hidden">
            {/* Top Golden Sheen Header */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-brand" />

            <div className="flex justify-between items-center">
              <div>
                <span className="text-[11px] font-semibold text-brand dark:text-amber-400 uppercase tracking-widest block">
                  Confirmation de Livraison
                </span>
                <h3
                  id="titre-modale-otp"
                  className="text-xl font-bold dark:text-white mt-0.5"
                >
                  Code de réception
                </h3>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Fermer"
                className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-ink-muted hover:text-brand dark:text-slate-300 dark:hover:text-white text-lg rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-ink-muted dark:text-slate-300">
              Demandez au client <strong className="text-brand dark:text-white">{buyerName}</strong> le code reçu lors de sa commande (<strong className="font-mono text-brand dark:text-amber-400 break-all">{orderReference}</strong>).
            </p>

            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-medium flex items-center gap-2"
              >
                <span aria-hidden="true">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-4 rounded-2xl bg-brand-soft dark:bg-amber-950/80 border border-brand-border dark:border-amber-700 text-brand dark:text-amber-200 text-xs font-bold space-y-1 text-center animate-gold-pulse">
                <div className="text-2xl">🎉</div>
                <p>{successMsg}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="champ-otp"
                  className="block text-xs font-bold text-brand dark:text-slate-300 uppercase tracking-wider mb-2"
                >
                  Saisir le code à 4 chiffres
                </label>
                <input
                  id="champ-otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={4}
                  required
                  value={otpInput}
                  onChange={(e) =>
                    setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="••••"
                  className="w-full px-4 py-3.5 rounded-2xl border-2 border-brand-border dark:border-amber-500/50 bg-white dark:bg-slate-800 text-brand dark:text-white font-mono text-center text-2xl font-bold tracking-[0.3em] focus:outline-none focus:ring-4 focus:ring-amber-500/30 focus:border-amber-500 transition-all placeholder:text-ink-muted placeholder:tracking-normal placeholder:text-sm"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 min-h-[48px] px-4 rounded-xl border border-hairline dark:border-slate-700 text-brand dark:text-slate-300 font-bold text-xs hover:bg-brand-soft dark:hover:bg-slate-800 transition-all"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading || !!successMsg}
                  className="flex-[2] min-h-[48px] px-4 rounded-xl bg-brand hover:bg-brand-strong text-white font-semibold text-xs uppercase tracking-wider shadow-lg shadow-brand/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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
