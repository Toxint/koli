"use client";

import { useState } from "react";
import Link from "next/link";
import { createOrderAction } from "@/lib/orders/actions";
import { formatCFA } from "@/lib/format";
import { markets } from "@/data/markets";

export interface ProduitCatalogue {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

const SAISIE_LIBRE = "";

/** §18 — les cinq étapes imposées par le cahier des charges. */
const ETAPES = [
  { numero: 1, titre: "Produit" },
  { numero: 2, titre: "Client" },
  { numero: 3, titre: "Livraison" },
  { numero: 4, titre: "Résumé" },
  { numero: 5, titre: "Lien de paiement" },
] as const;

const CHAMP =
  "w-full px-4 py-3 rounded-xl border border-hairline bg-white text-ink placeholder-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-brand text-sm";

/**
 * Fil d'étapes.
 *
 * Barres numérotées et non libellés côte à côte : à 320px, cinq libellés ne
 * tiennent pas et se chevauchaient. Le libellé de l'étape en cours est affiché
 * seul, en dessous ; les lecteurs d'écran reçoivent le détail complet.
 */
function Indicateur({ etape }: { etape: number }) {
  const courante = ETAPES.find((e) => e.numero === etape);

  return (
    <div>
      <ol className="flex items-center gap-1.5" aria-label="Progression">
        {ETAPES.map((e) => {
          const faite = e.numero < etape;
          const active = e.numero === etape;
          return (
            <li key={e.numero} className="flex-1">
              <span
                aria-current={active ? "step" : undefined}
                className={`block h-1.5 rounded-full ${
                  faite || active ? "bg-brand" : "bg-hairline"
                }`}
              />
              <span className="sr-only">
                {`Étape ${e.numero} sur ${ETAPES.length} : ${e.titre}${
                  faite ? " (terminée)" : ""
                }`}
              </span>
            </li>
          );
        })}
      </ol>
      {/* `aria-hidden` : la liste ci-dessus porte déjà l'information complète
          pour les lecteurs d'écran. Sans cela, la progression serait annoncée
          deux fois de suite. */}
      <p aria-hidden="true" className="mt-2 text-xs text-ink-muted">
        Étape {etape} sur {ETAPES.length} — <strong>{courante?.titre}</strong>
      </p>
    </div>
  );
}

function LigneResume({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-xs text-ink-muted shrink-0">{libelle}</dt>
      <dd className="text-sm font-medium text-right break-words min-w-0">
        {valeur}
      </dd>
    </div>
  );
}

export function FormulaireCommande({
  produits,
}: {
  produits: ProduitCatalogue[];
}) {
  const [etape, setEtape] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdReference, setCreatedReference] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [erreurCopie, setErreurCopie] = useState(false);

