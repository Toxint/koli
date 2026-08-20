"use client";

import { useState } from "react";
import Link from "next/link";
import { createOrderAction } from "@/lib/orders/actions";
import { formatCFA } from "@/lib/format";
import { markets } from "@/data/markets";

export default function NewOrderPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdReference, setCreatedReference] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [erreurCopie, setErreurCopie] = useState(false);

  // Form states
  const [productName, setProductName] = useState("Robe Wax Traditionnelle");
  const [unitPrice, setUnitPrice] = useState<number>(18500);
  const [quantity, setQuantity] = useState<number>(1);
  const [deliveryFee, setDeliveryFee] = useState<number>(2000);

  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerCountry, setBuyerCountry] = useState("Côte d'Ivoire");
  const [buyerCity, setBuyerCity] = useState("Abidjan");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerLandmark, setBuyerLandmark] = useState("");

  const subtotal = unitPrice * quantity;
  const grandTotal = subtotal + deliveryFee;

  // Base du lien de paiement partage au client. Configuree explicitement
  // (NEXT_PUBLIC_APP_URL) plutot que deduite de window dans un effet : ainsi le
  // lien est correct des le premier rendu, y compris cote serveur.
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("productName", productName);
    formData.append("unitPrice", unitPrice.toString());
    formData.append("quantity", quantity.toString());
    formData.append("deliveryFee", deliveryFee.toString());

    formData.append("buyerName", buyerName);
    formData.append("buyerPhone", buyerPhone);
    formData.append("buyerCountry", buyerCountry);
    formData.append("buyerCity", buyerCity);
    formData.append("buyerAddress", buyerAddress);
    formData.append("buyerLandmark", buyerLandmark);

    try {
      const res = await createOrderAction(formData);
      if (res.success && res.reference) {
        setCreatedReference(res.reference);
      } else {
        setError(res.error || "Erreur lors de la création de la commande.");
      }
    } catch {
      setError("Une erreur réseau s'est produite. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  const shareUrl = createdReference
    ? `${origin || "http://localhost:3000"}/pay/${createdReference}`
    : "";

  /**
   * `navigator.clipboard` est indisponible hors contexte securise — typiquement
   * en http://192.168.x.x, c'est-a-dire exactement la facon dont on teste
   * l'application depuis un telephone sur le reseau local. L'ancien code
   * appelait l'API sans verification et affichait un `alert()` de succes qui
   * mentait : rien n'avait ete copie.
   */
  const handleCopierLien = async () => {
    setErreurCopie(false);
    try {
      if (!navigator.clipboard) throw new Error("presse-papiers indisponible");
      await navigator.clipboard.writeText(shareUrl);
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      setErreurCopie(true);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-brand dark:text-white py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* §75 : cette page affiche des montants et n'avait aucun indicateur de
            mode test — elle est la seule page connectée sans en-tête KOLI. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Link
            href="/vendeur/dashboard"
            className="inline-flex items-center min-h-[44px] gap-1.5 text-xs font-bold text-ink-muted hover:text-brand dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            ← Retour au tableau de bord
          </Link>
          <span className="px-3 py-1 rounded-full bg-test-mode-surface dark:bg-amber-950/80 text-test-mode dark:text-amber-300 text-[11px] font-semibold border border-brand-border/60 dark:border-amber-700 whitespace-nowrap">
            ⚡ Mode test — aucun paiement réel
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-hairline dark:border-slate-800 p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Créer une nouvelle commande
            </h1>
            <p className="text-xs text-ink-muted dark:text-slate-400 mt-1">
              Renseignez les détails du produit et du client pour générer instantanément un lien de paiement sécurisé.
            </p>
          </div>

          {error && (
            <div role="alert" className="p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {createdReference ? (
            /* Success Modal / Display */
            <div className="bg-brand-soft dark:bg-emerald-950/40 border-2 border-brand-border rounded-2xl p-6 sm:p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mx-auto text-2xl shadow-lg shadow-emerald-500/30">
                ✅
              </div>
              <h2 className="text-xl font-semibold dark:text-emerald-200">
                Commande {createdReference} créée avec succès !
              </h2>
              <p className="text-xs text-ink-muted dark:text-slate-300 max-w-md mx-auto">
                Partagez ce lien à votre client sur WhatsApp, TikTok ou Facebook pour recevoir le paiement sécurisé.
              </p>

              <div className="bg-white dark:bg-slate-900 border border-brand-border dark:border-emerald-700 p-3 rounded-xl space-y-2 max-w-lg mx-auto">
                {/* `break-all` plutot que `truncate` : le vendeur doit pouvoir
                    LIRE le lien, notamment si la copie echoue. */}
                <span className="block text-xs font-mono text-brand dark:text-slate-200 break-all select-all text-left">
                  {shareUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopierLien}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-brand text-white font-bold text-xs hover:bg-brand-strong transition-colors"
                >
                  {copie ? "✓ Lien copié" : "Copier le lien 📋"}
                </button>
                {erreurCopie && (
                  <p role="alert" className="text-xs text-brand dark:text-amber-400">
                    La copie automatique n&apos;est pas disponible ici.
                    Sélectionnez le lien ci-dessus pour le copier manuellement.
                  </p>
                )}
              </div>

              <div className="max-w-lg mx-auto">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Voici le lien de paiement sécurisé KOLI pour votre commande : ${shareUrl}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-full min-h-[48px] px-4 rounded-xl bg-[#25D366] text-white font-bold text-xs transition-opacity hover:opacity-90"
                >
                  Partager sur WhatsApp
                </a>
              </div>

              <div className="pt-4 flex flex-wrap justify-center gap-3">
                <Link
                  href={`/pay/${createdReference}`}
                  target="_blank"
                  className="px-5 py-2.5 rounded-xl bg-brand text-white font-bold text-xs shadow-md hover:shadow-lg transition-all"
                >
                  Ouvrir la page de paiement 🔗
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setCreatedReference(null);
                    setBuyerName("");
                    setBuyerPhone("");
                    setBuyerAddress("");
                    setBuyerLandmark("");
                  }}
                  className="px-5 py-2.5 rounded-xl border border-hairline dark:border-slate-700 text-brand dark:text-slate-300 font-semibold text-xs hover:bg-white dark:hover:bg-slate-800 transition-colors"
                >
                  + Créer une autre commande
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Product Info Section */}
              <div className="space-y-4 border-b border-slate-100 dark:border-slate-800 pb-6">
                <h2 className="text-xs font-bold uppercase tracking-wider dark:text-emerald-400">
                  1. Informations du Produit / Service
                </h2>

                <div>
                  <label htmlFor="productName" className="block text-xs font-semibold text-brand dark:text-slate-300 mb-1">
                    Nom de l&apos;article / Produit
                  </label>
                  <input
                    id="productName"
                    type="text"
                    required
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Ex: Robe Wax Traditionnelle"
                    className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="unitPrice" className="block text-xs font-semibold text-brand dark:text-slate-300 mb-1">
                      Prix Unitaire (FCFA)
                    </label>
                    <input
                    id="unitPrice"
                      type="number"
                      required
                      min={100}
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="quantity" className="block text-xs font-semibold text-brand dark:text-slate-300 mb-1">
                      Quantité
                    </label>
                    <input
                    id="quantity"
                      type="number"
                      required
                      min={1}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="deliveryFee" className="block text-xs font-semibold text-brand dark:text-slate-300 mb-1">
                      Frais de Livraison (FCFA)
                    </label>
                    <input
                    id="deliveryFee"
                      type="number"
                      required
                      min={0}
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Customer Info Section */}
              <div className="space-y-4 border-b border-slate-100 dark:border-slate-800 pb-6">
                <h2 className="text-xs font-bold uppercase tracking-wider dark:text-emerald-400">
                  2. Informations du Client Destinataire
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="buyerName" className="block text-xs font-semibold text-brand dark:text-slate-300 mb-1">
                      Nom complet du Client
                    </label>
                    <input
                    id="buyerName"
                      type="text"
                      required
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="Ex: Awa Koné"
                      className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="buyerPhone" className="block text-xs font-semibold text-brand dark:text-slate-300 mb-1">
                      Numéro de Téléphone Client
                    </label>
                    <input
                    id="buyerPhone"
                      type="tel"
                      required
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="Ex: +225 05 05 05 05 05"
                      className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="buyerCountry"
                      className="block text-xs font-semibold text-brand dark:text-slate-300 mb-1"
                    >
                      Pays
                    </label>
                    {/* Liste tiree de data/markets.ts : elle etait dupliquee en
                        dur ici, au risque de diverger de la source qui porte
                        aussi la zone monetaire. */}
                    <select
                      id="buyerCountry"
                      value={buyerCountry}
                      onChange={(e) => setBuyerCountry(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white text-sm"
                    >
                      {markets.map((marche) => (
                        <option key={marche.code} value={marche.name}>
                          {marche.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="buyerCity" className="block text-xs font-semibold text-brand dark:text-slate-300 mb-1">
                      Ville
                    </label>
                    <input
                    id="buyerCity"
                      type="text"
                      required
                      value={buyerCity}
                      onChange={(e) => setBuyerCity(e.target.value)}
                      placeholder="Ex: Abidjan"
                      className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="buyerAddress" className="block text-xs font-semibold text-brand dark:text-slate-300 mb-1">
                    Adresse / Quartier de livraison
                  </label>
                  <input
                    id="buyerAddress"
                    type="text"
                    required
                    value={buyerAddress}
                    onChange={(e) => setBuyerAddress(e.target.value)}
                    placeholder="Ex: Cocody Angré 8ème Tranche"
                    className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="buyerLandmark" className="block text-xs font-semibold text-brand dark:text-slate-300 mb-1">
                    Repère de livraison <span className="text-ink-muted font-normal">(optionnel)</span>
                  </label>
                  <input
                    id="buyerLandmark"
                    type="text"
                    value={buyerLandmark}
                    onChange={(e) => setBuyerLandmark(e.target.value)}
                    placeholder="Ex: Près de la pharmacie du Soleil"
                    className="w-full px-4 py-3 rounded-xl border border-hairline dark:border-slate-700 bg-white dark:bg-slate-800 text-brand dark:text-white text-sm"
                  />
                </div>
              </div>

              {/* Total Calculation Card */}
              <div className="bg-white dark:bg-slate-800/60 rounded-xl p-4 flex justify-between items-center">
                <div>
                  <span className="text-xs text-ink-muted block">Total estimé de la commande</span>
                  <span className="text-xs text-ink-muted">
                    {formatCFA(subtotal)} + {formatCFA(deliveryFee)} (livraison)
                  </span>
                </div>
                <div className="text-xl font-bold text-brand dark:text-amber-400">
                  {formatCFA(grandTotal)}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 px-4 rounded-2xl bg-brand hover:bg-brand-strong text-white font-semibold text-xs uppercase tracking-wider shadow-lg shadow-brand/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer border border-brand-border/60"
              >
                {loading ? (
                  <span>Génération du lien en cours...</span>
                ) : (
                  "✨ Générer le lien de paiement KOLI (Or Doré)"
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
