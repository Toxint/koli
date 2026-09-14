import type { Devise } from "@/data/markets";
import { DEVISES_OUVERTES } from "@/data/markets";

/**
 * Les règles du versement au vendeur (§43) — la DÉCISION, séparée du transport.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Ce fichier ne touche ni la base, ni le réseau. C'est ce qui le rend    │
 * │  éprouvable sans `DATABASE_URL` — et un contrôle qu'on ne peut pas      │
 * │  lancer est un contrôle qu'on ne lance pas.                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * C'est le même découpage que `motifDeNonEnvoi` pour les courriels : la règle
 * d'un côté, l'écriture de l'autre. Elle vivait dans l'action, au milieu des
 * requêtes, à l'endroit le plus difficile à lire et le seul qu'on ne pouvait
 * pas éprouver.
 */

/**
 * Le minimum demandable — **4 000, décidé par l'utilisateur le 12 septembre
 * 2026.**
 *
 * Un versement coûte des frais au prestataire, et ces frais ne dépendent pas
 * du montant : sous un certain seuil, KOLI paierait pour faire sortir une
 * somme qui ne vaut pas le transfert.
 *
 * ⚠ **C'est UN nombre pour DEUX monnaies, et cela ne tient que parce que la
 * zone ouverte est le franc CFA.** XOF et XAF sont arrimés à l'euro au même
 * taux : 4 000 de l'un valent exactement 4 000 de l'autre.
 *
 * Le jour où une autre monnaie s'ouvrira, ce seuil devra devenir un montant
 * PAR DEVISE. 4 000 CDF valent environ 1 000 XOF — le quart de l'intention —
 * et 4 000 NGN à peu près autant. Un seuil unique y deviendrait, selon le
 * pays, une barrière infranchissable ou une passoire. `refusDeVersement` le
 * refuse explicitement plutôt que de laisser le cas passer en silence.
 */
export const VERSEMENT_MINIMUM = 4000;

/**
 * Le délai PROMIS au vendeur, en heures — **24, décidé le 14 septembre 2026.**
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Ce délai n'est PAS celui du prestataire : iKeePay exécute un payout     │
 * │  « instantanément » (leur réponse du 13 septembre 2026). C'est le nôtre, │
 * │  celui d'un être humain qui exécute la demande à la main (§43).          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'utilisateur l'a formulé ainsi : un vendeur africain a besoin de son argent
 * « à chaque instant » pour racheter du stock et payer ses publicités. Trois
 * jours ouvrés seraient confortables pour l'administration et coûteux pour lui
 * — or c'est lui qui raconte son expérience autour de lui.
 *
 * ⚠ **Il est écrit ICI et nulle part ailleurs.** Les conditions d'utilisation
 * et l'écran de solde le lisent : une promesse recopiée à deux endroits finit
 * par dire deux choses, et c'est celle des conditions qui engage.
 *
 * ⚠ **Le raccourcir est une décision d'EXPLOITATION, pas de code.** Promettre
 * six heures oblige à traiter les demandes six fois par jour, week-ends
 * compris. Tenir 24 heures vaut mieux que manquer 6.
 */
export const DELAI_VERSEMENT_HEURES = 24;

export interface DemandeDeVersement {
  /** Ce que le vendeur peut demander MAINTENANT, demandes en cours déduites. */
  versable: number;
  /** Ce qu'il demande. */
  montant: number;
  /** La devise du vendeur. */
  devise: Devise;
  /** Une demande est-elle déjà en attente ? */
  demandeEnCours: boolean;
  /** Le numéro Mobile Money saisi, tel quel. */
  telephone: string;
}

/**
 * Le motif qui EMPÊCHE le versement, ou `null` si rien ne l'empêche.
 *
 * ── L'ORDRE des motifs n'est pas arbitraire ─────────────────────────────────
 *
 * Il va du plus général au plus particulier. Un vendeur qui a déjà une demande
 * en cours ET un montant trop faible doit lire « une demande est déjà en
 * cours » : c'est le fait qui explique le reste, et corriger le montant ne lui
 * servirait à rien.
 *
 * Un motif qui change selon un détail sans rapport rend l'écran incompréhensible
 * — et c'est le même raisonnement que pour `motifDeNonEnvoi`, où l'inversion de
 * deux tests avait suffi à rendre le registre illisible.
 */
export function refusDeVersement(d: DemandeDeVersement): string | null {
  /*
   * ⚠ La devise d'abord, et c'est une garde de CODE, pas d'interface.
   *
   * Le seuil est un nombre unique, valable pour le franc CFA seul. Si une
   * autre monnaie arrive sans que ce fichier soit revu, le seuil devient faux
   * — et faux SILENCIEUSEMENT, ce qui est la pire des deux manières.
   */
  if (!DEVISES_OUVERTES.includes(d.devise)) {
    return "Les versements ne sont pas encore ouverts dans cette monnaie.";
  }

  /* Une seule demande à la fois. Sans cela, deux demandes successives
     viderraient le même solde deux fois : la seconde serait acceptée avant que
     la première ne soit exécutée, et le solde ne les verrait ni l'une ni
     l'autre. */
  if (d.demandeEnCours) {
    return "Une demande de versement est déjà en cours. Elle doit être traitée avant la suivante.";
  }

  if (!Number.isInteger(d.montant) || d.montant <= 0) {
    return "Indiquez le montant à verser.";
  }

  if (d.montant < VERSEMENT_MINIMUM) {
    return `Le versement minimum est de ${VERSEMENT_MINIMUM.toLocaleString("fr-FR")}. Laissez votre solde grandir un peu.`;
  }

  /*
   * ⚠ On compare au VERSABLE, jamais au solde disponible.
   *
   * Le versable est le solde MOINS les demandes en cours. Comparer au solde
   * laisserait demander deux fois la même somme — c'est exactement ce que la
   * garde précédente empêche, et les deux doivent tenir ensemble : celle-ci
   * protège du cas où une demande aurait été créée entre-temps.
   */
  if (d.montant > d.versable) {
    return "Ce montant dépasse ce que vous pouvez retirer aujourd'hui.";
  }

  /*
   * Le numéro est la DESTINATION de l'argent.
   *
   * On ne le valide pas au-delà de sa forme : les indicatifs et les longueurs
   * varient d'un opérateur à l'autre, et refuser un numéro valide au motif
   * qu'il ne ressemble pas à ce qu'on attendait bloquerait un vendeur sans
   * recours. Ce qu'on exige, c'est qu'il y ait des chiffres en nombre
   * plausible — un champ vide ou « 06 » n'est pas une destination.
   */
  const chiffres = d.telephone.replace(/\D/g, "");
  if (chiffres.length < 8) {
    return "Indiquez le numéro Mobile Money sur lequel recevoir l'argent.";
  }

  return null;
}
