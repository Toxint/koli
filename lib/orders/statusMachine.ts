import { OrderStatus } from "@prisma/client";

/**
 * Machine a etats des commandes KOLI.
 *
 * Cahier des charges §15 : « Un utilisateur ne doit pas pouvoir modifier
 * librement un statut. Chaque changement doit respecter les transitions
 * autorisees. » Toute transition absente de cette table est refusee cote
 * serveur.
 *
 * Reference : docs/koli-plan.md §13-15, docs/architecture.md §5.
 *
 * Note importante : ADMIN_REVIEW / SELLER_WINS / CUSTOMER_WINS ne sont PAS
 * des statuts de commande — ils appartiennent a l'enum DisputeStatus et
 * vivent sur Dispute.status. Au niveau de la commande, la resolution d'un
 * litige se traduit par DISPUTE_OPEN -> FUNDS_RELEASED (vendeur gagne) ou
 * DISPUTE_OPEN -> REFUND_PENDING (client gagne).
 */
export const ORDER_STATUS_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  // --- Parcours nominal ---
  DRAFT: [OrderStatus.PAYMENT_PENDING, OrderStatus.CANCELLED],
  PAYMENT_PENDING: [
    OrderStatus.PAYMENT_CONFIRMED,
    OrderStatus.PAYMENT_FAILED,
    OrderStatus.CANCELLED,
  ],
  PAYMENT_CONFIRMED: [OrderStatus.FUNDS_SECURED],
  FUNDS_SECURED: [OrderStatus.SELLER_ACCEPTED, OrderStatus.CANCELLED],
  SELLER_ACCEPTED: [OrderStatus.PACKAGE_PREPARING],
  PACKAGE_PREPARING: [OrderStatus.READY_FOR_PICKUP],
  READY_FOR_PICKUP: [OrderStatus.PICKED_UP],
  PICKED_UP: [OrderStatus.IN_TRANSIT],
  IN_TRANSIT: [OrderStatus.ARRIVED, OrderStatus.DELIVERY_FAILED],
  ARRIVED: [OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED],
  DELIVERED: [
    OrderStatus.CUSTOMER_CONFIRMED,
    OrderStatus.DISPUTE_OPEN,
    OrderStatus.RETURN_REQUESTED,
  ],
  CUSTOMER_CONFIRMED: [OrderStatus.FUNDS_RELEASED],
  FUNDS_RELEASED: [OrderStatus.COMPLETED],

  // --- Reprise apres echec ---
  // §23 : le checkout propose un bouton « Reessayer » apres un paiement
  // echoue. Aucun mouvement d'argent n'a eu lieu, la reprise est sure.
  PAYMENT_FAILED: [OrderStatus.PAYMENT_PENDING, OrderStatus.CANCELLED],
  // Nouvelle tentative de livraison, ou escalade en litige.
  DELIVERY_FAILED: [OrderStatus.IN_TRANSIT, OrderStatus.DISPUTE_OPEN],

  // --- Litige (§32) ---
  // La sortie de DISPUTE_OPEN n'est possible que sur decision d'un admin ;
  // c'est l'action serveur qui verifie le role, la machine a etats n'autorise
  // ici que la forme de la transition.
  DISPUTE_OPEN: [OrderStatus.FUNDS_RELEASED, OrderStatus.REFUND_PENDING],

  // --- Retour / remboursement ---
  RETURN_REQUESTED: [OrderStatus.RETURNED, OrderStatus.DISPUTE_OPEN],
  RETURNED: [OrderStatus.REFUND_PENDING],
  REFUND_PENDING: [OrderStatus.REFUNDED],

  // --- Etats terminaux ---
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

/** Statuts a partir desquels plus aucune transition n'est possible. */
export function isTerminalStatus(status: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[status].length === 0;
}

/** Indique si le passage de `from` vers `to` est autorise. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Cherche le plus court enchainement de transitions LEGALES menant de `from`
 * a `to`, bornes exclus/inclus : le tableau retourne commence au premier saut
 * et se termine par `to`. Retourne `null` si aucun chemin n'existe.
 *
 * Utile tant que certaines etapes intermediaires n'ont pas d'interface dediee
 * (ex. les jalons du livreur, phase 15) : on franchit le chemin d'un bloc, mais
 * chaque saut reste valide et chaque etape est journalisee.
 */
export function findTransitionPath(
  from: OrderStatus,
  to: OrderStatus
): OrderStatus[] | null {
  if (from === to) return [];

  const queue: OrderStatus[] = [from];
  const previous = new Map<OrderStatus, OrderStatus>();
  const seen = new Set<OrderStatus>([from]);

  while (queue.length > 0) {
    const current = queue.shift() as OrderStatus;

    for (const next of ORDER_STATUS_TRANSITIONS[current]) {
      if (seen.has(next)) continue;
      seen.add(next);
      previous.set(next, current);

      if (next === to) {
        const path: OrderStatus[] = [to];
        let step = to;
        while (previous.get(step) !== from) {
          step = previous.get(step) as OrderStatus;
          path.unshift(step);
        }
        return path;
      }

      queue.push(next);
    }
  }

  return null;
}

/**
 * Erreur levee lorsqu'une transition interdite est tentee.
 * Distincte d'une Error generique pour que les actions serveur puissent la
 * rattraper et repondre proprement a l'utilisateur (§65).
 */
export class InvalidOrderTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus
  ) {
    super(
      `Transition de commande interdite : ${from} -> ${to}. ` +
        `Transitions autorisees depuis ${from} : ` +
        `${ORDER_STATUS_TRANSITIONS[from].join(", ") || "aucune (etat terminal)"}.`
    );
    this.name = "InvalidOrderTransitionError";
  }
}

/** Leve `InvalidOrderTransitionError` si la transition n'est pas autorisee. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}
