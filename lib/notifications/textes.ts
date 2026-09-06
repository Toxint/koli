import type { NotificationType } from "@prisma/client";

/**
 * LES TEXTES, et rien d'autre.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Séparés de l'expédition parce qu'ils sont PURS : aucune base, aucun     │
 * │  réseau, aucune session.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce sont les premiers mots que KOLI adresse à un vendeur, et ils portent deux
 * règles qu'aucun autre contrôle ne regarde : le §25 — le livreur ne voit
 * jamais la valeur de ce qu'il transporte — et le silence sur la commission,
 * décidé le 6 septembre 2026.
 *
 * Les éprouver ne doit donc demander ni base de données ni clef d'API. Un
 * contrôle qu'on ne peut pas lancer est un contrôle qu'on ne lance pas — et
 * `courriel.ts` importe `prisma`, ce qui exige `DATABASE_URL` au chargement.
 */
/**
 * Ce que porte chaque notification.
 *
 * `corps` reçoit la référence ET les montants du registre. Chaque texte prend
 * CELUI QUI LE CONCERNE — et le livreur n'en prend aucun.
 */
export interface MontantsDeLaCommande {
  /** Ce que l'acheteur a réglé : marchandise + livraison. */
  paye: string | null;
  /** Ce qui est retenu pour le vendeur : la marchandise, hors livraison. */
  sequestre: string | null;
  /** Ce que le vendeur a réellement touché, commission déduite. */
  libereNet: string | null;
  /** Ce qui a été rendu à l'acheteur. */
  rembourse: string | null;
}

export const MESSAGES: Partial<
  Record<
    NotificationType,
    { objet: string; corps: (ref: string, m: MontantsDeLaCommande) => string }
  >
> = {
  FUNDS_SECURED: {
    objet: "Vous avez une vente",
    corps: (ref, m) =>
      `Un client vient de payer la commande ${ref}.${
        m.sequestre ? ` ${m.sequestre} sont sécurisés pour vous.` : ""
      } Vous pouvez préparer et expédier : vous serez payé à la confirmation de réception.`,
  },
  PAYMENT_CONFIRMED: {
    objet: "Votre paiement est confirmé",
    corps: (ref, m) =>
      `Votre paiement${m.paye ? ` de ${m.paye}` : ""} pour la commande ${ref} est bien arrivé. Le montant est conservé par KOLI jusqu'à ce que vous confirmiez avoir reçu votre colis — le vendeur n'est pas payé avant.`,
  },
  /*
   * ⚠ AUCUN MONTANT ICI, et c'est le §25.
   *
   * Le livreur ne doit jamais voir la valeur de ce qu'il transporte. La règle
   * existe déjà à l'écran — `verif:courbes` la vérifie sur son tableau de bord
   * — et un courriel est un écran de plus, celui qui voyage le mieux : il se
   * montre, se transfère, se lit par-dessus l'épaule.
   *
   * Ce texte reçoit `m` comme les autres et n'en prend rien. C'est délibéré :
   * une signature commune rend la comparaison possible d'un coup d'œil.
   */
  ORDER_ACCEPTED: {
    objet: "Une livraison vous est confiée",
    corps: (ref) =>
      `La commande ${ref} vous a été assignée. Retrouvez l'adresse et le détail dans votre espace livreur.`,
  },
  DELIVERED: {
    objet: "Votre colis est arrivé",
    corps: (ref) =>
      `Le livreur a marqué la commande ${ref} comme livrée. Confirmez la réception avec votre code pour que le vendeur soit payé.`,
  },
  /*
   * La COMMISSION n est pas nommee ici, et c est un choix.
   *
   * Le chiffre annonce est celui que le vendeur touche — c est la seule chose
   * qu il ait besoin de savoir a cet instant, et c est vrai sans reserve. Le
   * detail de ce qui a ete retenu vit dans son solde et dans son journal, ou il
   * peut le regarder posement plutot que de l apprendre dans un courriel.
   *
   * ⚠ Ce que ce silence coute : un vendeur qui a vu « 1 000 FC sont securises »
   * et lit ensuite « 950 FC vous ont ete liberes » verra l ecart et pourra le
   * demander. La reponse est a un clic dans son solde, ou la commission figure
   * en toutes lettres (§40). Si la question revient souvent, c est ce silence
   * qu il faudra revoir, pas le montant.
   */
  FUNDS_RELEASED: {
    objet: "Vous avez été payé",
    corps: (ref, m) =>
      `Les fonds de la commande ${ref} vous ont été libérés${
        m.libereNet ? ` : ${m.libereNet}` : ""
      }. Le détail est dans votre solde.`,
  },
  DISPUTE_OPEN: {
    objet: "Un litige a été ouvert",
    corps: (ref, m) =>
      `Un litige concerne la commande ${ref}.${
        m.sequestre ? ` ${m.sequestre} restent bloqués` : " Les fonds restent bloqués"
      } tant que KOLI n'a pas tranché.`,
  },
  REFUND: {
    objet: "Un remboursement a été traité",
    corps: (ref, m) =>
      `Le remboursement de la commande ${ref} a été traité${
        m.rembourse ? ` : ${m.rembourse}` : ""
      }.`,
  },
};

