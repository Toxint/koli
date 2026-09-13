"use server";

import { revalidatePath } from "next/cache";
import { PayoutStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/actions";
import { chargerSoldeVendeur } from "@/lib/finance/solde";
import { refusDeVersement } from "@/lib/finance/versement";
import { deviseDuVendeur } from "@/data/markets";
import { ACTIONS_AUDIT, consigner } from "@/lib/audit/journal";
import { formatMontant } from "@/lib/format";

/**
 * Le VERSEMENT au vendeur (§43) — le seul acte de KOLI qui fait sortir de
 * l'argent.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Deux temps, et c'est volontaire : le vendeur DEMANDE, l'administration │
 * │  EXÉCUTE.                                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * iKeePay documente un point d'entrée `h2h-payout`, mais il n'a **jamais été
 * appelé**. Un versement exécuté à la main ne peut rien perdre à une API non
 * éprouvée, et avec quelques vendeurs c'est trivial. L'appel automatique se
 * branchera derrière la même abstraction que l'encaissement, une fois
 * `h2h-payout` exercé pour de vrai — et pas avant.
 *
 * ── Ce qui ne se déferait pas sans être écrit ────────────────────────────────
 *
 * **La règle vit dans `versement.ts`, pas ici.** Elle est pure, donc éprouvable
 * sans base — même découpage que `motifDeNonEnvoi` pour les courriels.
 *
 * **Rien n'est écrit au grand livre à la DEMANDE.** Une demande n'est pas un
 * mouvement. La poser d'avance ferait disparaître du solde un argent que le
 * vendeur n'a pas reçu, et qu'un refus lui rendrait.
 *
 * **L'exécution et sa trace partagent la MÊME transaction.** L'une ne peut pas
 * aboutir sans l'autre : un versement sans trace est de l'argent parti que
 * personne ne peut rattacher à une décision.
 */

export interface ResultatVersement {
  success: boolean;
  error?: string;
  message?: string;
}

/** Le vendeur demande à être payé. */
export async function demanderVersementAction(
  _prevState: ResultatVersement | null,
  formData: FormData
): Promise<ResultatVersement> {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    return { success: false, error: "Réservé aux vendeurs." };
  }

  const sellerId = user.sellerProfile.id;
  const devise = deviseDuVendeur(user.sellerProfile);

  /*
   * ⚠ Le montant est relu en BASE, jamais pris du formulaire.
   *
   * Le champ saisi ne porte que ce que le vendeur DEMANDE ; ce qu'il PEUT
   * demander vient du registre. Se fier au navigateur reviendrait à laisser
   * quelqu'un choisir combien il retire — c'est le même raisonnement que le
   * montant du tunnel de paiement, recalculé côté serveur.
   */
  const solde = await chargerSoldeVendeur(sellerId);

  const montant = Number.parseInt(
    String(formData.get("montant") ?? "").replace(/\s/g, ""),
    10
  );
  const telephone = String(formData.get("telephone") ?? "").trim();
  const operateur = String(formData.get("operateur") ?? "").trim() || null;

  const refus = refusDeVersement({
    versable: solde.versable,
    montant: Number.isNaN(montant) ? 0 : montant,
    devise,
    demandeEnCours: solde.versementEnAttente > 0,
    telephone,
  });
  if (refus) return { success: false, error: refus };

  const demande = await prisma.$transaction(async (tx) => {
    const cree = await tx.payout.create({
      data: {
        sellerId,
        amount: montant,
        /* La devise est FIGÉE à la demande. Un vendeur qui changerait de
           monnaie ne doit pas voir ses versements passés se réinterpréter. */
        currency: devise,
        phone: telephone,
        operator: operateur,
        status: PayoutStatus.PENDING,
      },
    });

    await consigner(tx, {
      acteur: { id: user.id, name: user.name, role: user.role },
      action: ACTIONS_AUDIT.SELLER_PAYOUT_REQUESTED,
      entite: "Payout",
      entiteId: cree.id,
      details: {
        vendeur: user.sellerProfile!.businessName || user.name,
        montant: formatMontant(montant, devise),
        /* Le numéro est la DESTINATION de l'argent : c'est la donnée qu'il
           faudra pouvoir relire le jour où un versement part au mauvais
           endroit. */
        numero: telephone,
        operateur: operateur ?? "non précisé",
      },
    });

    return cree;
  });

  revalidatePath("/vendeur/solde");

  return {
    success: true,
    message: `Demande de ${formatMontant(demande.amount, devise)} enregistrée. Vous serez payé sur ${telephone}.`,
  };
}

