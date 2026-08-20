"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  creerProduitAction,
  modifierProduitAction,
} from "@/lib/products/actions";

export interface ProduitInitial {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  quantity: number;
  weightKg: number | null;
  imageUrl: string | null;
}

const CHAMP =
  "w-full min-h-[48px] px-4 rounded-xl border border-hairline bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand";

/** Catégories courantes du commerce social africain (§16). */
const CATEGORIES = [
  "Mode et vêtements",
  "Chaussures",
  "Beauté et cosmétiques",
  "Électronique",
  "Téléphonie et accessoires",
  "Maison et décoration",
  "Alimentation",
  "Bijoux et accessoires",
  "Enfants et bébés",
  "Autre",
];

export function FormulaireProduit({
  initial,
}: {
  initial?: ProduitInitial;
}) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState(false);

  const enregistrer = async (formData: FormData) => {
    setEnCours(true);
    setErreur(null);
    setChamps({});

    const res = initial
      ? await modifierProduitAction(initial.id, formData)
      : await creerProduitAction(formData);

    if (res.success) {
      router.push("/vendeur/produits");
      router.refresh();
      return;
    }

    setErreur(res.error);
    setChamps(res.fieldErrors ?? {});
    setEnCours(false);
  };

  const aide = (nom: string) =>
    champs[nom] ? (
      <p role="alert" className="mt-1 text-xs text-danger font-medium">
        {champs[nom]}
      </p>
    ) : null;

  return (
    <form action={enregistrer} className="space-y-5">
      {erreur && (
        <p
          role="alert"
          className="p-3 rounded-xl bg-red-50 text-danger text-sm font-medium"
        >
          {erreur}
        </p>
      )}

      <div>
        <label htmlFor="name" className="block text-xs font-semibold mb-1.5">
          Nom du produit
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={120}
          defaultValue={initial?.name ?? ""}
          placeholder="Robe wax taille M"
          className={CHAMP}
        />
        {aide("name")}
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-xs font-semibold mb-1.5"
        >
          Description <span className="text-ink-muted font-normal">(optionnel)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={600}
          defaultValue={initial?.description ?? ""}
          placeholder="Matière, coloris, taille, particularités…"
          className={`${CHAMP} py-3 min-h-[96px] resize-y`}
        />
        {aide("description")}
      </div>

      <div>
        <label htmlFor="category" className="block text-xs font-semibold mb-1.5">
          Catégorie <span className="text-ink-muted font-normal">(optionnel)</span>
        </label>
        <select
          id="category"
          name="category"
          defaultValue={initial?.category ?? ""}
          className={CHAMP}
        >
          <option value="">— Choisir —</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {aide("category")}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="price" className="block text-xs font-semibold mb-1.5">
            Prix unitaire (FCFA)
          </label>
          {/* inputMode numeric : sur telephone, ouvre le pave numerique sans
              les fleches de type="number" qui font varier le prix par erreur. */}
          <input
            id="price"
            name="price"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            required
            defaultValue={initial?.price ?? ""}
            placeholder="15000"
            className={CHAMP}
          />
          {aide("price")}
        </div>

        <div>
          <label
            htmlFor="quantity"
            className="block text-xs font-semibold mb-1.5"
          >
            Quantité en stock
          </label>
          <input
            id="quantity"
            name="quantity"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            required
            defaultValue={initial?.quantity ?? "0"}
            aria-describedby="aide-stock"
            className={CHAMP}
          />
          <p id="aide-stock" className="mt-1 text-xs text-ink-muted">
            Un stock à 0 rend le produit indisponible à la commande.
          </p>
          {aide("quantity")}
        </div>
      </div>

      <div>
        <label htmlFor="weightKg" className="block text-xs font-semibold mb-1.5">
          Poids en kg{" "}
          <span className="text-ink-muted font-normal">(optionnel)</span>
        </label>
        <input
          id="weightKg"
          name="weightKg"
          type="text"
          inputMode="decimal"
          defaultValue={initial?.weightKg ?? ""}
          placeholder="0.8"
          aria-describedby="aide-poids"
          className={CHAMP}
        />
        <p id="aide-poids" className="mt-1 text-xs text-ink-muted">
          Aide le livreur à choisir son moyen de transport.
        </p>
        {aide("weightKg")}
      </div>

      {!initial && (
        <div>
          <label
            htmlFor="imageUrl"
            className="block text-xs font-semibold mb-1.5"
          >
            Photo du produit{" "}
            <span className="text-ink-muted font-normal">(optionnel)</span>
          </label>
          <input
            id="imageUrl"
            name="imageUrl"
            type="url"
            defaultValue=""
            placeholder="https://…"
            aria-describedby="aide-photo"
            className={CHAMP}
          />
          <p id="aide-photo" className="mt-1 text-xs text-ink-muted">
            Collez pour l&apos;instant le lien d&apos;une image déjà en ligne.
            L&apos;envoi de photos depuis le téléphone arrive avec l&apos;espace
            de stockage.
          </p>
          {aide("imageUrl")}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="submit"
          disabled={enCours}
          className="min-h-[48px] px-6 rounded-2xl bg-brand hover:bg-brand-strong text-white font-semibold text-sm transition-colors disabled:opacity-50"
        >
          {enCours
            ? "Enregistrement…"
            : initial
              ? "Enregistrer les modifications"
              : "Ajouter au catalogue"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/vendeur/produits")}
          className="min-h-[48px] px-6 rounded-2xl border border-hairline hover:bg-brand-soft font-semibold text-sm transition-colors"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