/**
 * Les types qui ne partent DÉLIBÉRÉMENT pas par courriel.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Ce ne sont pas des textes qu'on a oublié d'écrire.                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce sont les étapes de la livraison. Les écrire ferait quatre courriels de
 * plus par commande — « colis prêt », « ramassé », « en route », « arrivé » —
 * pour une information que l'acheteur peut suivre dans l'application, et qui ne
 * lui demande rien. Un service qui écrit trop finit dans les indésirables, et
 * emporte avec lui les trois messages qui comptaient vraiment.
 *
 * `ARRIVED` est le cas limite : le schéma le décrit comme « le moment où le
 * client doit AGIR ». Mais le livreur est devant sa porte — c'est le livreur qui
 * le lui dit, pas un courriel qui arrivera peut-être dans dix minutes.
 *
 * ⚠ Cette liste existe pour que le registre distingue un CHOIX d'un OUBLI. Sans
 * elle, `sendError` disait « aucun texte pour ce type » dans les deux cas, et
 * la prochaine lecture aurait corrigé le choix en croyant réparer l'oubli.
 */
export const SANS_COURRIEL: NotificationType[] = [
  "PACKAGE_READY",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED",
  "CUSTOMER_CONFIRMED",
];

/**
 * Les domaines FICTIFS, vers lesquels on n'écrit jamais.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Le jeu de démonstration crée `vendeur@koli.ci`, `client@koli.ci`…       │
 * │  Un domaine que nous ne possédons pas.                                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Chaque campagne de vérification crée des ventes, donc des notifications. Sans
 * ce garde, elle expédierait à chaque passage une dizaine de courriels vers des
 * boîtes qui n'existent pas — et chaque rebond abîme la réputation d'envoi du
 * domaine, celle-là même qui décide si un vrai vendeur trouve le message dans
 * sa boîte ou dans ses indésirables.
 *
 * Un expéditeur neuf n'a droit qu'à peu d'erreurs. Les dépenser en tests serait
 * dommage.
 *
 * ⚠ Une liste EXPLICITE, et non une devinette sur ce qui ressemble à un test.
 * Un filtre malin — « les adresses contenant *test* » — écarterait un jour le
 * courriel d'un vrai commerçant qui s'appelle Testa.
 */
const DOMAINES_FICTIFS = ["koli.ci", "exemple.ci", "example.com", "test.local"];

export function estFictive(adresse: string): boolean {
  const domaine = adresse.split("@")[1]?.toLowerCase() ?? "";
  return DOMAINES_FICTIFS.includes(domaine);
}
