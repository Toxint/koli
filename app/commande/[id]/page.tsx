import { getOrder } from "@/data/orders";
import { OrderFlow } from "./order-flow";

export default async function CommandePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = getOrder(id);

  if (!order) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto w-full max-w-md px-4 py-6 text-center lg:py-24">
          <h1 className="mb-2 text-lg font-semibold text-gray-900">
            Commande introuvable
          </h1>
          <p className="text-[16px] text-gray-600">
            Cette commande n&apos;existe pas ou a expiré. Écrivez à la
            boutique pour en recevoir une nouvelle.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="w-full px-4 py-6 lg:mx-auto lg:max-w-5xl lg:px-8 lg:py-16">
        <OrderFlow order={order} />
      </div>
    </main>
  );
}
