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
  /**
   * Ce qui a DÉJÀ été versé au vendeur, et a donc quitté KOLI (§43).
   *
   * ⚠ Seuls les versements EXÉCUTÉS comptent. Une demande en attente n'est pas
   * un mouvement : la compter ici ferait disparaître du solde un argent que le
   * vendeur n'a pas reçu, et qu'il récupérerait si la demande était refusée.
   */
  dejaVerse: number;
  /**
   * Les demandes en attente — acquises, mais GELÉES.
   *
   * Elles restent dans `soldeDisponible` : l'argent est toujours au vendeur.
   * Mais elles sortent du `versable`, sans quoi deux demandes successives
   * videraient le même solde deux fois.
   */
  versementEnAttente: number;
  /** Ce que le vendeur a acquis et pas encore reçu. */
  soldeDisponible: number;
  /**
   * Ce qu'il peut demander MAINTENANT : le disponible moins les demandes en
   * cours. C'est le seul chiffre auquel `refusDeVersement` doit comparer.
   */
  versable: number;
  /** Séquestre + disponible. Le séquestre n'a pas encore été commissionné. */
  totalGagne: number;
}

export async function chargerSoldeVendeur(
  sellerId: string
): Promise<SoldeVendeur> {
  // Agrégé en base (§46, §70) : le tableau de bord chargeait auparavant chaque
  // ligne de séquestre du vendeur pour n'en faire qu'une somme.
  const [sequestre, libere, commission, verse, enAttente] = await Promise.all([
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
    /*
     * Les versements (§43) — le seul endroit où l'argent QUITTE KOLI.
     *
     * ⚠ Ils ne passent pas par `Transaction` : `orderId` y est obligatoire, et
     * un versement solde un cumul, pas une commande. `Payout` est leur
     * registre — voir la note dans `TransactionType`.
     */
    prisma.payout.aggregate({
      where: { sellerId, status: "PAID" },
      _sum: { amount: true },
    }),
    prisma.payout.aggregate({
      where: { sellerId, status: "PENDING" },
      _sum: { amount: true },
    }),
  ]);

  const fondsSecurises = sequestre._sum.amount ?? 0;
  const brutLibere = libere._sum.amount ?? 0;

  // Les écritures COMMISSION sont négatives (débit). On les repasse en positif
  // pour l'affichage, sans supposer leur signe : `Math.abs` protège d'une
  // donnée ancienne écrite dans l'autre sens.
  const commissionRetenue = Math.abs(commission._sum.amount ?? 0);

  const dejaVerse = verse._sum.amount ?? 0;
  const versementEnAttente = enAttente._sum.amount ?? 0;

  // `Math.max(0, …)` : un solde négatif n'a aucun sens à l'écran. Le cas ne
  // devrait pas survenir — la commission ne peut dépasser son assiette, et un
  // versement ne peut dépasser le versable — mais afficher « -300 FCFA » au
  // vendeur serait plus alarmant qu'informatif.
  const soldeDisponible = Math.max(
    0,
    brutLibere - commissionRetenue - dejaVerse
  );

  /*
   * Le VERSABLE gèle les demandes en cours.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │  Sans cela, deux demandes successives videraient le même solde deux    │
   * │  fois : la seconde serait acceptée avant que la première ne soit        │
   * │  exécutée, et le solde ne verrait ni l'une ni l'autre.                  │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * Les demandes restent dans `soldeDisponible` — l'argent appartient toujours
   * au vendeur, et un refus le lui rend.
   */
  const versable = Math.max(0, soldeDisponible - versementEnAttente);

  return {
    fondsSecurises,
    brutLibere,
    commissionRetenue,
    dejaVerse,
    versementEnAttente,
    soldeDisponible,
    versable,
    /* Ce que le vendeur a gagné DEPUIS TOUJOURS : ce qui dort sous séquestre,
       ce qui l'attend, et ce qu'il a déjà touché. Retirer `dejaVerse` ferait
       diminuer un cumul historique à chaque versement, ce qui se lirait comme
       une perte. */
    totalGagne: fondsSecurises + soldeDisponible + dejaVerse,
  };
}
