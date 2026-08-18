"use client";

import { useState } from "react";
import { OrderSummary } from "@/components/OrderSummary";
import { BuyerInfoForm } from "@/components/BuyerInfoForm";
import type { Order, OrderBuyer } from "@/data/orders";

type FlowState = "revue" | "confirmee" | "annulee";

export function OrderFlow({ order }: { order: Order }) {
  const [state, setState] = useState<FlowState>("revue");
  const [buyer, setBuyer] = useState<OrderBuyer>(order.buyer);

  if (state === "confirmee") {
    return (
      <section className="mx-auto max-w-md py-8 text-center lg:py-24">
        <p className="mb-4 text-4xl">✅</p>
        <h1 className="mb-2 text-lg font-semibold text-gray-900">
          Commande confirmée
        </h1>
        <p className="text-[16px] text-gray-600">
          Vous allez recevoir votre facture par WhatsApp au {buyer.phone}{" "}
          d&apos;ici quelques minutes.
        </p>
      </section>
    );
  }

  if (state === "annulee") {
    return (
      <section className="mx-auto max-w-md py-8 text-center lg:py-24">
        <h1 className="mb-2 text-lg font-semibold text-gray-900">
          Commande annulée
        </h1>
        <p className="text-[16px] text-gray-600">
          Votre commande a été annulée. Aucun montant ne vous sera demandé.
        </p>
      </section>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-16">
      <div className="mb-6 lg:order-2 lg:mb-0 lg:rounded-2xl lg:bg-gray-50 lg:p-8">
        <OrderSummary order={order} />
      </div>
      <div className="lg:order-1">
        <BuyerInfoForm
          initialBuyer={buyer}
          onConfirm={(updatedBuyer) => {
            setBuyer(updatedBuyer);
            setState("confirmee");
          }}
          onCancel={() => setState("annulee")}
        />
      </div>
    </div>
  );
}
