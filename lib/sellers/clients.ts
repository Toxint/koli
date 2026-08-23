import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Clients d'un vendeur (phase 7).
 *
 * Un « client » n'est pas un compte : c'est un ACHETEUR, identifié par son
 * **numéro de téléphone**. C'est la clé retenue partout ailleurs dans KOLI —
 * elle rattache les commandes passées en mode invité (`createOrderAction`), et
 * elle sert de garantie au livreur. Grouper par `customerId` laisserait de côté
 * tous les achats sans compte, c'est-à-dire une grande partie du public visé.
 *
 * Le nom peut varier d'une commande à l'autre (orthographe, surnom) : on
 * retient celui de la commande la plus récente.
 */
export interface ClientVendeur {
  telephone: string;
  nom: string;
  email: string | null;
  ville: string | null;
  commandes: number;
  terminees: number;
  /** Ce que le client a RÉELLEMENT réglé, pas ce qui a été commandé. */
  totalRegle: number;
  derniereCommande: Date;
}

export interface PageClients {
  clients: ClientVendeur[];
  total: number;
}

export async function chargerClientsVendeur(options: {
  sellerId: string;
  recherche?: string;
  page: number;
  parPage: number;
}): Promise<PageClients> {
  const { sellerId, recherche, page, parPage } = options;

  const where: Prisma.OrderWhereInput = {
    sellerId,
    ...(recherche
      ? {
          OR: [
            { buyerName: { contains: recherche } },
            { buyerPhone: { contains: recherche } },
            { buyerEmail: { contains: recherche } },
          ],
        }
      : {}),
  };

  // Regroupement EN BASE (§46). Le décompte total charge une ligne par client
  // et non par commande : acceptable à l'échelle du MVP, à remplacer par un
  // `COUNT(DISTINCT)` si un vendeur dépasse quelques milliers d'acheteurs.
  const [groupes, tousLesGroupes] = await Promise.all([
    prisma.order.groupBy({
      by: ["buyerPhone"],
      where,
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      skip: (page - 1) * parPage,
      take: parPage,
    }),
    prisma.order.groupBy({
      by: ["buyerPhone"],
      where,
      _count: { _all: true },
    }),
  ]);

  const telephones = groupes.map((g) => g.buyerPhone);
  if (telephones.length === 0) {
    return { clients: [], total: tousLesGroupes.length };
  }

  const [commandes, termineesParTelephone, regleParTelephone] =
    await Promise.all([
      // Le nom, l'e-mail et la ville les plus récents. Trié décroissant, on
      // garde la première occurrence de chaque numéro.
      prisma.order.findMany({
        where: { sellerId, buyerPhone: { in: telephones } },
        select: {
          // `id` sert aussi à rattacher les paiements à leur acheteur : une
          // seule requête pour les deux usages plutôt que deux.
          id: true,
          buyerPhone: true,
          buyerName: true,
          buyerEmail: true,
          buyerCity: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),

      prisma.order.groupBy({
        by: ["buyerPhone"],
        where: {
          sellerId,
          buyerPhone: { in: telephones },
          status: OrderStatus.COMPLETED,
        },
        _count: { _all: true },
      }),

      // Ce qui a été RÉELLEMENT réglé : on lit le paiement abouti, pas le
      // total de la commande. Une commande créée puis jamais payée ne fait pas
      // du destinataire un client qui a dépensé quoi que ce soit.
      prisma.payment.groupBy({
        by: ["orderId"],
        where: {
          status: PaymentStatus.SUCCEEDED,
          order: { sellerId, buyerPhone: { in: telephones } },
        },
        _sum: { amount: true },
      }),
    ]);

  const telephoneParCommande = new Map(
    commandes.map((c) => [c.id, c.buyerPhone])
  );

  const regle = new Map<string, number>();
  for (const p of regleParTelephone) {
    const tel = telephoneParCommande.get(p.orderId);
    if (!tel) continue;
    regle.set(tel, (regle.get(tel) ?? 0) + (p._sum.amount ?? 0));
  }

  const derniere = new Map<string, (typeof commandes)[number]>();
  for (const c of commandes) {
    if (!derniere.has(c.buyerPhone)) derniere.set(c.buyerPhone, c);
  }

  const terminees = new Map(
    termineesParTelephone.map((t) => [t.buyerPhone, t._count._all])
  );

  return {
    total: tousLesGroupes.length,
    clients: groupes.map((g) => {
      const recente = derniere.get(g.buyerPhone);
      return {
        telephone: g.buyerPhone,
        nom: recente?.buyerName ?? g.buyerPhone,
        email: recente?.buyerEmail ?? null,
        ville: recente?.buyerCity ?? null,
        commandes: g._count._all,
        terminees: terminees.get(g.buyerPhone) ?? 0,
        totalRegle: regle.get(g.buyerPhone) ?? 0,
        derniereCommande: g._max.createdAt ?? recente?.createdAt ?? new Date(),
      };
    }),
  };
}
