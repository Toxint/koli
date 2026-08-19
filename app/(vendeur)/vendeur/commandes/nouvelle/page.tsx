"use client";

import { useState } from "react";
import Link from "next/link";
import { createOrderAction } from "@/lib/orders/actions";
import { formatCFA } from "@/lib/format";

export default function NewOrderPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdReference, setCreatedReference] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/vendeur/dashboard"
            className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1.5 transition-colors"
          >
            ← Retour au Tableau de bord
          </Link>
          <span className="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-semibold">
            Génération de Lien KOLI
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none space-y-6">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Créer une nouvelle commande
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Renseignez les détails du produit et du client pour générer instantanément un lien de paiement sécurisé.
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {createdReference ? (
            /* Success Modal / Display */
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500 rounded-2xl p-6 sm:p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mx-auto text-2xl shadow-lg shadow-emerald-500/30">
                ✅
              </div>
              <h2 className="text-xl font-extrabold text-emerald-950 dark:text-emerald-200">
                Commande {createdReference} créée avec succès !
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto">
                Partagez ce lien à votre client sur WhatsApp, TikTok ou Facebook pour recevoir le paiement sécurisé.
              </p>

              <div className="bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 p-3 rounded-xl flex items-center justify-between gap-2 max-w-lg mx-auto">
                <span className="text-xs font-mono text-slate-800 dark:text-slate-200 truncate select-all">
                  {shareUrl}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    alert("Lien copié dans le presse-papier !");
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors shrink-0"
                >
                  Copier 📋
                </button>
              </div>

              <div className="pt-4 flex flex-wrap justify-center gap-3">
                <Link
                  href={`/pay/${createdReference}`}
                  target="_blank"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all"
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
                  className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  + Créer une autre commande
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Product Info Section */}
              <div className="space-y-4 border-b border-slate-100 dark:border-slate-800 pb-6">
                <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  1. Informations du Produit / Service
                </h2>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nom de l&apos;article / Produit
                  </label>
                  <input
                    type="text"
                    required
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Ex: Robe Wax Traditionnelle"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Prix Unitaire (FCFA)
                    </label>
                    <input
                      type="number"
                      required
                      min={100}
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Quantité
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Frais de Livraison (FCFA)
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Customer Info Section */}
              <div className="space-y-4 border-b border-slate-100 dark:border-slate-800 pb-6">
                <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  2. Informations du Client Destinataire
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nom complet du Client
                    </label>
                    <input
                      type="text"
                      required
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="Ex: Awa Koné"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Numéro de Téléphone Client
                    </label>
                    <input
                      type="tel"
                      required
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="Ex: +225 05 05 05 05 05"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Pays
                    </label>
                    <select
                      value={buyerCountry}
                      onChange={(e) => setBuyerCountry(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                    >
                      <option value="Côte d'Ivoire">Côte d&apos;Ivoire</option>
                      <option value="Sénégal">Sénégal</option>
                      <option value="Cameroun">Cameroun</option>
                      <option value="Bénin">Bénin</option>
                      <option value="Togo">Togo</option>
                      <option value="Mali">Mali</option>
                      <option value="Burkina Faso">Burkina Faso</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Ville
                    </label>
                    <input
                      type="text"
                      required
                      value={buyerCity}
                      onChange={(e) => setBuyerCity(e.target.value)}
                      placeholder="Ex: Abidjan"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Adresse / Quartier de livraison
                  </label>
                  <input
                    type="text"
                    required
                    value={buyerAddress}
                    onChange={(e) => setBuyerAddress(e.target.value)}
                    placeholder="Ex: Cocody Angré 8ème Tranche"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Repère de livraison <span className="text-slate-400 font-normal">(optionnel)</span>
                  </label>
                  <input
                    type="text"
                    value={buyerLandmark}
                    onChange={(e) => setBuyerLandmark(e.target.value)}
                    placeholder="Ex: Près de la pharmacie du Soleil"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
              </div>

              {/* Total Calculation Card */}
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 flex justify-between items-center">
                <div>
                  <span className="text-xs text-slate-400 block">Total estimé de la commande</span>
                  <span className="text-xs text-slate-500">
                    {formatCFA(subtotal)} + {formatCFA(deliveryFee)} (livraison)
                  </span>
                </div>
                <div className="text-xl font-black text-amber-600 dark:text-amber-400">
                  {formatCFA(grandTotal)}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer border border-amber-300/60"
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
