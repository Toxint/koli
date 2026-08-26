import { prisma } from "@/lib/db/prisma";

/**
 * Ce qu'un livreur a gagné, et ce qu'il lui reste à faire.
 *
 * **Le livreur ne voit QUE ses frais de livraison.** Le §25 interdit de lui
 * montrer des informations financières inutiles : la valeur de la marchandise,
 * la commission KOLI, le solde du vendeur ne le regardent pas. Ses propres
 * frais, eux, cessent d'être « inutiles » à partir du moment où ils sont sa
 * paie — c'est la seule chose que ce module expose.
 *
 * Tout est agrégé en base (§46, §70) : compter les courses d'un livreur actif
 * en chargeant chaque ligne serait ruineux sur un téléphone d'entrée de gamme.
 */
export interface RevenusLivreur {
  /** Frais acquis aujourd'hui, depuis minuit. */
  gagneAujourdhui: number;
  /** Frais acquis depuis le début, toutes courses confondues. */
  gagneTotal: number;
  /** Courses terminées aujourd'hui. */
  coursesAujourdhui: number;
  /** Courses terminées depuis le début. */
  coursesTotal: number;
  /** Courses attribuées mais pas encore enlevées. */
  aVenir: number;
  /** Courses en cours de route. */
  enCours: number;
  /** Moyenne par course terminée, aujourd'hui. Zéro s'il n'y en a aucune. */
  moyenneAujourdhui: number;
}

/** Minuit, heure du serveur. Les journées d'un livreur se comptent en jours. */
function debutDeJournee(maintenant = new Date()): Date {
  const d = new Date(maintenant);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Les états qui comptent pour « à venir » et « en cours ».
 *
 * `TO_CONFIRM` est rangé dans « en cours » et non dans « terminé » : le livreur
 * est arrivé, mais tant que le code n'est pas validé la course n'est pas faite
 * — et elle n'est pas payée.
 */
const A_VENIR = ["ASSIGNED", "TO_PICK_UP"] as const;
const EN_COURS = ["PICKED_UP", "IN_TRANSIT", "ARRIVED", "TO_CONFIRM"] as const;

export async function chargerRevenusLivreur(
  driverProfileId: string
): Promise<RevenusLivreur> {
  const minuit = debutDeJournee();

  // Le crédit du livreur est une écriture DRIVER_PAYOUT posée à la validation
  // de l'OTP. On somme donc les écritures, jamais les frais des commandes :
  // une commande peut porter des frais sans que la course ait ete faite.
  const ecritures = {
    type: "DRIVER_PAYOUT" as const,
    order: { delivery: { driverId: driverProfileId } },
  };

  const [aujourdhui, total, faitesAujourdhui, faitesTotal, aVenir, enCours] =
    await Promise.all([
      prisma.transaction.aggregate({
        where: { ...ecritures, createdAt: { gte: minuit } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: ecritures,
        _sum: { amount: true },
      }),
      prisma.delivery.count({
        where: {
          driverId: driverProfileId,
          status: "CONFIRMED",
          deliveredAt: { gte: minuit },
        },
      }),
      prisma.delivery.count({
        where: { driverId: driverProfileId, status: "CONFIRMED" },
      }),
      prisma.delivery.count({
        where: { driverId: driverProfileId, status: { in: [...A_VENIR] } },
      }),
      prisma.delivery.count({
        where: { driverId: driverProfileId, status: { in: [...EN_COURS] } },
      }),
    ]);

  const gagneAujourdhui = aujourdhui._sum.amount ?? 0;

  return {
    gagneAujourdhui,
    gagneTotal: total._sum.amount ?? 0,
    coursesAujourdhui: faitesAujourdhui,
    coursesTotal: faitesTotal,
    aVenir,
    enCours,
    // Divisé par les COURSES du jour, pas par les écritures : une course dont
    // les frais valaient zéro n'a pas d'écriture, et la moyenne serait alors
    // calculée sur un dénominateur trop petit.
    moyenneAujourdhui:
      faitesAujourdhui > 0 ? Math.round(gagneAujourdhui / faitesAujourdhui) : 0,
  };
}
