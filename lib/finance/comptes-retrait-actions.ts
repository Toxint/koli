"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/actions";
import { refusDeCompteRetrait } from "@/lib/finance/comptes-retrait";
import { marcheDuPays } from "@/data/markets";
import { ACTIONS_AUDIT, consigner } from "@/lib/audit/journal";

/**
 * Les numéros de retrait d'un vendeur : enregistrer, modifier, supprimer.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Ces lignes décident d'OÙ PART L'ARGENT. Ce sont, avec le versement      │
 * │  lui-même, les seules écritures du produit qui aient cette portée.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Quatre décisions, et chacune se déferait sans être écrite :
 *
 * - **Toute écriture est bornée au vendeur CONNECTÉ**, par `updateMany` et
 *   `deleteMany` avec `sellerId` dans le `where` — jamais par l'identifiant
 *   seul. L'identifiant voyage dans le formulaire : s'y fier laisserait un
 *   vendeur modifier le numéro de retrait d'un concurrent, c'est-à-dire
 *   détourner ses versements. C'est la leçon des équipes de livraison (§5.3),
 *   appliquée à l'endroit où elle coûterait le plus cher.
 *
 * - **Chaque changement est CONSIGNÉ au journal d'audit.** Le jour où un
 *   versement part au mauvais endroit, la question est « depuis quand ce numéro
 *   était-il là, et qui l'a mis ? ». Sans ces lignes, la réponse n'existe pas.
 *
 * - **Un seul compte par défaut**, garanti par une transaction qui dégrade les
 *   autres. Deux « par défaut » ne casseraient rien de visible : l'écran en
 *   cocherait un au hasard, et le vendeur croirait choisir.
 *
 * - **Supprimer un compte ne touche à AUCUN versement.** `Payout` recopie le
 *   numéro, le nom et l'opérateur à la demande : un versement déjà demandé garde
 *   sa destination même si le compte disparaît. Un registre ne se relit pas.
 */

export interface ResultatCompteRetrait {
  success: boolean;
  error?: string;
  message?: string;
}

/** Le vendeur connecté, ou le motif du refus. */
async function vendeurCourant() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) return null;
  return user;
}

