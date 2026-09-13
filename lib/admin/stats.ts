import { PaymentStatus, OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { commeDevise, type Devise } from "@/data/markets";

/**
 * Un montant qui ne peut PAS être un seul nombre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Ces écrans agrègent TOUS les vendeurs, donc plusieurs monnaies. Une     │
 * │  somme entre elles n'est pas mal étiquetée — elle n'existe pas.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Le tableau de bord additionnait des francs CFA et des francs congolais, et
 * présentait le résultat comme un montant. `formatTotaux` les JUXTAPOSE à
 * l'affichage — « 120 000 FCFA · 4 500 000 FC ».
 *
 * Convertir vers une monnaie de référence serait pire ici : sur un écran de
 * rapprochement comptable, le chiffre serait vrai à la seconde et faux le
 * lendemain, sans que rien ne le date.
 */
export type MontantParDevise = Partial<Record<Devise, number>>;

/**
 * Somme groupée par la devise de la COMMANDE, calculée en base.
 *
 * `Payment`, `Fund` et `Refund` ne portent pas de devise : elle vit sur
 * `Order`. Or `groupBy` de Prisma ne sait pas classer par une colonne d'une
 * autre table — il faut une jointure, donc du SQL.
 *
 * ⚠ **On ne charge pas les lignes pour les additionner en mémoire.** Ces
 * requêtes portent sur l'intégralité de la plateforme ; le §46 l'interdit, et
 * c'est exactement ce que `GROUP BY` fait à notre place.
 *
 * ⚠ **Les identifiants sont GUILLEMETÉS.** PostgreSQL replie en minuscules
 * tout identifiant nu : `FROM Order` y chercherait une table `order`, qui de
 * surcroît est un mot réservé.
 *
 * ⚠ **`SUM()` sur un entier rend un `bigint`**, que le pilote restitue en
 * `BigInt`. Sans la conversion, l'arithmétique d'affichage lèverait
 * « Cannot mix BigInt and other types ».
 */
async function sommeParDevise(requete: Prisma.Sql): Promise<MontantParDevise> {
  const lignes =
    await prisma.$queryRaw<{ devise: string; total: bigint | null }[]>(requete);

  const parDevise: MontantParDevise = {};
  for (const l of lignes) {
    if (l.total === null) continue;
    const d = commeDevise(l.devise);
    parDevise[d] = (parDevise[d] ?? 0) + Number(l.total);
  }
  return parDevise;
}

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
    volumeEncaisse: MontantParDevise;
  };
  fonds: {
    sequestre: MontantParDevise;
    libere: MontantParDevise;
  };
  litiges: {
    ouverts: number;
    total: number;
  };
  remboursements: {
    enAttente: number;
    total: number;
    volume: MontantParDevise;
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
    prelevee: MontantParDevise;
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
    sommeParDevise(Prisma.sql`
      SELECT o.currency AS devise, SUM(p.amount) AS total
        FROM "Payment" p JOIN "Order" o ON o.id = p."orderId"
       WHERE p.status = 'SUCCEEDED'
       GROUP BY o.currency`),

    // `released` ne remet pas `secured` a false : sans le filtre
    // `released: false`, les fonds deja verses resteraient comptes comme
    // sequestres et l'engagement de la plateforme serait surevalue.
    sommeParDevise(Prisma.sql`
      SELECT o.currency AS devise, SUM(f.amount) AS total
        FROM "Fund" f JOIN "Order" o ON o.id = f."orderId"
       WHERE f.secured = true AND f.released = false
       GROUP BY o.currency`),
    sommeParDevise(Prisma.sql`
      SELECT o.currency AS devise, SUM(f.amount) AS total
        FROM "Fund" f JOIN "Order" o ON o.id = f."orderId"
       WHERE f.released = true
       GROUP BY o.currency`),

    prisma.dispute.count({ where: { status: "OPEN" } }),
    prisma.dispute.count(),

    prisma.refund.count({ where: { status: "PENDING" } }),
    prisma.refund.count(),
    sommeParDevise(Prisma.sql`
      SELECT o.currency AS devise, SUM(r.amount) AS total
        FROM "Refund" r JOIN "Order" o ON o.id = r."orderId"
       GROUP BY o.currency`),

    prisma.commission.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: { ratePercent: true },
    }),

    /* `Transaction` porte SA PROPRE devise — recopiée depuis la commande à
       l'écriture, précisément pour qu'un regroupement comme celui-ci soit
       possible sans jointure. `groupBy` suffit donc ici. */
    prisma.transaction.groupBy({
      by: ["currency"],
      where: { type: "COMMISSION" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const taux = commissionActive?.ratePercent ?? null;

  /* La commission s'écrit en NÉGATIF au journal (`preleverCommission`). Ce
     qu'on affiche est ce que la plateforme a encaissé : sa valeur absolue. */
  const commissionParDevise: MontantParDevise = {};
  let nombrePrelevements = 0;
  for (const l of commissionPrelevee) {
    const d = commeDevise(l.currency);
    commissionParDevise[d] =
      (commissionParDevise[d] ?? 0) + Math.abs(l._sum.amount ?? 0);
    nombrePrelevements += l._count._all;
  }

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
      volumeEncaisse,
    },
    fonds: { sequestre, libere },
    litiges: { ouverts: litigesOuverts, total: litigesTotal },
    remboursements: {
      enAttente: remboursementsEnAttente,
      total: remboursementsTotal,
      volume: volumeRembourse,
    },
    commission: {
      tauxActif: taux,
      prelevee: commissionParDevise,
      nombrePrelevements,
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
