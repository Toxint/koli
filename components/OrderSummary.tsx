import { formatCFA } from "@/lib/format";
import type { Order } from "@/data/orders";

export function OrderSummary({ order }: { order: Order }) {
  const subtotal = order.product.unitPrice * order.product.quantity;
  const total = subtotal + order.deliveryFee;

  return (
    <section aria-label="Récapitulatif de la commande" className="mb-6">
      <p className="text-sm text-gray-500 mb-1">{order.merchantName}</p>
      <h1 className="text-lg font-semibold text-gray-900 mb-4">
        {order.product.name}
      </h1>

      <dl className="space-y-2 text-[16px]">
        <div className="flex justify-between">
          <dt className="text-gray-600">
            {order.product.quantity} × {formatCFA(order.product.unitPrice)}
          </dt>
          <dd className="text-gray-900">{formatCFA(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-600">Livraison</dt>
          <dd className="text-gray-900">{formatCFA(order.deliveryFee)}</dd>
        </div>
      </dl>

      <div className="flex justify-between items-baseline mt-4 pt-4 border-t border-gray-200">
        <dt className="text-base font-medium text-gray-900">Total à payer</dt>
        <dd className="text-2xl font-bold text-[#0B7C63]">
          {formatCFA(total)}
        </dd>
      </div>
    </section>
  );
}
