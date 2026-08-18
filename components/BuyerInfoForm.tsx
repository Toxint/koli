"use client";

import { useState, type FormEvent } from "react";
import { markets } from "@/data/markets";
import { isValidLocalPhone } from "@/lib/format";
import type { OrderBuyer } from "@/data/orders";

interface BuyerInfoFormProps {
  initialBuyer: OrderBuyer;
  onConfirm: (buyer: OrderBuyer) => void;
  onCancel: () => void;
}

type FieldErrors = Partial<Record<keyof OrderBuyer, string>>;

const inputClasses =
  "w-full min-h-[48px] rounded-xl border border-gray-300 px-4 text-[16px] focus:border-[#0B7C63] focus:outline-none focus:ring-1 focus:ring-[#0B7C63]";

export function BuyerInfoForm({
  initialBuyer,
  onConfirm,
  onCancel,
}: BuyerInfoFormProps) {
  const [buyer, setBuyer] = useState<OrderBuyer>(initialBuyer);
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: FieldErrors = {};

    if (!buyer.name.trim()) {
      nextErrors.name = "Indiquez votre nom complet.";
    }
    if (!isValidLocalPhone(buyer.phone)) {
      nextErrors.phone = "Ce numéro ne semble pas complet. Vérifiez-le.";
    }
    if (!buyer.city.trim()) {
      nextErrors.city = "Indiquez votre ville.";
    }
    if (!buyer.landmark.trim()) {
      nextErrors.landmark =
        "Ajoutez un point de repère pour aider le livreur.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) {
      onConfirm(buyer);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Nom complet
        </label>
        <input
          id="name"
          type="text"
          value={buyer.name}
          onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
          className={inputClasses}
        />
        {errors.name && (
          <p className="mt-1 text-sm text-[#DC2626]">{errors.name}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="country"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Pays
        </label>
        <select
          id="country"
          value={buyer.countryCode}
          onChange={(e) =>
            setBuyer({ ...buyer, countryCode: e.target.value })
          }
          className={inputClasses}
        >
          {markets.map((market) => (
            <option key={market.code} value={market.code}>
              {market.name} ({market.dialCode})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          htmlFor="phone"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Numéro de téléphone
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          value={buyer.phone}
          onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })}
          placeholder="07 12 34 56 78"
          className={inputClasses}
        />
        {errors.phone && (
          <p className="mt-1 text-sm text-[#DC2626]">{errors.phone}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="city"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Ville
        </label>
        <input
          id="city"
          type="text"
          value={buyer.city}
          onChange={(e) => setBuyer({ ...buyer, city: e.target.value })}
          className={inputClasses}
        />
        {errors.city && (
          <p className="mt-1 text-sm text-[#DC2626]">{errors.city}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="landmark"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Point de repère
        </label>
        <input
          id="landmark"
          type="text"
          value={buyer.landmark}
          onChange={(e) => setBuyer({ ...buyer, landmark: e.target.value })}
          placeholder="Ex. : en face de la pharmacie Awa"
          className={inputClasses}
        />
        {errors.landmark && (
          <p className="mt-1 text-sm text-[#DC2626]">{errors.landmark}</p>
        )}
        <p className="mt-1 text-sm text-gray-500">
          Aide le livreur à vous trouver facilement.
        </p>
      </div>

      <button
        type="submit"
        className="w-full min-h-[48px] rounded-xl bg-[#0B7C63] text-white text-[16px] font-semibold active:opacity-90"
      >
        Confirmer la commande
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="w-full min-h-[48px] rounded-xl text-[#DC2626] text-[16px] font-medium underline underline-offset-2"
      >
        Annuler la commande
      </button>
    </form>
  );
}
