import { NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getPaymentProvider } from "@/lib/config/mode";
import { ENTETE_JETON_RAPPEL } from "@/lib/payments/IkeePayProvider";
import { appliquerAboutissement } from "@/lib/payments/aboutissement";
import { convertir } from "@/lib/finance/change";
import { commeDevise } from "@/data/markets";
import { ACTIONS_AUDIT, consigner } from "@/lib/audit/journal";

/**
 * Rappel du fournisseur de paiement (webhook) — §29, §52.
 *
 * **C'est la porte d'entrée la plus dangereuse du système.** Un rappel accepté
 * sans preuve d'origine permettrait à quiconque de marquer une commande payée,
 * donc de faire expédier un colis sans jamais payer. Tout ce qui suit découle
 * de cette phrase.
 *
 * Six règles, et aucune n'est décorative :
 *
 * **1. Le corps est lu BRUT**, avant tout `JSON.parse`. La signature porte sur
 * les octets reçus ; re-sérialiser change l'ordre des clefs et les espaces, et
 * invalide une signature pourtant correcte.
 *
 * **2. La signature est vérifiée avant toute autre chose.** Pas de recherche
 * en base, pas de journalisation du contenu : un corps non authentifié n'a
 * aucune valeur, pas même documentaire.
 *
 * **3. La réponse ne dit rien.** Même code, même corps, que la référence
 * existe ou non. Un message différent transformerait ce point d'entrée en
 * oracle : on saurait quelles références existent en observant les réponses.
 *
 * **4. Le MONTANT est vérifié.** Un rappel authentique mais portant un montant
 * différent de la commande n'est pas traité — c'est le signe d'un paiement
 * partiel ou d'une transaction croisée.
 *
 * **5. L'écriture est conditionnelle.** Les agrégateurs rejouent leurs
 * rappels, parfois dans le désordre. Un paiement déjà conclu n'est jamais
 * repris : sinon un rappel « en attente » arrivé en retard écraserait un
 * succès.
 *
 * **6. On répond 200 même sur rejet métier.** Un agrégateur qui reçoit une
 * erreur réessaie, indéfiniment. On distingue « je n'ai pas compris » (4xx,
 * signature) de « j'ai reçu, il n'y a rien à faire » (200).
 *
 * MODE TEST : aucun agrégateur ne rappelle aujourd'hui. Cette route existe
 * pour que le chemin soit écrit, éprouvé, et prêt — pas pour inventer un
 * fournisseur (§52).
 */