/** Enregistre un numéro, ou met à jour celui dont l'identifiant est fourni. */
export async function enregistrerCompteRetraitAction(
  _prevState: ResultatCompteRetrait | null,
  formData: FormData
): Promise<ResultatCompteRetrait> {
  const user = await vendeurCourant();
  if (!user?.sellerProfile) {
    return { success: false, error: "Réservé aux vendeurs." };
  }
  const sellerId = user.sellerProfile.id;

  const compteId = String(formData.get("compteId") ?? "").trim() || null;
  const telephone = String(formData.get("telephone") ?? "").trim();
  const operateur = String(formData.get("operateur") ?? "").trim();
  const titulaire = String(formData.get("titulaire") ?? "").trim();
  const surnom = String(formData.get("surnom") ?? "").trim() || null;
  const parDefaut = formData.get("parDefaut") != null;

  /* Les opérateurs desservis dans le pays du vendeur, pas une liste écrite à la
     main : `data/markets.ts` porte ceux du prestataire, pays par pays. */
  const marche = marcheDuPays(user.sellerProfile.country ?? "");
  const operateursAutorises = marche?.operateurs ?? [];

  const autres = await prisma.payoutAccount.findMany({
    where: { sellerId, ...(compteId ? { id: { not: compteId } } : {}) },
    select: { phone: true },
  });

  const refus = refusDeCompteRetrait({
    telephone,
    operateur,
    titulaire,
    operateursAutorises,
    numerosDejaEnregistres: autres.map((a) => a.phone),
    comptesExistants: autres.length,
  });
  if (refus) return { success: false, error: refus };

  const donnees = {
    phone: telephone,
    operator: operateur,
    holderName: titulaire,
    label: surnom,
  };

  const modification = compteId !== null;

  try {
    await prisma.$transaction(async (tx) => {
      let id = compteId;

      if (compteId) {
        /* Borné au vendeur : l'identifiant vient du formulaire, donc du
           navigateur, donc de n'importe qui. */
        const touche = await tx.payoutAccount.updateMany({
          where: { id: compteId, sellerId },
          data: donnees,
        });
        if (touche.count === 0) throw new Error("INTROUVABLE");
      } else {
        const cree = await tx.payoutAccount.create({
          data: { sellerId, ...donnees, isDefault: false },
        });
        id = cree.id;
      }

      /*
       * Le PREMIER compte est par défaut, qu'on l'ait demandé ou non.
       *
       * Sans cela, un vendeur qui n'en enregistre qu'un n'aurait aucun compte
       * proposé, et l'écran de retrait lui demanderait de choisir dans une
       * liste d'un seul élément non coché — une question dont la réponse est
       * évidente est une question de trop.
       */
      const total = await tx.payoutAccount.count({ where: { sellerId } });
      if (parDefaut || total === 1) {
        await tx.payoutAccount.updateMany({
          where: { sellerId, id: { not: id! } },
          data: { isDefault: false },
        });
        await tx.payoutAccount.updateMany({
          where: { id: id!, sellerId },
          data: { isDefault: true },
        });
      }

      await consigner(tx, {
        acteur: { id: user.id, name: user.name, role: user.role },
        action: ACTIONS_AUDIT.SELLER_PAYOUT_ACCOUNT_SAVED,
        entite: "PayoutAccount",
        entiteId: id!,
        details: {
          vendeur: user.sellerProfile!.businessName || user.name,
          operation: modification ? "modification" : "ajout",
          numero: telephone,
          titulaire,
          operateur,
        },
      });
    });
  } catch (e) {
    /* Un identifiant qui n'appartient pas à ce vendeur rend le MÊME message
       qu'un identifiant inexistant : dire « ce numéro n'est pas le vôtre »
       apprendrait à qui sonde des identifiants lesquels existent ailleurs. */
    if (e instanceof Error && e.message === "INTROUVABLE") {
      return { success: false, error: "Numéro introuvable." };
    }
    throw e;
  }

  revalidatePath("/vendeur/solde");

  return {
    success: true,
    message: modification
      ? "Numéro mis à jour."
      : `Numéro enregistré. Vous pourrez le choisir à chaque retrait.`,
  };
}

/** Retire un numéro de la liste du vendeur. */
export async function supprimerCompteRetraitAction(
  _prevState: ResultatCompteRetrait | null,
  formData: FormData
): Promise<ResultatCompteRetrait> {
  const user = await vendeurCourant();
  if (!user?.sellerProfile) {
    return { success: false, error: "Réservé aux vendeurs." };
  }
  const sellerId = user.sellerProfile.id;
  const compteId = String(formData.get("compteId") ?? "").trim();
  if (!compteId) return { success: false, error: "Numéro introuvable." };

  const compte = await prisma.payoutAccount.findFirst({
    where: { id: compteId, sellerId },
  });
  /* Le même message que si le compte n'existait pas : dire « ce numéro n'est
     pas le vôtre » apprendrait à qui sonde des identifiants lesquels existent
     ailleurs. Même raisonnement que la règle anti-oracle du rappel. */
  if (!compte) return { success: false, error: "Numéro introuvable." };

  await prisma.$transaction(async (tx) => {
    await tx.payoutAccount.deleteMany({ where: { id: compteId, sellerId } });

    /* Le compte par défaut disparu, on en désigne un autre : sinon l'écran de
       retrait n'aurait plus rien de coché, et le vendeur croirait avoir tout
       perdu. */
    if (compte.isDefault) {
      const suivant = await tx.payoutAccount.findFirst({
        where: { sellerId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (suivant) {
        await tx.payoutAccount.update({
          where: { id: suivant.id },
          data: { isDefault: true },
        });
      }
    }

    await consigner(tx, {
      acteur: { id: user.id, name: user.name, role: user.role },
      action: ACTIONS_AUDIT.SELLER_PAYOUT_ACCOUNT_REMOVED,
      entite: "PayoutAccount",
      entiteId: compteId,
      details: {
        vendeur: user.sellerProfile!.businessName || user.name,
        numero: compte.phone,
        titulaire: compte.holderName,
      },
    });
  });

  revalidatePath("/vendeur/solde");

  return { success: true, message: "Numéro supprimé." };
}
