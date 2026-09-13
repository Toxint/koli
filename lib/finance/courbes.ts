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
/**
 * Les DEUX séries d'encaissement du vendeur, en une seule lecture du registre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  `brut` — ce que la vente a rapporté.                                    │
 * │  `net`  — ce que le vendeur touche, commission déduite.                  │
 * │  L'écart entre les deux courbes EST la commission KOLI.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Deux séries, mais UNE SEULE échelle** — et c'est ce qui les rend
 * superposables. La règle du projet interdit deux ÉCHELLES sur un même cadre,
 * pas deux courbes : un montant et un nombre de commandes exigeraient deux
 * axes verticaux, et deux axes font dire à un graphique ce qu'on veut. Ici les
 * deux séries sont le même argent, dans la même monnaie, à quelques pour cent
 * l'une de l'autre.
 *
 * ⚠ **C'est aussi ce qui garde l'échelle honnête.** Une seconde série d'un
 * autre ordre de grandeur — le séquestre, le volume de commandes — écraserait
 * la courbe des revenus au ras du zéro. `verif:courbes` refuse un plafond au
 * delà du double du plus fort jour, et il a raison.
 *
 * Les deux sortent du MÊME parcours de lignes : elles ne peuvent pas diverger
 * par un filtre oublié d'un côté.
 */
export async function chargerEncaissementsVendeur(
  sellerId: string,
  jours = 14
): Promise<{ net: PointJour[]; brut: PointJour[] }> {
  const depuis = minuitMoins(jours - 1);

  const lignes = await prisma.transaction.findMany({
    where: {
      type: { in: ["FUNDS_RELEASED", "COMMISSION"] },
      createdAt: { gte: depuis },
      order: { sellerId },
    },
    select: { amount: true, createdAt: true, type: true },
  });

  const parJourNet = new Map<string, number>();
  const parJourBrut = new Map<string, number>();

  for (const l of lignes) {
    const cle = cleJour(l.createdAt);

    // La commission s'écrit en négatif (`preleverCommission`), mais on ne s'y
    // fie pas : `chargerSoldeVendeur` se protège déjà de la même façon. Une
    // ligne ancienne écrite dans l'autre sens ferait ici l'inverse de ce qu'on
    // attend — la commission s'AJOUTERAIT au lieu d'être retranchée, et la
    // courbe culminerait au-dessus du solde annoncé sur le même écran.
    const montant = l.type === "COMMISSION" ? -Math.abs(l.amount) : l.amount;
    parJourNet.set(cle, (parJourNet.get(cle) ?? 0) + montant);

    // Le BRUT ignore la commission : c'est la libération seule.
    if (l.type === "FUNDS_RELEASED") {
      parJourBrut.set(cle, (parJourBrut.get(cle) ?? 0) + l.amount);
    }
  }

  return {
    net: serieComplete(jours, parJourNet),
    brut: serieComplete(jours, parJourBrut),
  };
}

/**
 * Ce qui ENTRE sous séquestre, jour par jour.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  C'est l'autre moitié de l'histoire KOLI : l'argent arrive au paiement   │
 * │  (`securedAt`), il repart au vendeur à la confirmation de réception.     │
 * │  Entre les deux, il dort — et le délai varie d'une commande à l'autre.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Posée à côté des libérations, cette série dit d'un coup d'œil ce qu'aucun
 * compteur ne dit : si l'écart se creuse, c'est que les clients ne confirment
 * pas leur réception, et que l'argent s'accumule sans être versé.
 *
 * **Même monnaie, même ordre de grandeur, donc même axe.** La règle du projet
 * interdit deux ÉCHELLES sur un cadre — un montant et un nombre de commandes ;
 * deux montants du même commerce y sont chez eux.
 *
 * ⚠ On lit `securedAt` et non `createdAt` : un séquestre est créé avec la
 * commande, parfois des heures avant que le paiement n'aboutisse. Le jour qui
 * compte est celui où l'argent est réellement arrivé.
 */
