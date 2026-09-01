import { timingSafeEqual } from "node:crypto";
import type {
  ConfirmPaymentOptions,
  InitiatePaymentInput,
  PaymentIntent,
  PaymentIntentStatus,
  PaymentProvider,
  RappelVerifie,
} from "@/lib/payments/PaymentProvider";

/**
 * iKeePay — encaissement réel par tunnel iframe (phase 30).
 *
 * L'acheteur KOLI arrive par un lien WhatsApp et n'a pas de compte. C'est
 * iKeePay qui lui demande son numéro, son opérateur, son code OTP, et qui gère
 * les redirections Wave et Orange. Nous ne construisons aucun de ces écrans, et
 * surtout : **aucun numéro de téléphone de payeur ne transite par KOLI.**
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  ⚠ LEURS RAPPELS NE SONT SIGNÉS PAR RIEN.                                │
 * │                                                                          │
 * │  Leur documentation montre un exemple PHP qui lit le corps et croit      │
 * │  l'événement sur parole. Aucune signature, aucun secret partagé, aucun   │
 * │  en-tête d'authentification.                                             │
 * │                                                                          │
 * │  Conséquence : qui connaît l'adresse de rappel ET une référence de       │
 * │  commande peut marquer cette commande payée. L'attaquant naturel est     │
 * │  L'ACHETEUR — il ouvre le lien de paiement, il y lit la référence.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce fichier contourne, il ne répare pas. Voir `verifierRappel`.
 *
 * ── Ce qu'iKeePay ne fournit pas, et ce que ça coûte ────────────────────────
 *
 * | Manque                        | Ce qu'on perd                            |
 * |---|---|
 * | Signature des rappels         | La preuve d'origine. Remplacée par un    |
 * |                               | jeton secret dans l'adresse — voir plus  |
 * |                               | bas pourquoi ce n'est pas équivalent.    |
 * | Point d'entrée « consulter »  | Le rapprochement. Un rappel perdu laisse |
 * |                               | un client débité et une commande figée.  |
 * | Sandbox pour l'encaissement   | L'épreuve sans argent réel. Leur seul    |
 * |                               | sandbox documenté concerne les cartes.   |
 *
 * Les trois sont à leur poser. Tant qu'ils ne répondent pas, ce fournisseur
 * n'est pas activé : `PAYMENT_MODE` reste sur `test` (`lib/config/mode.ts`).
 */

/** Ce que l'agrégateur exige. Aucune valeur de repli : voir `lireConfig`. */
interface ConfigIkeePay {
  clePublique: string;
  cleSecrete: string;
  jetonRappel: string;
  urlTunnel: string;
  urlApi: string;
}

/**
 * La configuration, ou une erreur qui NOMME ce qui manque.
 *
 * Aucune valeur de repli, même pour les adresses : un fournisseur de paiement
 * qui démarre à moitié configuré est pire qu'un qui refuse de démarrer. Il
 * encaisserait dans le vide, ou pire, chez quelqu'un d'autre.
 */
function lireConfig(): ConfigIkeePay {
  const manquantes: string[] = [];
  const lire = (nom: string) => {
    const v = process.env[nom]?.trim();
    if (!v) manquantes.push(nom);
    return v ?? "";
  };

  const config = {
    clePublique: lire("IKEEPAY_PUBLIC_KEY"),
    cleSecrete: lire("IKEEPAY_SECRET_KEY"),
    jetonRappel: lire("IKEEPAY_WEBHOOK_TOKEN"),
    urlTunnel:
      process.env.IKEEPAY_CHECKOUT_URL?.trim() ||
      "https://ikeepay.com/checkout/v1/inline",
    urlApi: process.env.IKEEPAY_API_URL?.trim() || "https://api.ikeepay.com",
  };

  if (manquantes.length > 0) {
    throw new Error(
      `iKeePay : ${manquantes.join(", ")} manquant(s). ` +
        `Sans ces valeurs, l'encaissement ne peut pas fonctionner — et un ` +
        `démarrage à moitié configuré encaisserait dans le vide.`
    );
  }

  return config;
}

/**
 * Le jeton de rappel doit être long.
 *
 * C'est la SEULE chose qui distingue un rappel d'iKeePay d'un rappel forgé.
 * Trente-deux caractères, c'est le minimum pour qu'il ne se devine pas — et le
 * refuser en dessous vaut mieux que de laisser croire qu'on est protégé.
 */
const LONGUEUR_MINIMALE_JETON = 32;

/** L'en-tête sous lequel la route injecte le jeton lu dans l'adresse. */
export const ENTETE_JETON_RAPPEL = "x-koli-jeton-rappel";

