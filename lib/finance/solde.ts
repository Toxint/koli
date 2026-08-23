import { prisma } from "@/lib/db/prisma";

/**
 * Solde d'un vendeur (§42), calculé à un seul endroit.
 *
 * Il était calculé deux fois — sur le tableau de bord et sur la page Solde —
 * avec deux méthodes différentes, l'une chargeant toutes les lignes en mémoire.
 * Deux calculs séparés d'un même chiffre finissent toujours par diverger, et
 * c'est le genre d'écart qu'un vendeur remarque avant nous.
 *
 * La commission (§41) est retranchée du solde disponible : le vendeur doit voir
 * ce qu'il touche, pas ce qui a été libéré avant prélèvement. Le montant retenu
 * reste affiché à côté — un solde amputé sans explication ressemble à une
 * erreur.
 */
export interface SoldeVendeur {
  /** Commandes payées, argent retenu tant que le client n'a pas confirmé. */
  fondsSecurises: number;
  /** Fonds libérés, avant prélèvement. */
  brutLibere: number;
  /** Commission KOLI retenue sur ces libérations, en valeur positive. */
  commissionRetenue: number;
  /** Ce que le vendeur touche réellement : `brutLibere - commissionRetenue`. */
  soldeDisponible: number;
  /** Séquestre + disponible. Le séquestre n'a pas encore été commissionné. */
  totalGagne: number;
}

export async function chargerSoldeVendeur(
  sellerId: string
): Promise<SoldeVendeur> {
  // Agrégé en base (§46, §70) : le tableau de bord chargeait auparavant chaque
  // ligne de séquestre du vendeur pour n'en faire qu'une somme.
  const [sequestre, libere, commission] = await Promise.all([
    prisma.fund.aggregate({
      where: { sellerId, secured: true, released: false },
      _sum: { amount: true },
    }),
    prisma.fund.aggregate({
      where: { sellerId, released: true },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { type: "COMMISSION", order: { sellerId } },
      _sum: { amount: true },
    }),
  ]);

  const fondsSecurises = sequestre._sum.amount ?? 0;
  const brutLibere = libere._sum.amount ?? 0;

  // Les écritures COMMISSION sont négatives (débit). On les repasse en positif
  // pour l'affichage, sans supposer leur signe : `Math.abs` protège d'une
  // donnée ancienne écrite dans l'autre sens.
  const commissionRetenue = Math.abs(commission._sum.amount ?? 0);

  // `Math.max(0, …)` : un solde négatif n'a aucun sens à l'écran. Le cas ne
  // devrait pas survenir — la commission ne peut dépasser son assiette — mais
  // afficher « -300 FCFA » au vendeur serait plus alarmant qu'informatif.
  const soldeDisponible = Math.max(0, brutLibere - commissionRetenue);

  return {
    fondsSecurises,
    brutLibere,
    commissionRetenue,
    soldeDisponible,
    totalGagne: fondsSecurises + soldeDisponible,
  };
}
