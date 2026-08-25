import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  ConfirmPaymentOptions,
  InitiatePaymentInput,
  PaymentIntent,
  PaymentProvider,
  RappelVerifie,
} from "./PaymentProvider";

/**
 * Fournisseur de paiement SIMULÉ — le seul disponible dans le MVP.
 *
 * §1, §21, §75, §84 : aucun argent réel n'est traité tant que le partenaire
 * financier et le cadre réglementaire ne sont pas validés. Ce fournisseur ne
 * contacte aucun service externe et ne déplace aucun fonds.
 *
 * Le résultat est piloté par le choix explicite de l'utilisateur au checkout,
 * jamais par un tirage aléatoire : un test doit être reproductible.
 *
 * Volontairement **sans état** : la source de vérité est la table `Payment`.
 * Cela évite toute dépendance à une mémoire de processus, qui ne survivrait
 * pas en environnement sans serveur.
 *
 * `asynchrone: false` — il répond immédiatement. Les écrans s'y adaptent :
 * inutile d'afficher « validez sur votre téléphone » quand rien ne sera
 * demandé au client.
 *
 * **La vérification de signature est néanmoins implémentée pour de bon.** Elle
 * pourrait être un `return { valide: true }` puisque aucun rappel réel
 * n'arrive — mais alors le chemin le plus dangereux du système ne serait
 * jamais éprouvé, et le jour du branchement on découvrirait qu'il ne tient
 * pas. Le test la met à l'épreuve avec des signatures fausses.
 */
export class TestPaymentProvider implements PaymentProvider {
  readonly id = "TEST";
  readonly asynchrone = false;

  /**
   * Secret de signature des rappels.
   *
   * En mode test il a une valeur de repli, sans conséquence : aucun argent
   * n'est en jeu et aucun rappel externe n'arrive. Une implémentation réelle
   * DOIT échouer bruyamment si le secret manque, comme le fait déjà
   * `AUTH_SECRET` — un secret absent qui se remplace silencieusement est un
   * contrôle qui rassure à tort.
   */
  private get secret(): string {
    return process.env.PAYMENT_WEBHOOK_SECRET ?? "secret-de-test-koli";
  }

  async initiate(input: InitiatePaymentInput): Promise<PaymentIntent> {
    return {
      providerRef: `test_${input.orderReference}_${randomUUID()}`,
      status: "PENDING",
      amount: input.amount,
    };
  }

  async confirm(
    providerRef: string,
    options?: ConfirmPaymentOptions
  ): Promise<PaymentIntent> {
    const abouti = options?.simulateOutcome === "SUCCESS";

    return {
      providerRef,
      status: abouti ? "SUCCEEDED" : "FAILED",
      // Le montant fait foi côté base (table `Payment`) ; le fournisseur test
      // ne le rejoue pas, pour éviter toute divergence silencieuse.
      amount: 0,
      ...(abouti ? {} : { failureReason: "Paiement simulé refusé." }),
    };
  }

  /**
   * Le fournisseur test ne garde rien : il ne peut donc rien relire.
   *
   * `null` est la réponse honnête — « je ne sais pas » — et le rapprochement
   * la traite comme telle : il ne conclut rien. Renvoyer SUCCEEDED par défaut
   * ferait valider des paiements qui n'ont jamais eu lieu.
   */
  async consulter(): Promise<PaymentIntent | null> {
    return null;
  }

  /**
   * Vérifie la signature d'un rappel.
   *
   * HMAC-SHA256 du corps BRUT. Le corps brut, et non l'objet re-sérialisé :
   * repasser par `JSON.stringify` change l'ordre des clefs et les espaces, ce
   * qui invalide une signature pourtant correcte — panne classique, et
   * particulièrement pénible à diagnostiquer.
   *
   * Comparaison à **temps constant** : une comparaison de chaînes ordinaire
   * s'arrête au premier caractère différent, et le temps de réponse révèle
   * alors combien de caractères étaient justes. On reconstitue une signature
   * octet par octet avec quelques milliers de requêtes.
   */
  async verifierRappel(
    corpsBrut: string,
    entetes: Record<string, string>
  ): Promise<RappelVerifie> {
    const fournie = entetes["x-koli-signature"] ?? entetes["X-Koli-Signature"];

    if (!fournie) {
      return { valide: false, motif: "Signature absente." };
    }

    const attendue = createHmac("sha256", this.secret)
      .update(corpsBrut, "utf8")
      .digest("hex");

    const a = Buffer.from(fournie, "utf8");
    const b = Buffer.from(attendue, "utf8");

    // `timingSafeEqual` exige des longueurs égales : on teste la longueur
    // d'abord, ce qui ne divulgue rien d'exploitable — la longueur d'un HMAC
    // est publique.
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valide: false, motif: "Signature invalide." };
    }

    let charge: {
      providerRef?: unknown;
      status?: unknown;
      amount?: unknown;
      failureReason?: unknown;
    };

    try {
      charge = JSON.parse(corpsBrut);
    } catch {
      return { valide: false, motif: "Corps illisible." };
    }

    if (typeof charge.providerRef !== "string" || !charge.providerRef) {
      return { valide: false, motif: "Référence de transaction absente." };
    }

    // Liste blanche : un état inconnu ne doit pas être écrit tel quel en base.
    const etats = ["PENDING", "AWAITING_CUSTOMER", "SUCCEEDED", "FAILED", "EXPIRED"];
    if (typeof charge.status !== "string" || !etats.includes(charge.status)) {
      return { valide: false, motif: "État inconnu." };
    }

    return {
      valide: true,
      intent: {
        providerRef: charge.providerRef,
        status: charge.status as PaymentIntent["status"],
        amount: typeof charge.amount === "number" ? charge.amount : 0,
        ...(typeof charge.failureReason === "string"
          ? { failureReason: charge.failureReason }
          : {}),
      },
    };
  }

  /**
   * Fabrique une signature valide — RÉSERVÉ AUX TESTS.
   *
   * Elle vit ici plutôt que dans le fichier de test pour une raison précise :
   * si l'algorithme de signature change et que le test garde sa propre copie,
   * le test continue de passer en vérifiant un accord avec lui-même. Les deux
   * côtés doivent partager la même source.
   */
  signerPourTest(corpsBrut: string): string {
    return createHmac("sha256", this.secret).update(corpsBrut, "utf8").digest("hex");
  }
}
