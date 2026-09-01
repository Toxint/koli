import { NextResponse } from "next/server";
import { PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getPaymentProvider } from "@/lib/config/mode";
import { ENTETE_JETON_RAPPEL } from "@/lib/payments/IkeePayProvider";

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

  const paiement = await prisma.payment.findUnique({
    where: { providerRef: intent.providerRef },
    select: { id: true, status: true, amount: true, orderId: true },
  });

  // Règle 3 : réponse indifférenciée.
  if (!paiement) {
    return NextResponse.json({ recu: true });
  }

  // Règle 4 : le montant doit correspondre.
  if (intent.amount > 0 && intent.amount !== paiement.amount) {
    return NextResponse.json({ recu: true, traite: false });
  }

  // Règle 5 : un paiement déjà conclu ne se reprend pas.
  const conclu: PaymentStatus[] = [
    PaymentStatus.SUCCEEDED,
    PaymentStatus.FAILED,
    PaymentStatus.EXPIRED,
  ];

  if (conclu.includes(paiement.status)) {
    return NextResponse.json({ recu: true, traite: false });
  }

  const nouveau = CORRESPONDANCE[intent.status];
  if (!nouveau) {
    return NextResponse.json({ recu: true, traite: false });
  }

  await prisma.payment.updateMany({
    // Conditionnée sur l'état de départ : deux rappels simultanés n'en font
    // aboutir qu'un.
    where: { id: paiement.id, status: { notIn: conclu } },
    data: {
      status: nouveau,
      lastCheckedAt: new Date(),
      ...(intent.failureReason ? { failureReason: intent.failureReason } : {}),
      ...(intent.payerMsisdn ? { payerMsisdn: intent.payerMsisdn } : {}),
      ...(intent.payerOperator ? { payerOperator: intent.payerOperator } : {}),
    },
  });

  // Le rappel NOTE l'état. Il ne sécurise pas les fonds, n'émet pas de facture
  // et ne prévient personne : ces écritures appartiennent à
  // `lib/payments/actions.ts`, qui les fait dans une seule transaction. Les
  // dupliquer ici en produirait une seconde version, forcément divergente.
  //
  // Le jour du branchement (phase 30), c'est ici que l'action de confirmation
  // sera appelée — une ligne, à un endroit déjà éprouvé.
  return NextResponse.json({ recu: true, traite: true });
}

/** États du fournisseur → états de KOLI. Rien n'est écrit hors de cette table. */
const CORRESPONDANCE: Partial<Record<string, PaymentStatus>> = {
  AWAITING_CUSTOMER: PaymentStatus.AWAITING_CUSTOMER,
  SUCCEEDED: PaymentStatus.SUCCEEDED,
  FAILED: PaymentStatus.FAILED,
  EXPIRED: PaymentStatus.EXPIRED,
};