/**
 * L'administration EXÉCUTE ou REFUSE un versement.
 *
 * ⚠ Un versement exécuté ne se rejoue pas et ne s'annule pas : l'argent est
 * parti. La garde d'idempotence n'est donc pas une politesse — elle empêche de
 * payer deux fois sur un double clic ou un rechargement.
 */
export async function reglerVersementAction(
  payoutId: string,
  formData: FormData
): Promise<ResultatVersement> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "ADMIN") {
    return { success: false, error: "Réservé à l'administration." };
  }

  const decision = String(formData.get("decision") ?? "");
  if (decision !== "PAID" && decision !== "REJECTED") {
    return { success: false, error: "Décision inconnue." };
  }

  const reference = String(formData.get("reference") ?? "").trim() || null;
  const motif = String(formData.get("motif") ?? "").trim() || null;

  /* Un refus SANS motif est incompréhensible pour celui qui le reçoit : le
     vendeur voit sa demande rejetée et ne sait ni pourquoi, ni quoi corriger. */
  if (decision === "REJECTED" && !motif) {
    return { success: false, error: "Indiquez pourquoi ce versement est refusé." };
  }

  const versement = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: { seller: { select: { businessName: true } } },
  });
  if (!versement) return { success: false, error: "Versement introuvable." };

  if (versement.status !== PayoutStatus.PENDING) {
    /* Idempotent et EXPLICITE : on dit ce qu'il est devenu, plutôt que de
       laisser croire que rien ne s'est passé. */
    return {
      success: false,
      error:
        versement.status === PayoutStatus.PAID
          ? "Ce versement a déjà été exécuté."
          : "Ce versement a déjà été refusé.",
    };
  }

  /*
   * ⚠ Le conflit concurrent est RATTRAPÉ, et dit pour ce qu'il est.
   *
   * La transaction lève `CONCURRENT` quand un autre administrateur a réglé ce
   * versement entre la lecture ci-dessus et l'écriture. Non rattrapée, cette
   * exception remontait en erreur serveur : l'administrateur voyait une page
   * cassée et pouvait croire le versement NON exécuté — donc le refaire à la
   * main dans son application Mobile Money. Un double paiement, sur l'acte
   * précis que la garde existe pour protéger.
   */
  try {
  await prisma.$transaction(async (tx) => {
    /*
     * ⚠ La transition est refaite DANS la transaction.
     *
     * Entre la lecture ci-dessus et cette écriture, un autre administrateur a
     * pu régler le même versement. `updateMany` avec le statut attendu dans le
     * `where` rend l'opération atomique : soit elle change exactement une
     * ligne, soit elle n'en change aucune et l'on s'arrête.
     */
    const touche = await tx.payout.updateMany({
      where: { id: payoutId, status: PayoutStatus.PENDING },
      data: {
        status: decision as PayoutStatus,
        providerRef: decision === "PAID" ? reference : null,
        reason: motif,
        processedAt: new Date(),
        /* Le nom est RECOPIÉ, pas référencé : il survit à la suppression du
           compte administrateur, comme dans le journal d'audit (§48). */
        processedBy: admin.name,
      },
    });

    if (touche.count === 0) {
      throw new Error("CONCURRENT");
    }

    await consigner(tx, {
      acteur: { id: admin.id, name: admin.name, role: admin.role },
      action: ACTIONS_AUDIT.SELLER_PAYOUT_SETTLED,
      entite: "Payout",
      entiteId: payoutId,
      details: {
        vendeur: versement.seller.businessName ?? "vendeur",
        decision: decision === "PAID" ? "versé" : "refusé",
        montant: formatMontant(
          versement.amount,
          versement.currency as Parameters<typeof formatMontant>[1]
        ),
        numero: versement.phone,
        reference: reference ?? "aucune",
        motif: motif ?? "",
      },
    });
  });
  } catch (e) {
    if (e instanceof Error && e.message === "CONCURRENT") {
      return {
        success: false,
        error:
          "Ce versement vient d'être réglé par quelqu'un d'autre. Rechargez la page avant de refaire quoi que ce soit.",
      };
    }
    throw e;
  }

  revalidatePath("/admin/versements");
  revalidatePath("/vendeur/solde");

  return {
    success: true,
    message:
      decision === "PAID"
        ? "Versement marqué comme exécuté."
        : "Versement refusé, le solde reste au vendeur.",
  };
}