  // Produit : issu du catalogue (§16) ou saisi librement pour une vente
  // ponctuelle. Les champs démarrent vides — les valeurs de démonstration
  // pré-remplies faisaient partir de vraies commandes avec un nom fictif.
  const [productId, setProductId] = useState<string>(SAISIE_LIBRE);
  const [productName, setProductName] = useState("");
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(1);
  const [deliveryFee, setDeliveryFee] = useState<number>(0);

  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerCountry, setBuyerCountry] = useState("Côte d'Ivoire");
  const [buyerCity, setBuyerCity] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerLandmark, setBuyerLandmark] = useState("");

  const produitChoisi = produits.find((p) => p.id === productId) ?? null;

  const subtotal = unitPrice * quantity;
  const grandTotal = subtotal + deliveryFee;

  const choisirProduit = (id: string) => {
    setProductId(id);
    const p = produits.find((x) => x.id === id);
    if (p) {
      setProductName(p.name);
      setUnitPrice(p.price);
      if (quantity > p.quantity) setQuantity(Math.max(1, p.quantity));
    } else {
      setProductName("");
      setUnitPrice(0);
    }
  };

  /**
   * Contrôle de l'étape courante avant de passer à la suivante.
   *
   * Sans lui, le vendeur atteindrait le résumé avec des champs vides et
   * n'apprendrait qu'à la toute fin, après avoir tout saisi, que le numéro du
   * client est invalide.
   */
  const erreurEtape = (n: number): string | null => {
    if (n === 1) {
      if (productName.trim().length < 2) return "Indiquez le nom de l'article.";
      if (!Number.isInteger(unitPrice) || unitPrice < 100)
        return "Le prix unitaire doit être d'au moins 100 FCFA.";
      if (!Number.isInteger(quantity) || quantity < 1)
        return "La quantité doit être d'au moins 1.";
      if (produitChoisi && quantity > produitChoisi.quantity)
        return `Stock insuffisant : il reste ${produitChoisi.quantity} unité(s).`;
    }
    if (n === 2) {
      if (buyerName.trim().length < 2)
        return "Indiquez le nom complet du client.";
      if (buyerPhone.replace(/\D/g, "").length < 8)
        return "Le numéro de téléphone du client est invalide.";
      if (
        buyerEmail.trim() &&
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail.trim())
      )
        return "L'adresse e-mail du client est invalide.";
      if (buyerCity.trim().length < 2) return "Indiquez la ville de livraison.";
      if (buyerAddress.trim().length < 3)
        return "Indiquez l'adresse de livraison.";
    }
    if (n === 3) {
      if (!Number.isInteger(deliveryFee) || deliveryFee < 0)
        return "Les frais de livraison doivent être un nombre entier positif.";
    }
    return null;
  };

  const suivant = () => {
    const probleme = erreurEtape(etape);
    if (probleme) {
      setError(probleme);
      return;
    }
    setError(null);
    setEtape((e) => Math.min(e + 1, ETAPES.length));
  };

  const precedent = () => {
    setError(null);
    setEtape((e) => Math.max(e - 1, 1));
  };

  // Base du lien de paiement partagé au client. Configurée explicitement
  // (NEXT_PUBLIC_APP_URL) plutôt que déduite de window dans un effet : ainsi le
  // lien est correct dès le premier rendu, y compris côté serveur.
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const creer = async () => {
    // Dernier filet : on rejoue les contrôles de toutes les étapes. Revenir en
    // arrière puis vider un champ contournerait autrement la validation.
    for (const e of [1, 2, 3]) {
      const probleme = erreurEtape(e);
      if (probleme) {
        setError(probleme);
        setEtape(e);
        return;
      }
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    if (productId) formData.append("productId", productId);
    formData.append("productName", productName);
    formData.append("unitPrice", unitPrice.toString());
    formData.append("quantity", quantity.toString());
    formData.append("deliveryFee", deliveryFee.toString());

    formData.append("buyerName", buyerName);
    formData.append("buyerPhone", buyerPhone);
    formData.append("buyerEmail", buyerEmail);
    formData.append("buyerCountry", buyerCountry);
    formData.append("buyerCity", buyerCity);
    formData.append("buyerAddress", buyerAddress);
    formData.append("buyerLandmark", buyerLandmark);

    try {
      const res = await createOrderAction(formData);
      if (res.success && res.reference) {
        setCreatedReference(res.reference);
        setEtape(5);
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
   * `navigator.clipboard` est indisponible hors contexte sécurisé — typiquement
   * en http://192.168.x.x, c'est-à-dire exactement la façon dont on teste
   * l'application depuis un téléphone sur le réseau local. L'ancien code
   * appelait l'API sans vérification et affichait un `alert()` de succès qui
   * mentait : rien n'avait été copié.
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

  const recommencer = () => {
    setCreatedReference(null);
    setBuyerName("");
    setBuyerPhone("");
    setBuyerEmail("");
    setBuyerCity("");
    setBuyerAddress("");
    setBuyerLandmark("");
    setEtape(1);
  };

  return (
    <div className="min-h-screen bg-cream text-ink py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* §75 : cette page affiche des montants et n'avait aucun indicateur de
            mode test — elle est la seule page connectée sans en-tête KOLI. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Link
            href="/vendeur/dashboard"
            className="inline-flex items-center min-h-[44px] gap-1.5 text-xs font-bold text-ink-muted hover:text-brand"
          >
            ← Retour au tableau de bord
          </Link>
          <span className="px-3 py-1 rounded-full bg-test-mode-surface text-test-mode text-[11px] font-semibold border border-brand-border/60 whitespace-nowrap">
            ⚡ Mode test — aucun paiement réel
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-hairline p-6 sm:p-8 shadow-xl shadow-slate-200/50 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Créer une nouvelle commande
            </h1>
            <p className="text-xs text-ink-muted mt-1">
              Cinq étapes courtes ; le lien de paiement est généré à la fin.
            </p>
          </div>

          <Indicateur etape={etape} />

          {error && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm"
            >
              {error}
            </div>
          )}

          {/* ─────────────────────────── Étape 1 — Produit */}
          {etape === 1 && (
            <div className="space-y-4">
              {produits.length > 0 && (
                <div>
                  <label
                    htmlFor="productId"
                    className="block text-xs font-semibold mb-1"
                  >
                    Choisir dans mon catalogue
                  </label>
                  <select
                    id="productId"
                    value={productId}
                    onChange={(e) => choisirProduit(e.target.value)}
                    className={CHAMP}
                  >
                    <option value={SAISIE_LIBRE}>
                      — Autre produit (saisie libre) —
                    </option>
                    {produits.map((p) => (
                      <option
                        key={p.id}
                        value={p.id}
                        disabled={p.quantity === 0}
                      >
                        {p.name} — {formatCFA(p.price)}
                        {p.quantity === 0
                          ? " (rupture)"
                          : ` (stock : ${p.quantity})`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label
                  htmlFor="productName"
                  className="block text-xs font-semibold mb-1"
                >
                  Nom de l&apos;article
                </label>
                <input
                  id="productName"
                  type="text"
                  required
                  readOnly={produitChoisi !== null}
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Ex : Robe wax taille M"
                  className={`${CHAMP} ${produitChoisi ? "bg-brand-soft/50 text-ink-muted" : ""}`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="unitPrice"
                    className="block text-xs font-semibold mb-1"
                  >
                    Prix unitaire (FCFA)
                  </label>
                  {/* Le prix d'un produit du catalogue ne se modifie qu'au
                      catalogue : c'est ce qui évite que deux commandes du même
                      article partent à deux prix différents. */}
                  <input
                    id="unitPrice"
                    type="number"
                    required
                    min={100}
                    readOnly={produitChoisi !== null}
                    value={unitPrice || ""}
                    onChange={(e) => setUnitPrice(Number(e.target.value))}
                    aria-describedby={produitChoisi ? "aide-prix" : undefined}
                    className={`${CHAMP} ${produitChoisi ? "bg-brand-soft/50 text-ink-muted" : ""}`}
                  />
                  {produitChoisi && (
                    <p id="aide-prix" className="mt-1 text-xs text-ink-muted">
                      Fixé par le catalogue.
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="quantity"
                    className="block text-xs font-semibold mb-1"
                  >
                    Quantité
                  </label>
                  <input
                    id="quantity"
                    type="number"
                    required
                    min={1}
                    max={produitChoisi ? produitChoisi.quantity : undefined}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    aria-describedby={
                      produitChoisi ? "aide-quantite" : undefined
                    }
                    className={CHAMP}
                  />
                  {produitChoisi && (
                    <p
                      id="aide-quantite"
                      className="mt-1 text-xs text-ink-muted"
                    >
                      Stock disponible : {produitChoisi.quantity}
                    </p>
                  )}
                </div>
              </div>

              {produits.length === 0 && (
                <p className="text-xs text-ink-muted">
                  Votre catalogue est vide.{" "}
                  <Link
                    href="/vendeur/produits/nouveau"
                    className="text-brand font-semibold underline"
                  >
                    Enregistrez vos produits
                  </Link>{" "}
                  pour les sélectionner en un geste à chaque commande.
                </p>
              )}
            </div>
          )}

          {/* ─────────────────────────── Étape 2 — Client */}
          {etape === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="buyerName"
                    className="block text-xs font-semibold mb-1"
                  >
                    Nom complet du client
                  </label>
                  <input
                    id="buyerName"
                    type="text"
                    required
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="Ex : Awa Koné"
                    className={CHAMP}
                  />
                </div>

                <div>
                  <label
                    htmlFor="buyerPhone"
                    className="block text-xs font-semibold mb-1"
                  >
                    Numéro de téléphone
                  </label>
                  <input
                    id="buyerPhone"
                    type="tel"
                    required
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value)}
                    placeholder="Ex : +225 05 05 05 05 05"
                    aria-describedby="aide-telephone-client"
                    className={CHAMP}
                  />
                  <p
                    id="aide-telephone-client"
                    className="mt-1 text-xs text-ink-muted"
                  >
                    Sert au livreur et rattache la commande au compte du client.
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="buyerEmail"
                  className="block text-xs font-semibold mb-1"
                >
                  Email du client{" "}
                  <span className="text-ink-muted font-normal">(optionnel)</span>
                </label>
                <input
                  id="buyerEmail"
                  type="email"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="client@exemple.ci"
                  className={CHAMP}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="buyerCountry"
                    className="block text-xs font-semibold mb-1"
                  >
                    Pays
                  </label>
                  {/* Liste tirée de data/markets.ts : elle était dupliquée en
                      dur ici, au risque de diverger de la source qui porte
                      aussi la zone monétaire. */}
                  <select
                    id="buyerCountry"
                    value={buyerCountry}
                    onChange={(e) => setBuyerCountry(e.target.value)}
                    className={CHAMP}
                  >
                    {markets.map((marche) => (
                      <option key={marche.code} value={marche.name}>
                        {marche.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="buyerCity"
                    className="block text-xs font-semibold mb-1"
                  >
                    Ville
                  </label>
                  <input
                    id="buyerCity"
                    type="text"
                    required
                    value={buyerCity}
                    onChange={(e) => setBuyerCity(e.target.value)}
                    placeholder="Ex : Abidjan"
                    className={CHAMP}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="buyerAddress"
                  className="block text-xs font-semibold mb-1"
                >
                  Adresse / quartier
                </label>
                <input
                  id="buyerAddress"
                  type="text"
                  required
                  value={buyerAddress}
                  onChange={(e) => setBuyerAddress(e.target.value)}
                  placeholder="Ex : Cocody Angré 8ème Tranche"
                  className={CHAMP}
                />
              </div>
            </div>
          )}

          {/* ─────────────────────────── Étape 3 — Livraison */}
          {etape === 3 && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="deliveryFee"
                  className="block text-xs font-semibold mb-1"
                >
                  Frais de livraison (FCFA)
                </label>
                <input
                  id="deliveryFee"
                  type="number"
                  required
                  min={0}
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(Number(e.target.value))}
                  aria-describedby="aide-frais"
                  className={CHAMP}
                />
                <p id="aide-frais" className="mt-1 text-xs text-ink-muted">
                  Réglés par le client en plus du produit. Ils ne font pas
                  partie des fonds qui vous reviennent.
                </p>
              </div>

              <div>
                <label
                  htmlFor="buyerLandmark"
                  className="block text-xs font-semibold mb-1"
                >
                  Repère de livraison{" "}
                  <span className="text-ink-muted font-normal">(optionnel)</span>
                </label>
                <input
                  id="buyerLandmark"
                  type="text"
                  value={buyerLandmark}
                  onChange={(e) => setBuyerLandmark(e.target.value)}
                  placeholder="Ex : Près de la pharmacie du Soleil"
                  aria-describedby="aide-repere"
                  className={CHAMP}
                />
                <p id="aide-repere" className="mt-1 text-xs text-ink-muted">
                  Beaucoup d&apos;adresses ne sont pas numérotées : un repère
                  fait gagner du temps au livreur.
                </p>
              </div>

              <div className="rounded-2xl bg-brand-soft/50 border border-brand-border p-4">
                <p className="text-xs text-ink-muted">
                  Le livreur sera choisi par vos soins une fois le paiement du
                  client sécurisé, depuis la liste de vos commandes.
                </p>
              </div>
            </div>
          )}

          {/* ─────────────────────────── Étape 4 — Résumé */}
          {etape === 4 && (
            <div className="space-y-5">
              <section className="rounded-2xl border border-hairline p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h2 className="text-sm font-semibold">Produit</h2>
                  <button
                    type="button"
                    onClick={() => setEtape(1)}
                    className="min-h-[44px] px-2 text-xs font-semibold text-brand underline"
                  >
                    Modifier
                  </button>
                </div>
                <dl className="divide-y divide-hairline">
                  <LigneResume libelle="Article" valeur={productName} />
                  <LigneResume
                    libelle="Prix unitaire"
                    valeur={formatCFA(unitPrice)}
                  />
                  <LigneResume libelle="Quantité" valeur={String(quantity)} />
                </dl>
              </section>

              <section className="rounded-2xl border border-hairline p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h2 className="text-sm font-semibold">Client</h2>
                  <button
                    type="button"
                    onClick={() => setEtape(2)}
                    className="min-h-[44px] px-2 text-xs font-semibold text-brand underline"
                  >
                    Modifier
                  </button>
                </div>
                <dl className="divide-y divide-hairline">
                  <LigneResume libelle="Nom" valeur={buyerName} />
                  <LigneResume libelle="Téléphone" valeur={buyerPhone} />
                  {buyerEmail.trim() && (
                    <LigneResume libelle="Email" valeur={buyerEmail} />
                  )}
                  <LigneResume
                    libelle="Livraison"
                    valeur={`${buyerAddress}, ${buyerCity} (${buyerCountry})`}
                  />
                </dl>
              </section>

              <section className="rounded-2xl border border-hairline p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h2 className="text-sm font-semibold">Livraison</h2>
                  <button
                    type="button"
                    onClick={() => setEtape(3)}
                    className="min-h-[44px] px-2 text-xs font-semibold text-brand underline"
                  >
                    Modifier
                  </button>
                </div>
                <dl className="divide-y divide-hairline">
                  <LigneResume libelle="Frais" valeur={formatCFA(deliveryFee)} />
                  <LigneResume
                    libelle="Repère"
                    valeur={buyerLandmark.trim() || "—"}
                  />
                </dl>
              </section>

              <div className="rounded-2xl bg-brand text-white p-5">
                {/* Empilé sous 640px : côte à côte, le libellé se coupait en
                    deux lignes face au montant, qui n'en fait qu'une. */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1 sm:gap-4">
                  <span className="text-xs text-white/80">
                    Total réglé par le client
                  </span>
                  <span className="text-2xl font-bold">
                    {formatCFA(grandTotal)}
                  </span>
                </div>
                <p className="text-[11px] text-white/80 mt-1">
                  {formatCFA(subtotal)} d&apos;articles +{" "}
                  {formatCFA(deliveryFee)} de livraison. Vous recevrez{" "}
                  {formatCFA(subtotal)} après confirmation de réception par le
                  client.
                </p>
              </div>
            </div>
          )}

          {/* ─────────────────── Étape 5 — Commande créée, lien de paiement */}
          {etape === 5 && createdReference && (
            <div className="bg-brand-soft border-2 border-brand-border rounded-2xl p-6 sm:p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-brand text-white flex items-center justify-center mx-auto text-2xl">
                ✅
              </div>
              <h2 className="text-xl font-semibold">
                Commande {createdReference} créée
              </h2>
              <p className="text-xs text-ink-muted max-w-md mx-auto">
                Partagez ce lien à votre client sur WhatsApp, TikTok ou Facebook
                pour recevoir le paiement sécurisé.
              </p>

              <div className="bg-white border border-brand-border p-3 rounded-xl space-y-2 max-w-lg mx-auto">
                {/* `break-all` plutôt que `truncate` : le vendeur doit pouvoir
                    LIRE le lien, notamment si la copie échoue. */}
                <span className="block text-xs font-mono break-all select-all text-left">
                  {shareUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopierLien}
                  className="w-full min-h-[44px] px-3 rounded-lg bg-brand text-white font-bold text-xs hover:bg-brand-strong"
                >
                  {copie ? "✓ Lien copié" : "Copier le lien 📋"}
                </button>
                {erreurCopie && (
                  <p role="alert" className="text-xs text-test-mode">
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
                  className="inline-flex items-center justify-center w-full min-h-[48px] px-4 rounded-xl bg-[#25D366] text-white font-bold text-xs hover:opacity-90"
                >
                  Partager sur WhatsApp
                </a>
              </div>

              <div className="pt-4 flex flex-wrap justify-center gap-3">
                <Link
                  href={`/pay/${createdReference}`}
                  target="_blank"
                  className="inline-flex items-center min-h-[44px] px-5 rounded-xl bg-brand text-white font-bold text-xs"
                >
                  Ouvrir la page de paiement 🔗
                </Link>
                <button
                  type="button"
                  onClick={recommencer}
                  className="inline-flex items-center min-h-[44px] px-5 rounded-xl border border-hairline font-semibold text-xs hover:bg-brand-soft/40"
                >
                  + Créer une autre commande
                </button>
              </div>
            </div>
          )}

          {/* ─────────────────────────── Navigation entre étapes */}
          {etape < 5 && (
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-2 border-t border-hairline">
              {etape > 1 ? (
                <button
                  type="button"
                  onClick={precedent}
                  className="min-h-[48px] px-6 rounded-2xl border border-hairline font-semibold text-sm hover:bg-brand-soft/40"
                >
                  ← Précédent
                </button>
              ) : (
                <span className="hidden sm:block" />
              )}

              {etape < 4 ? (
                <button
                  type="button"
                  onClick={suivant}
                  className="min-h-[48px] px-8 rounded-2xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm"
                >
                  Continuer →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={creer}
                  disabled={loading}
                  className="min-h-[48px] px-8 rounded-2xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm disabled:opacity-50"
                >
                  {loading
                    ? "Génération du lien…"
                    : "Créer la commande et générer le lien"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