export async function chargerSequestreParJour(
  sellerId: string,
  jours = 14
): Promise<PointJour[]> {
  const depuis = minuitMoins(jours - 1);

  const fonds = await prisma.fund.findMany({
    where: { sellerId, secured: true, securedAt: { gte: depuis } },
    select: { amount: true, securedAt: true },
  });

  const parJour = new Map<string, number>();
  for (const f of fonds) {
    if (!f.securedAt) continue;
    const cle = cleJour(f.securedAt);
    parJour.set(cle, (parJour.get(cle) ?? 0) + f.amount);
  }

  return serieComplete(jours, parJour);
}

/**
 * La série NETTE seule — ce que la plupart des appelants veulent.
 *
 * Elle reste exportée sous ce nom parce que plusieurs écrans et
 * `verif:courbes` s'y accrochent, et qu'un second parcours du registre serait
 * une seconde occasion de se tromper : elle lit `chargerEncaissementsVendeur`.
 */
export async function chargerCourbeVendeur(
  sellerId: string,
  jours = 14
): Promise<PointJour[]> {
  return (await chargerEncaissementsVendeur(sellerId, jours)).net;
}

/**
 * Ce que le livreur a gagné, jour par jour.
 *
 * Uniquement ses `DRIVER_PAYOUT` : le §25 interdit de lui montrer des
 * informations financières qui ne le concernent pas, et la valeur des colis
 * qu'il transporte en fait partie.
 */
/**
 * Ce que rend la courbe d'un livreur.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Un livreur peut travailler pour des vendeurs de pays différents.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ses paies sont alors dans plusieurs monnaies, et les additionner sur une même
 * courbe donnerait une ligne qui ne mesure rien : 5 000 francs CFA et
 * 5 000 francs congolais ne font pas 10 000 de quoi que ce soit, et le second
 * vaut le quart du premier.
 *
 * La courbe ne retient donc QUE la monnaie dominante, et `melange` dit qu'il y
 * en avait d'autres. L'écran l'annonce plutôt que de laisser croire à un total
 * complet — un livreur qui compare sa paie réelle à ce chiffre doit savoir
 * pourquoi ils diffèrent.
 */
export interface CourbeLivreur {
  points: PointJour[];
  /** La monnaie retenue. `null` si le livreur n'a aucune paie sur la période. */
  devise: string | null;
  /** Vrai si des paies dans d'autres monnaies ont été écartées. */
  melange: boolean;
}

export async function chargerCourbeLivreur(
  driverProfileId: string,
  jours = 14
): Promise<CourbeLivreur> {
  const depuis = minuitMoins(jours - 1);

  const lignes = await prisma.transaction.findMany({
    where: {
      type: "DRIVER_PAYOUT",
      createdAt: { gte: depuis },
      order: { delivery: { driverId: driverProfileId } },
    },
    select: { amount: true, createdAt: true, currency: true },
  });

  // La monnaie DOMINANTE, par le montant cumulé et non par le nombre de
  // courses : dix petites livraisons ne font pas la monnaie principale de
  // quelqu'un qui gagne l'essentiel sur deux grosses.
  /*
   * Une ecriture sans devise ne peut pas exister — la colonne est NOT NULL —
   * mais si elle existait, la comparaison plus bas les ecarterait TOUTES et
   * la courbe tomberait a zero sans un mot. On les rattache au franc CFA, qui
   * est ce que portaient toutes les ecritures d avant la colonne.
   */
  const deviseDe = (c: string | null | undefined) => c ?? "XOF";

  const parDevise = new Map<string, number>();
  for (const l of lignes) {
    const d = deviseDe(l.currency);
    parDevise.set(d, (parDevise.get(d) ?? 0) + l.amount);
  }

  const dominante =
    [...parDevise.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const parJour = new Map<string, number>();
  for (const l of lignes) {
    if (deviseDe(l.currency) !== dominante) continue;
    const cle = cleJour(l.createdAt);
    parJour.set(cle, (parJour.get(cle) ?? 0) + l.amount);
  }

  return {
    points: serieComplete(jours, parJour),
    devise: dominante,
    melange: parDevise.size > 1,
  };
}
