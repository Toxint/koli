import { PaymentStatus, OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Agregats du tableau de bord administrateur (§34).
 *
 * Tout est calcule EN BASE (`count` / `aggregate` / `groupBy`) et jamais en
 * chargeant les lignes pour les additionner en memoire : le §46 l'impose, et
 * ces requetes tournent sur l'integralite de la plateforme, pas sur les
 * commandes d'un seul vendeur.
 *
 * Les compteurs de litiges et de remboursements portent sur des tables encore
 * vides : les modules correspondants arrivent aux phases 21 et 22. On les
 * expose quand meme, avec leur vraie valeur — afficher un zero mesure vaut
 * mieux que masquer la rubrique.
 */

export interface StatistiquesAdmin {
  utilisateurs: {
    total: number;
    vendeurs: number;
    livreurs: number;
    clients: number;
    suspendus: number;
  };
  vendeurs: {
    verifies: number;
    enAttente: number;
    rejetes: number;
  };
  commandes: {
    total: number;
    parStatut: { statut: OrderStatus; nombre: number }[];
    terminees: number;
  };
  paiements: {
    reussis: number;
    enAttente: number;
    echoues: number;
    volumeEncaisse: number;
  };
  fonds: {
    sequestre: number;
    libere: number;
  };
  litiges: {
    ouverts: number;
    total: number;
  };
  remboursements: {
    enAttente: number;
    total: number;
    volume: number;
  };
  commission: {
    tauxActif: number | null;
    /**
     * Commission REELLEMENT prelevee, lue au journal.
     *
     * C'etait auparavant une projection calculee a la volee sur les fonds
     * liberes, faute de prelevement effectif : le tableau de bord annoncait
     * une recette que la plateforme n'avait jamais encaissee.
     */
    prelevee: number;
    /** Nombre de prelevements inscrits au journal. */
    nombrePrelevements: number;
  };
}

export async function chargerStatistiquesAdmin(): Promise<StatistiquesAdmin> {
  const [
    total,
    vendeurs,
    livreurs,
    clients,
    suspendus,
    verifies,
    enAttenteVerif,
    rejetes,
    commandesTotal,
    commandesParStatut,
    commandesTerminees,
    paiementsReussis,
    paiementsEnAttente,
    paiementsEchoues,
    volumeEncaisse,
    sequestre,
    libere,
    litigesOuverts,
    litigesTotal,
    remboursementsEnAttente,
    remboursementsTotal,
    volumeRembourse,
    commissionActive,
    commissionPrelevee,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.sellerProfile.count(),
    prisma.driverProfile.count(),
    prisma.customerProfile.count(),
    prisma.user.count({ where: { status: "SUSPENDED" } }),

    prisma.sellerProfile.count({ where: { verificationStatus: "VERIFIED" } }),
    prisma.sellerProfile.count({ where: { verificationStatus: "PENDING" } }),
    prisma.sellerProfile.count({ where: { verificationStatus: "REJECTED" } }),

    prisma.order.count(),
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.order.count({ where: { status: OrderStatus.COMPLETED } }),

    prisma.payment.count({ where: { status: PaymentStatus.SUCCEEDED } }),
    prisma.payment.count({ where: { status: PaymentStatus.PENDING } }),
    prisma.payment.count({ where: { status: PaymentStatus.FAILED } }),
    prisma.payment.aggregate({
      where: { status: PaymentStatus.SUCCEEDED },
      _sum: { amount: true },
    }),

    // `released` ne remet pas `secured` a false : sans le filtre
    // `released: false`, les fonds deja verses resteraient comptes comme
    // sequestres et l'engagement de la plateforme serait surevalue.
    prisma.fund.aggregate({
      where: { secured: true, released: false },
      _sum: { amount: true },
    }),
    prisma.fund.aggregate({
      where: { released: true },
      _sum: { amount: true },
    }),

    prisma.dispute.count({ where: { status: "OPEN" } }),
    prisma.dispute.count(),

    prisma.refund.count({ where: { status: "PENDING" } }),
    prisma.refund.count(),
    prisma.refund.aggregate({ _sum: { amount: true } }),

    prisma.commission.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: { ratePercent: true },
    }),

    prisma.transaction.aggregate({
      where: { type: "COMMISSION" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const montantLibere = libere._sum.amount ?? 0;
  const taux = commissionActive?.ratePercent ?? null;

  return {
    utilisateurs: { total, vendeurs, livreurs, clients, suspendus },
    vendeurs: { verifies, enAttente: enAttenteVerif, rejetes },
    commandes: {
      total: commandesTotal,
      parStatut: commandesParStatut
        .map((l) => ({ statut: l.status, nombre: l._count._all }))
        .sort((a, b) => b.nombre - a.nombre),
      terminees: commandesTerminees,
    },
    paiements: {
      reussis: paiementsReussis,
      enAttente: paiementsEnAttente,
      echoues: paiementsEchoues,
      volumeEncaisse: volumeEncaisse._sum.amount ?? 0,
    },
    fonds: {
      sequestre: sequestre._sum.amount ?? 0,
      libere: montantLibere,
    },
    litiges: { ouverts: litigesOuverts, total: litigesTotal },
    remboursements: {
      enAttente: remboursementsEnAttente,
      total: remboursementsTotal,
      volume: volumeRembourse._sum.amount ?? 0,
    },
    commission: {
      tauxActif: taux,
      // Les ecritures COMMISSION sont negatives (debit du point de vue du
      // vendeur) : on les repasse en positif pour l'affichage.
      prelevee: Math.abs(commissionPrelevee._sum.amount ?? 0),
      nombrePrelevements: commissionPrelevee._count._all,
    },
  };
}

export interface ActiviteRecente {
  id: string;
  reference: string;
  de: OrderStatus | null;
  vers: OrderStatus;
  date: Date;
  vendeur: string;
}

/**
 * Activites recentes (§34).
 *
 * Construites depuis `OrderStatusHistory`, la seule trace reellement ecrite a
 * ce jour. `AuditLog` reste vide jusqu'a la phase 26 : s'en servir ici aurait
 * donne un fil d'activite systematiquement desert.
 */
export async function chargerActivitesRecentes(
  limite = 12
): Promise<ActiviteRecente[]> {
  const lignes = await prisma.orderStatusHistory.findMany({
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      createdAt: true,
      order: {
        select: {
          reference: true,
          seller: { select: { businessName: true, user: { select: { name: true } } } },
        },
      },
    },
  });

  return lignes.map((l) => ({
    id: l.id,
    reference: l.order.reference,
    de: l.fromStatus,
    vers: l.toStatus,
    date: l.createdAt,
    vendeur: l.order.seller.businessName || l.order.seller.user.name,
  }));
}
