import { prisma } from "@/lib/db/prisma";

/**
 * Séries quotidiennes pour les courbes des tableaux de bord.
 *
 * **Une seule mesure par courbe, jamais deux.** Superposer un montant en FCFA
 * et un nombre de commandes exigerait deux échelles verticales sur le même
 * cadre — et deux échelles font dire à un graphique ce qu'on veut. Les
 * compteurs voisins portent déjà les nombres ; la courbe porte l'argent.
 *
 * Les jours SANS activité valent zéro et sont présents dans la série. Sauter
 * les jours vides resserrerait l'axe du temps sans le dire : deux points
 * voisins pourraient être séparés d'une semaine, et la pente entre eux serait
 * un mensonge.
 */
export interface PointJour {
  /** Minuit de ce jour-là. */
  jour: Date;
  /** Montant en FCFA. Zéro si rien ne s'est passé. */
  montant: number;
}

/** Minuit, heure du serveur, il y a `recul` jours. */
function minuitMoins(recul: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - recul);
  return d;
}

/** Clé de regroupement, stable quel que soit le fuseau du serveur. */
function cleJour(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Construit la série complète, un point par jour, du plus ancien au plus
 * récent — y compris les jours sans rien.
 */
function serieComplete(
  jours: number,
  parJour: Map<string, number>
): PointJour[] {
  const points: PointJour[] = [];

  for (let i = jours - 1; i >= 0; i--) {
    const jour = minuitMoins(i);

    // `Math.max(0, …)` pour la même raison que dans `chargerSoldeVendeur` : un
    // total négatif n'a aucun sens à l'écran. Ici il serait pire qu'alarmant —
    // la ligne passerait SOUS sa propre base, hors du cadre, et le lecteur
    // verrait une courbe amputée sans savoir pourquoi.
    points.push({ jour, montant: Math.max(0, parJour.get(cleJour(jour)) ?? 0) });
  }

  return points;
}

/**
 * Ce que le vendeur a réellement gagné, jour par jour.
 *
 * **Net de commission**, pas brut. Le tableau de bord lui annonce un solde
 * disponible déjà amputé : une courbe qui montrerait le brut culminerait
 * au-dessus de ce chiffre, et il verrait deux montants différents pour la même
 * journée.
 *
 * On additionne donc les écritures du journal — `FUNDS_RELEASED` en positif,
 * `COMMISSION` en négatif — plutôt que de relire les séquestres. C'est le même
 * registre que celui de la page Transactions, donc les deux ne peuvent pas
 * diverger.
 *
 * `REFUND` en est absent, et ce n'est pas un oubli : un remboursement éteint
 * un séquestre que le vendeur n'avait pas encore touché — l'argent ne lui
 * revient pas, il ne le lui est donc pas repris. Le retrancher ici creuserait
 * un creux dans une journée où il n'a rien perdu.
 */
export async function chargerCourbeVendeur(
  sellerId: string,
  jours = 14
): Promise<PointJour[]> {
  const depuis = minuitMoins(jours - 1);

  const lignes = await prisma.transaction.findMany({
    where: {
      type: { in: ["FUNDS_RELEASED", "COMMISSION"] },
      createdAt: { gte: depuis },
      order: { sellerId },
    },
    select: { amount: true, createdAt: true, type: true },
  });

  const parJour = new Map<string, number>();

  for (const l of lignes) {
    // La commission s'écrit en négatif (`preleverCommission`), mais on ne s'y
    // fie pas : `chargerSoldeVendeur` se protège déjà de la même façon. Une
    // ligne ancienne écrite dans l'autre sens ferait ici l'inverse de ce qu'on
    // attend — la commission s'AJOUTERAIT au lieu d'être retranchée, et la
    // courbe culminerait au-dessus du solde annoncé sur le même écran.
    const montant = l.type === "COMMISSION" ? -Math.abs(l.amount) : l.amount;

    const cle = cleJour(l.createdAt);
    parJour.set(cle, (parJour.get(cle) ?? 0) + montant);
  }

  return serieComplete(jours, parJour);
}

/**
 * Ce que le livreur a gagné, jour par jour.
 *
 * Uniquement ses `DRIVER_PAYOUT` : le §25 interdit de lui montrer des
 * informations financières qui ne le concernent pas, et la valeur des colis
 * qu'il transporte en fait partie.
 */
export async function chargerCourbeLivreur(
  driverProfileId: string,
  jours = 14
): Promise<PointJour[]> {
  const depuis = minuitMoins(jours - 1);

  const lignes = await prisma.transaction.findMany({
    where: {
      type: "DRIVER_PAYOUT",
      createdAt: { gte: depuis },
      order: { delivery: { driverId: driverProfileId } },
    },
    select: { amount: true, createdAt: true },
  });

  const parJour = new Map<string, number>();

  for (const l of lignes) {
    const cle = cleJour(l.createdAt);
    parJour.set(cle, (parJour.get(cle) ?? 0) + l.amount);
  }

  return serieComplete(jours, parJour);
}
