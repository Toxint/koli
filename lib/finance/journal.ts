import type { Prisma, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Journal financier (§39-40).
 *
 * Le §39 impose de ne jamais confondre `ORDER`, `PAYMENT`, `TRANSACTION`,
 * `FUNDS` et `REFUND`. Les tables respectaient déjà cette séparation ; c'est la
 * lecture qui manquait. Les écritures s'accumulaient depuis le début du projet
 * sans qu'aucun écran ne les montre — ni au vendeur, ni à l'administration.
 *
 * Un registre qui s'écrit sans jamais se lire ne prouve rien : personne ne peut
 * constater qu'il est juste.
 */

/** Libellés en clair. Les valeurs brutes de l'enum ne s'affichent jamais. */
export const LIBELLES_TYPE: Record<TransactionType, string> = {
  PAYMENT: "Paiement du client",
  FUNDS_SECURED: "Mise sous séquestre",
  FUNDS_RELEASED: "Libération au vendeur",
  COMMISSION: "Commission KOLI",
  REFUND: "Remboursement",
  DRIVER_PAYOUT: "Frais de livraison au livreur",
};

/**
 * Ce que chaque écriture signifie pour la trésorerie de la PLATEFORME.
 *
 * `PAYMENT` et `FUNDS_SECURED` décrivent le même argent vu sous deux angles :
 * ce que le client a versé, et la part mise de côté pour le vendeur. Les
 * additionner reviendrait à compter deux fois. Seules les lignes marquées
 * `compteDansLeResultat` entrent dans le résultat de KOLI.
 */
export const EXPLICATIONS: Record<TransactionType, string> = {
  PAYMENT: "Encaissé auprès du client, frais de livraison compris.",
  FUNDS_SECURED: "Part revenant au vendeur, retenue jusqu'à sa confirmation.",
  FUNDS_RELEASED: "Versé au vendeur après confirmation de réception.",
  COMMISSION: "Part conservée par KOLI, prélevée à la libération.",
  REFUND: "Rendu au client après décision de remboursement.",
  DRIVER_PAYOUT:
    "Frais de livraison acquis au livreur, à la validation du code de réception.",
};

export interface LigneJournal {
  id: string;
  type: TransactionType;
  montant: number;
  taux: number | null;
  date: Date;
  reference: string;
  vendeur: string | null;
  client: string;
}

export interface FiltresJournal {
  /** Restreint à un vendeur. Absent côté administration. */
  sellerId?: string;
  type?: TransactionType;
  reference?: string;
  page: number;
  parPage: number;
}

export interface ResultatJournal {
  lignes: LigneJournal[];
  total: number;
  /** Somme par type, sur l'ENSEMBLE du filtre — pas sur la page affichée. */
  totauxParType: { type: TransactionType; montant: number; nombre: number }[];
}

export async function chargerJournal({
  sellerId,
  type,
  reference,
  page,
  parPage,
}: FiltresJournal): Promise<ResultatJournal> {
  const where: Prisma.TransactionWhereInput = {
    ...(type ? { type } : {}),
    ...(sellerId || reference
      ? {
          order: {
            ...(sellerId ? { sellerId } : {}),
            ...(reference ? { reference: { contains: reference } } : {}),
          },
        }
      : {}),
  };

  // Les totaux sont calculés EN BASE sur tout le filtre. Les sommer depuis la
  // page affichée donnerait un total qui change quand on tourne la page — un
  // chiffre qui ment sans en avoir l'air.
  const [lignes, total, parType] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        order: {
          select: {
            reference: true,
            buyerName: true,
            seller: { select: { businessName: true } },
          },
        },
      },
      // `id` en second critère : deux écritures d'une même transaction
      // partagent la milliseconde, et un ordre instable ferait apparaître ou
      // disparaître une ligne d'une page à l'autre.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * parPage,
      take: parPage,
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.groupBy({
      by: ["type"],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  return {
    lignes: lignes.map((l) => ({
      id: l.id,
      type: l.type,
      montant: l.amount,
      taux: l.rate,
      date: l.createdAt,
      reference: l.order.reference,
      vendeur: l.order.seller?.businessName ?? null,
      client: l.order.buyerName,
    })),
    total,
    totauxParType: parType
      .map((g) => ({
        type: g.type,
        montant: g._sum.amount ?? 0,
        nombre: g._count._all,
      }))
      .sort((a, b) => b.nombre - a.nombre),
  };
}

/** Le journal d'UNE commande, dans l'ordre chronologique (§40). */
export async function chargerJournalCommande(
  orderId: string
): Promise<LigneJournal[]> {
  const lignes = await prisma.transaction.findMany({
    where: { orderId },
    include: {
      order: {
        select: {
          reference: true,
          buyerName: true,
          seller: { select: { businessName: true } },
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return lignes.map((l) => ({
    id: l.id,
    type: l.type,
    montant: l.amount,
    taux: l.rate,
    date: l.createdAt,
    reference: l.order.reference,
    vendeur: l.order.seller?.businessName ?? null,
    client: l.order.buyerName,
  }));
}
