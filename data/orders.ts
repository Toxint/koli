// Données de commande en dur — sera remplacé par une base de données plus
// tard (voir docs/architecture.md, Phase 2 / docs/koli-plan.md §78). Format
// d'ID à corriger vers KOLI-xxxxxx (voir docs/architecture.md §7).
// L'affichage ne doit pas s'en apercevoir.

export interface OrderProduct {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderBuyer {
  name: string;
  phone: string;
  countryCode: string;
  city: string;
  landmark: string;
}

export interface Order {
  id: string;
  merchantName: string;
  product: OrderProduct;
  deliveryFee: number;
  buyer: OrderBuyer;
}

export const orders: Record<string, Order> = {
  "CMD-001": {
    id: "CMD-001",
    merchantName: "Boutique Awa",
    product: {
      name: "Robe wax imprimée",
      quantity: 1,
      unitPrice: 15000,
    },
    deliveryFee: 3500,
    buyer: {
      name: "Awa Koné",
      phone: "07 12 34 56 78",
      countryCode: "CI",
      city: "Abidjan",
      landmark: "",
    },
  },
};

export function getOrder(id: string): Order | undefined {
  return orders[id];
}