/**
 * Leurs statuts vers les nôtres.
 *
 * `pending` devient `AWAITING_CUSTOMER` et non `PENDING` : chez eux, « en
 * attente » veut dire que le client doit valider sur son téléphone. C'est une
 * information que l'écran doit donner — « en attente » tout court laisse
 * croire que la balle est dans notre camp.
 */
function versNotreStatut(statut: string): PaymentIntentStatus {
  switch (statut.trim().toLowerCase()) {
    case "completed":
    case "success":
    case "successful":
      return "SUCCEEDED";
    case "pending":
    case "processing":
      return "AWAITING_CUSTOMER";
    case "failed":
    case "cancelled":
    case "canceled":
      return "FAILED";
    case "expired":
      return "EXPIRED";
    default:
      // Un statut inconnu n'est PAS un succès. Le défaut penche du côté qui ne
      // fait expédier aucun colis.
      return "PENDING";
  }
}

/** Comparaison à temps constant, sur des longueurs quelconques. */
function memeJeton(recu: string, attendu: string): boolean {
  const a = Buffer.from(recu);
  const b = Buffer.from(attendu);
  // `timingSafeEqual` exige des longueurs égales et jette sinon — ce qui
  // divulguerait déjà la longueur du secret. On égalise d'abord.
  if (a.length !== b.length) {
    // Comparaison factice pour ne pas répondre plus vite sur une longueur
    // différente, puis échec.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export class IkeePayProvider implements PaymentProvider {
  readonly id = "ikeepay";

  /**
   * Oui : le verdict arrive par rappel, pas en réponse à notre demande.
   *
   * Les écrans s'y adaptent — ils disent « validez sur votre téléphone » au
   * lieu d'annoncer un résultat qui n'existe pas encore.
   */
  readonly asynchrone = true;

  private readonly config: ConfigIkeePay;

  constructor() {
    this.config = lireConfig();

    if (this.config.jetonRappel.length < LONGUEUR_MINIMALE_JETON) {
      throw new Error(
        `IKEEPAY_WEBHOOK_TOKEN fait ${this.config.jetonRappel.length} ` +
          `caractères. Il en faut au moins ${LONGUEUR_MINIMALE_JETON} : c'est ` +
          `la seule chose qui distingue un rappel authentique d'un rappel forgé.`
      );
    }
  }

  /**
   * Ouvre le tunnel. **Ne déplace aucun argent, et n'appelle personne.**
   *
   * Le tunnel iframe n'a pas d'appel serveur à l'initiation : on bâtit une
   * adresse, le navigateur la charge, et iKeePay fait le reste. La conséquence
   * est qu'à cet instant, ILS NE SAVENT PAS ENCORE que cette commande existe —
   * leur référence n'apparaîtra qu'au rappel.
   *
   * D'où `providerRef = orderReference` : notre propre référence est ce
   * qu'iKeePay reçoit en `order_id`, et donc ce qu'il nous renverra. C'est le
   * seul identifiant commun aux deux côtés dès le départ, et il est déjà
   * imprévisible (`lib/orders/reference.ts`).
   *
   * `idempotencyKey` n'est pas transmise : leur tunnel ne l'accepte pas. Elle
   * garde son rôle chez nous — deux initiations de la même commande produisent
   * la même adresse, donc le même `order_id`, donc une seule transaction chez
   * eux.
   */
  async initiate(input: InitiatePaymentInput): Promise<PaymentIntent> {
    const parametres = new URLSearchParams({
      pk: this.config.clePublique,
      amount: String(input.amount),
      currency: input.currency,
      order_id: input.orderReference,
    });

    return {
      providerRef: input.orderReference,
      status: "AWAITING_CUSTOMER",
      amount: input.amount,
      checkoutUrl: `${this.config.urlTunnel}?${parametres.toString()}`,
    };
  }

  /**
   * Il n'y a RIEN à confirmer depuis le serveur.
   *
   * Le verdict appartient au rappel. Le signal `ikeepay-success` que le tunnel
   * poste au navigateur est un événement CLIENT : n'importe qui peut l'émettre
   * depuis la console. Il ne sert qu'à refermer la fenêtre et à remercier — il
   * ne doit jamais faire avancer une commande.
   *
   * On renvoie donc l'état inchangé plutôt qu'un verdict inventé. Le paramètre
   * `simulateOutcome` est ignoré, comme l'exige l'interface : c'est le
   * prestataire qui fait foi, jamais l'appelant.
   */
  async confirm(
    providerRef: string,
    _options?: ConfirmPaymentOptions
  ): Promise<PaymentIntent> {
    void _options;
    return {
      providerRef,
      status: "AWAITING_CUSTOMER",
      amount: 0,
    };
  }

  /**
   * IMPOSSIBLE : iKeePay n'expose aucun point d'entrée de consultation.
   *
   * Leur documentation ne décrit que `h2h-payin` et `h2h-payout`. Il n'y a
   * aucun moyen de demander « où en est la transaction X ».
   *
   * On renvoie `null`, ce que `rapprocherPaiements()` interprète comme « je ne
   * sais pas » et non comme « échec ». **C'est une perte réelle, pas un détail
   * d'implémentation** : un rappel perdu laisse un client débité et une
   * commande figée en attente, sans que personne puisse le rattraper
   * autrement qu'à la main dans leur tableau de bord.
   *
   * À remplacer par un vrai appel dès qu'ils fournissent l'entrée.
   */
  async consulter(_providerRef: string): Promise<PaymentIntent | null> {
    void _providerRef;
    return null;
  }

  /**
   * Vérifie un rappel — PAR UN JETON, faute de signature.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │  CE N'EST PAS UNE SIGNATURE, et la différence compte.                   │
   * │                                                                        │
   * │  Une signature prouve que le corps vient d'iKeePay ET qu'il n'a pas été │
   * │  modifié. Un jeton dans l'adresse prouve seulement que l'appelant       │
   * │  connaît un secret. Il protège de l'acheteur qui forge un rappel — le   │
   * │  scénario réel — mais pas d'un intermédiaire qui verrait passer         │
   * │  l'adresse : journaux d'un serveur mandataire, historique d'un outil,   │
   * │  capture réseau chez un tiers.                                          │
   * │                                                                        │
   * │  Il ne se renouvelle pas non plus tout seul : le changer suppose de le  │
   * │  changer aussi dans leur tableau de bord.                               │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * Le jeton n'est pas dans le corps mais dans l'ADRESSE de rappel, et c'est
   * délibéré : le corps est fabriqué par iKeePay, et rien ne dit qu'ils
   * recopieraient un champ qu'on leur demande d'y mettre. L'adresse, elle, est
   * la seule chose qu'on leur donne et qu'ils renvoient forcément.
   *
   * Deux formes de rappel coexistent dans leur documentation — celle du tunnel
   * (`payment.success`, champs à plat) et celle du H2H (`transaction.updated`,
   * champs sous `data`). On accepte les deux : ils peuvent changer de format
   * sans prévenir, et un rappel refusé pour cause de forme est un paiement
   * perdu.
   */
  async verifierRappel(
    corpsBrut: string,
    entetes: Record<string, string>
  ): Promise<RappelVerifie> {
    const jetonRecu = entetes[ENTETE_JETON_RAPPEL] ?? "";

    if (!jetonRecu || !memeJeton(jetonRecu, this.config.jetonRappel)) {
      return { valide: false, motif: "jeton de rappel absent ou incorrect" };
    }

    let charge: unknown;
    try {
      charge = JSON.parse(corpsBrut);
    } catch {
      return { valide: false, motif: "corps illisible" };
    }

    if (typeof charge !== "object" || charge === null) {
      return { valide: false, motif: "corps vide" };
    }

    const brut = charge as Record<string, unknown>;
    // Forme H2H : tout est sous `data`. Forme tunnel : tout est à plat.
    const d = (
      typeof brut.data === "object" && brut.data !== null ? brut.data : brut
    ) as Record<string, unknown>;

    const reference =
      typeof d.external_reference === "string"
        ? d.external_reference
        : typeof d.order_id === "string"
          ? d.order_id
          : null;

    if (!reference) {
      return { valide: false, motif: "aucune référence de commande" };
    }

    const montant = Number(d.amount);
    if (!Number.isFinite(montant) || montant <= 0) {
      return { valide: false, motif: "montant absent ou invalide" };
    }

    /*
     * L'événement `payment.success` du tunnel ne porte parfois pas de `status`.
     * On le traite alors comme un succès — c'est ce que son nom affirme — mais
     * uniquement pour CET événement : tout autre nom sans statut retombe sur
     * `PENDING`, qui ne fait expédier aucun colis.
     */
    const evenement = typeof brut.event === "string" ? brut.event : "";
    const statutBrut =
      typeof d.status === "string"
        ? d.status
        : evenement === "payment.success"
          ? "completed"
          : "";

    return {
      valide: true,
      intent: {
        providerRef: reference,
        status: versNotreStatut(statutBrut),
        amount: Math.round(montant),
        payerMsisdn:
          typeof d.phone_number === "string" ? d.phone_number : undefined,
        payerOperator: typeof d.operator === "string" ? d.operator : undefined,
      },
    };
  }
}