export async function POST(requete: Request) {
  const fournisseur = getPaymentProvider();

  // Règle 1 : le corps brut, avant toute interprétation.
  const corpsBrut = await requete.text();

  const entetes: Record<string, string> = {};
  requete.headers.forEach((valeur, nom) => {
    entetes[nom.toLowerCase()] = valeur;
  });

  /*
   * Le jeton de l'adresse, versé parmi les en-têtes.
   *
   * iKeePay ne signe pas ses rappels — leur documentation montre un exemple
   * qui croit l'événement sur parole. Faute de signature, l'adresse déclarée
   * chez eux porte un jeton secret : `/api/paiements/rappel?jeton=…`.
   * L'acheteur, lui, ne connaît que le lien de paiement.
   *
   * Il arrive ici sous un nom d'en-tête RÉSERVÉ, parce que `verifierRappel`
   * ne reçoit que le corps et les en-têtes — c'est sa signature, et elle est
   * juste : un fournisseur qui signe vraiment n'a que faire de l'adresse. Le
   * préfixe `x-koli-` évite toute collision avec un en-tête réel.
   *
   * Un en-tête entrant qui porterait ce nom est ÉCRASÉ, jamais lu : sans
   * cela, n'importe qui pourrait l'envoyer lui-même et court-circuiter le
   * contrôle.
   */
  const jeton = new URL(requete.url).searchParams.get("jeton");
  entetes[ENTETE_JETON_RAPPEL] = jeton ?? "";

  // Règle 2 : la signature d'abord.
  const verification = await fournisseur.verifierRappel(corpsBrut, entetes);

  if (!verification.valide) {
    // 401 et non 400 : le problème est l'identité de l'appelant, pas la forme
    // de sa requête. Le motif n'est pas renvoyé — inutile d'aider quelqu'un
    // qui cherche à forger une signature.
    return NextResponse.json({ recu: false }, { status: 401 });
  }

  const { intent } = verification;

  /*
   * ── ON RETROUVE LE PAIEMENT PAR DEUX CHEMINS, ET C'EST NÉCESSAIRE ─────────
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │  `providerRef` n'est JAMAIS écrit en mode réel. Cette route ne trouvait  │
   * │  donc aucun paiement, et répondait 200 sans rien faire.                  │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * Le 6 septembre 2026, un vrai paiement de 1 000 FC a abouti chez iKeePay —
   * leur tableau de bord affichait « COMPLETED » — et KOLI n'en a rien su. Le
   * rappel est bien arrivé, avec le bon jeton ; il n'a simplement trouvé
   * personne à qui l'attribuer.
   *
   * La cause : en mode test, c'est `simulatePaymentAction` qui enregistre
   * `providerRef` après `initiate()`. En mode réel, le tunnel n'a pas d'appel
   * serveur à l'initiation — `adresseDuTunnel` bâtit l'adresse et jette la
   * référence. Personne ne l'écrit, jamais.
   *
   * Et l'échec était MUET : la règle anti-oracle interdit de révéler qu'une
   * référence est inconnue, donc la réponse est 200 dans les deux cas. Un
   * défaut invisible sur le chemin par lequel arrive tout l'argent.
   *
   * On résout donc aussi par la RÉFÉRENCE DE COMMANDE. Chez iKeePay, les deux
   * sont la même chaîne — `IkeePayProvider.initiate()` pose
   * `providerRef = orderReference`, faute d'identifiant fourni par eux avant le
   * rappel. Le second chemin n'invente rien : il lit ce que l'agrégateur
   * renvoie, sous le nom qu'il lui donne.
   */
  const selection = {
    id: true,
    status: true,
    amount: true,
    orderId: true,
    providerRef: true,
    // La reference, et pas seulement l'identifiant : c'est elle que prend
    // `appliquerAboutissement`, comme partout ailleurs. L'identifiant interne
    // d'une commande n'est jamais cense circuler (voir la note d'autorisation
    // de `simulatePaymentAction`).
    // La devise de la commande : sans elle, impossible de savoir si le
    // montant du rappel est comparable au nôtre.
    order: { select: { reference: true, currency: true } },
  } as const;

  const paiement =
    (await prisma.payment.findUnique({
      where: { providerRef: intent.providerRef },
      select: selection,
    })) ??
    (await prisma.payment.findFirst({
      where: { order: { reference: intent.providerRef } },
      select: selection,
    }));

  /*
   * On note la référence du prestataire si elle manquait.
   *
   * Sans cela, chaque rappel rejoué repasserait par la seconde requête, et
   * surtout le registre ne porterait aucune trace de ce qui relie notre
   * paiement à leur transaction — la seule chose qui permette un
   * rapprochement à la main le jour où il faudra en faire un.
   */
  if (paiement && !paiement.providerRef) {
    await prisma.payment.update({
      where: { id: paiement.id },
      data: { providerRef: intent.providerRef },
    });
  }

  /*
   * ÉCARTER un rappel, en le DISANT au journal.
   *
   * ┌────────────────────────────────────────────────────────────────────────┐
   * │  Deux vrais paiements ont été perdus le 6 septembre 2026, et aucun     │
   * │  des deux n'a laissé la moindre trace.                                 │
   * └────────────────────────────────────────────────────────────────────────┘
   *
   * La réponse reste indifférenciée — la règle anti-oracle interdit de révéler
   * qu'une référence est inconnue, sans quoi ce point d'entrée apprendrait à
   * qui le sonde quelles commandes existent. Ce qui change, c'est que NOUS le
   * savons désormais.
   *
   * Le journal n'est écrit qu'au-delà de la porte du jeton : en deçà,
   * n'importe qui pourrait le remplir en frappant l'adresse.
   */
  const ecarter = async (
    motif: string,
    details: Record<string, unknown> = {}
  ) => {
    try {
      await consigner(prisma, {
        acteur: null,
        action: ACTIONS_AUDIT.PAYMENT_CALLBACK_DISCARDED,
        entite: "Payment",
        // La référence du rappel, même si elle ne correspond à rien : c'est
        // elle qu'on cherchera pour comprendre.
        entiteId: intent.providerRef,
        details: {
          motif,
          montantRecu: intent.amount,
          deviseRecue: intent.currency ?? null,
          statutRecu: intent.status,
          ...details,
        },
      });
    } catch {
      // Une panne d'écriture du journal ne doit pas changer la réponse au
      // prestataire : il rejouerait, sans que cela répare quoi que ce soit.
    }
    return NextResponse.json({ recu: true, traite: false });
  };
  // Règle 3 : réponse indifférenciée.
  if (!paiement) {
    await ecarter("aucun paiement ne porte cette reference");
    return NextResponse.json({ recu: true });
  }

  // Apres la garde : la commande existe forcement, c est une jointure obligee.
  const commande = paiement.order;

  /*
   * ── Règle 4 : le montant doit correspondre — MAIS DANS QUELLE MONNAIE ? ───
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │  Cette règle comparait des nombres bruts. Elle a fait perdre un vrai     │
   * │  paiement le 6 septembre 2026.                                           │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * La commande valait **200 XOF**. iKeePay a encaissé **796 CDF** — leur
   * propre conversion, faite dans leur tunnel. Le rappel portait donc 796, la
   * commande 200, et la comparaison les a déclarés différents.
   *
   * Réponse : `{ recu: true, traite: false }`. Un 200 poli, aucune trace, et un
   * acheteur débité de 796 CDF pendant que le vendeur ne voyait rien.
   *
   * La règle reste nécessaire — sans elle, un rappel forgé pourrait attribuer
   * n'importe quelle somme à n'importe quelle commande. Mais elle ne peut
   * comparer que des grandeurs comparables.
   */
  const deviseRecue = intent.currency?.trim().toUpperCase() ?? "";
  const memeDevise = !deviseRecue || deviseRecue === commande.currency;

  if (intent.amount > 0) {
    if (memeDevise) {
      // Même monnaie : la comparaison exacte garde tout son sens.
      if (intent.amount !== paiement.amount) {
        return ecarter("montant different, meme monnaie", {
          montantAttendu: paiement.amount,
          deviseCommande: commande.currency,
        });
      }
    } else {
      /*
       * Monnaies différentes : on convertit et on tolère un écart.
       *
       * ±25 %, et c'est large exprès. Le taux du prestataire n'est pas le
       * nôtre — 1,8 % d'écart mesuré le 6 septembre —, il inclut leur marge,
       * il bouge entre l'affichage et le prélèvement, et les arrondis pèsent
       * lourd sur de petits montants. Une bande étroite rejetterait de vrais
       * paiements, ce qui est exactement le défaut qu'on répare.
       *
       * Ce que la bande attrape encore : un rappel qui attribuerait une somme
       * sans rapport — un ordre de grandeur d'écart, pas quelques pour cent.
       */
      const attendu = await convertir(
        paiement.amount,
        commeDevise(commande.currency),
        commeDevise(deviseRecue)
      );

      if (attendu) {
        const ecart = Math.abs(intent.amount - attendu.montant) / attendu.montant;
        if (ecart > 0.25) {
          return ecarter("montant hors tolerance apres conversion", {
            montantAttendu: paiement.amount,
            deviseCommande: commande.currency,
            equivalentCalcule: attendu.montant,
            ecartPourCent: Math.round(ecart * 100),
          });
        }
      }
      /*
       * Taux indisponible : on NE REJETTE PAS.
       *
       * Le choix est délibéré et il penche du côté qui ne perd pas d'argent.
       * Rejeter ferait dépendre l'aboutissement d'un vrai paiement de la
       * disponibilité d'une API de change — un service tiers, sans rapport
       * avec la transaction, dont la panne coûterait un client débité pour
       * rien. Le jeton et la référence restent la porte ; le montant encaissé
       * est enregistré juste en dessous, et un écart se verra au rapprochement.
       */
    }
  }

  // Règle 5 : un paiement déjà conclu ne se reprend pas.
  const conclu: PaymentStatus[] = [
    PaymentStatus.SUCCEEDED,
    PaymentStatus.FAILED,
    PaymentStatus.EXPIRED,
  ];

  if (conclu.includes(paiement.status)) {
    // Pas une anomalie : les agrégateurs rejouent leurs rappels. On le note
    // quand même, pour que le journal montre la séquence complète.
    return ecarter("paiement deja conclu", { statutActuel: paiement.status });
  }

  const nouveau = CORRESPONDANCE[intent.status];
  if (!nouveau) {
    return ecarter("statut sans correspondance");
  }

  /*
   * Les renseignements que SEUL le rappel apporte.
   *
   * Le numéro du payeur et son opérateur ne nous sont connus qu'ici : c'est
   * l'agrégateur qui les collecte, jamais KOLI (aucun numéro de payeur ne
   * transite par le tunnel). On les note avant tout le reste, pour qu'ils
   * survivent même si la suite n'aboutit pas.
   */
  await prisma.payment.updateMany({
    // Conditionnée sur l'état de départ : deux rappels simultanés n'en font
    // aboutir qu'un.
    where: { id: paiement.id, status: { notIn: conclu } },
    data: {
      lastCheckedAt: new Date(),
      /*
       * Ce que le prestataire a REELLEMENT prélevé.
       *
       * `amount` reste le montant de notre commande. Les deux chiffres sont
       * vrais et ne se remplacent pas : l'un est ce que le vendeur recevra,
       * l'autre ce qui a quitté le compte de l'acheteur. Sans cette ligne, le
       * second n'existe nulle part et aucun rapprochement n'est possible.
       */
      ...(intent.amount > 0 ? { collectedAmount: intent.amount } : {}),
      ...(deviseRecue ? { collectedCurrency: deviseRecue } : {}),
      ...(intent.failureReason ? { failureReason: intent.failureReason } : {}),
      ...(intent.payerMsisdn ? { payerMsisdn: intent.payerMsisdn } : {}),
      ...(intent.payerOperator ? { payerOperator: intent.payerOperator } : {}),
    },
  });

  /*
   * ── LE BRANCHEMENT DE LA PHASE 30 ───────────────────────────────────────
   *
   * Cette route NOTAIT l'état et s'arrêtait là. Le commentaire qu'elle portait
   * l'annonçait : « le jour du branchement, c'est ici que l'action de
   * confirmation sera appelée ». En mode test c'était sans conséquence — le
   * bouton de simulation appelle `simulatePaymentAction`, qui fait tout. En
   * mode réel, ce rappel est le SEUL chemin, et il n'aboutissait à rien :
   *
   *   le client débité chez l'agrégateur, le paiement marqué SUCCEEDED chez
   *   nous, et **aucun séquestre, aucune facture, aucune notification** — une
   *   commande restée « en attente de paiement », invisible du vendeur.
   *
   * `appliquerAboutissement` porte ces écritures et les fait dans une seule
   * transaction. Elle est idempotente : un rappel rejoué — ce que les
   * agrégateurs font systématiquement s'ils n'ont pas eu de 200 assez vite —
   * n'écrit rien une seconde fois.
   */
  if (nouveau === PaymentStatus.SUCCEEDED || nouveau === PaymentStatus.FAILED) {
    const applique = await appliquerAboutissement(
      paiement.order.reference,
      nouveau === PaymentStatus.SUCCEEDED
      // `simulatedOutcome` reste nul : c'est ce qui distingue, dans le
      // registre, un encaissement joué d'un encaissement qui a eu lieu.
    );

    /*
     * On répond 200 même si l'application a échoué, et c'est délibéré.
     *
     * Un 500 ferait rejouer le rappel par l'agrégateur, en boucle, alors que le
     * motif d'échec — une transition de statut illégale, par exemple — ne se
     * résoudra pas tout seul. Le rejeu ne réparerait rien et masquerait le
     * problème derrière une avalanche d'appels.
     */
    return NextResponse.json({ recu: true, traite: applique.ok });
  }

  /*
   * Statut non conclusif : AWAITING_CUSTOMER — le client valide sur son
   * téléphone — ou EXPIRED. On note, sans rien déclencher.
   */
  await prisma.payment.updateMany({
    where: { id: paiement.id, status: { notIn: conclu } },
    data: { status: nouveau },
  });

  return NextResponse.json({ recu: true, traite: true });
}

/** États du fournisseur → états de KOLI. Rien n'est écrit hors de cette table. */
const CORRESPONDANCE: Partial<Record<string, PaymentStatus>> = {
  AWAITING_CUSTOMER: PaymentStatus.AWAITING_CUSTOMER,
  SUCCEEDED: PaymentStatus.SUCCEEDED,
  FAILED: PaymentStatus.FAILED,
  EXPIRED: PaymentStatus.EXPIRED,
};
