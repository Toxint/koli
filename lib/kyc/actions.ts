"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { KycStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/actions";
import { ACTIONS_AUDIT, consigner } from "@/lib/audit/journal";
import {
  rangerFichier,
  reconnaitreType,
  supprimerFichier,
  TAILLE_MAX_OCTETS,
} from "@/lib/kyc/stockage";
import { estTypePieceConnu, libellePiece } from "@/lib/kyc/types";

/** Libellés français, pour que le journal d'audit se lise. */
const LIBELLE_STATUT: Record<string, string> = {
  PENDING: "en attente",
  VERIFIED: "acceptée",
  REJECTED: "refusée",
};

export type ResultatKyc =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Dépôt et examen des pièces justificatives (§37).
 *
 * Le §37 demande de **préparer** le KYC sans bloquer le MVP : rien ici
 * n'empêche un vendeur de vendre. Le dossier se constitue en parallèle, et
 * c'est l'administration qui décide ensuite du statut de vérification (§36) —
 * lequel existait déjà et reste le seul état qui compte.
 *
 * Ce fichier manipule des documents d'identité. Trois règles s'imposent :
 *
 * **1. Un vendeur ne dépose que pour lui-même**, et ne consulte que ses
 * propres pièces. La portée par `sellerId` de la session est le contrôle
 * d'accès, pas un filtre de confort.
 *
 * **2. Le type du fichier est déterminé en le LISANT.** `Content-Type` vient
 * du navigateur et se falsifie ; un fichier HTML accepté comme image, puis
 * restitué comme telle, s'exécuterait dans notre propre domaine.
 *
 * **3. Chaque décision d'examen est consignée** (§48) : accepter ou refuser
 * une pièce d'identité engage la plateforme.
 */

const nomLegalSchema = z
  .string()
  .trim()
  .min(3, "Indiquez votre nom complet, tel qu'il figure sur votre pièce.")
  .max(120, "Nom trop long.");

/** Le nom légal, souvent différent de l'enseigne commerciale. */
export async function enregistrerIdentiteKycAction(
  formData: FormData
): Promise<ResultatKyc> {
  const utilisateur = await getCurrentUser();
  if (!utilisateur || utilisateur.role !== "SELLER" || !utilisateur.sellerProfile) {
    return { success: false, error: "Réservé aux comptes vendeurs." };
  }

  const validation = nomLegalSchema.safeParse(formData.get("legalName"));
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  await prisma.sellerProfile.update({
    where: { id: utilisateur.sellerProfile.id },
    data: { legalName: validation.data },
  });

  revalidatePath("/vendeur/verification");
  return { success: true, message: "Identité enregistrée." };
}

export async function deposerPieceKycAction(
  formData: FormData
): Promise<ResultatKyc> {
  const utilisateur = await getCurrentUser();
  if (!utilisateur || utilisateur.role !== "SELLER" || !utilisateur.sellerProfile) {
    return { success: false, error: "Réservé aux comptes vendeurs." };
  }

  const type = formData.get("type");
  if (!estTypePieceConnu(type)) {
    return { success: false, error: "Type de document inconnu." };
  }

  const fichier = formData.get("fichier");
  if (!(fichier instanceof File) || fichier.size === 0) {
    return { success: false, error: "Choisissez un fichier." };
  }

  // Contrôle de taille AVANT lecture complète : inutile de charger 200 Mo en
  // mémoire pour les refuser ensuite.
  if (fichier.size > TAILLE_MAX_OCTETS) {
    return {
      success: false,
      error: `Fichier trop lourd (${Math.round(
        fichier.size / 1024 / 1024
      )} Mo). Maximum ${TAILLE_MAX_OCTETS / 1024 / 1024} Mo.`,
    };
  }

  const donnees = new Uint8Array(await fichier.arrayBuffer());
  const typeReel = reconnaitreType(donnees);

  if (typeReel === null) {
    // On refuse, on ne se rabat PAS sur le type annoncé.
    return {
      success: false,
      error:
        "Format non accepté. Envoyez une photo (JPEG, PNG, WebP) ou un PDF.",
    };
  }

  const range = await rangerFichier(donnees, typeReel);

  try {
    // Une seule pièce en cours par type : redéposer remplace la précédente,
    // sinon l'administration se retrouve devant cinq versions de la même carte
    // sans savoir laquelle fait foi.
    const ancienne = await prisma.kycDocument.findFirst({
      where: { sellerId: utilisateur.sellerProfile.id, type },
      orderBy: { createdAt: "desc" },
    });

    await prisma.$transaction(async (tx) => {
      if (ancienne) {
        await tx.kycDocument.delete({ where: { id: ancienne.id } });
      }

      await tx.kycDocument.create({
        data: {
          sellerId: utilisateur.sellerProfile!.id,
          type,
          fileUrl: range.chemin,
          // Le nom d'origine est conservé pour l'affichage SEULEMENT : le
          // fichier sur disque porte un nom tiré au sort.
          originalName: fichier.name.slice(0, 120),
          mimeType: range.mime,
          sizeBytes: range.taille,
          status: KycStatus.PENDING,
        },
      });

      await tx.sellerProfile.update({
        where: { id: utilisateur.sellerProfile!.id },
        data: { kycSubmittedAt: new Date() },
      });
    });

    // Le fichier de l'ancienne pièce ne part qu'APRÈS la transaction : supprimé
    // avant, un échec d'écriture laisserait une ligne pointant vers un fichier
    // disparu.
    if (ancienne) await supprimerFichier(ancienne.fileUrl);
  } catch (erreur) {
    // La ligne n'a pas été créée : le fichier déjà rangé n'appartient à
    // personne et resterait à occuper le disque sans que rien ne le référence.
    await supprimerFichier(range.chemin);
    throw erreur;
  }

  revalidatePath("/vendeur/verification");
  revalidatePath("/admin/verifications");

  return {
    success: true,
    message: `${libellePiece(type)} envoyée. KOLI l'examinera sous peu.`,
  };
}

const decisionSchema = z.object({
  decision: z.enum(["VERIFIED", "REJECTED"], {
    message: "Décision inconnue.",
  }),
  motif: z.string().trim().max(500, "Motif trop long.").optional(),
});

/**
 * Examen d'une pièce par l'administration.
 *
 * Un refus SANS motif laisse le vendeur devant un mur : il ne sait pas quoi
 * corriger, et redéposera la même pièce. Le motif est donc exigé pour un
 * refus, et seulement pour un refus.
 */
export async function examinerPieceKycAction(
  documentId: string,
  formData: FormData
): Promise<ResultatKyc> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "ADMIN") {
    return { success: false, error: "Réservé à l'administration." };
  }

  const validation = decisionSchema.safeParse({
    decision: formData.get("decision"),
    motif: formData.get("motif") ?? "",
  });

  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  const { decision } = validation.data;
  const motif = validation.data.motif?.trim() ?? "";

  if (decision === "REJECTED" && motif.length < 5) {
    return {
      success: false,
      error:
        "Indiquez ce qui ne va pas : sans motif, le vendeur ne peut rien corriger.",
    };
  }

  const document = await prisma.kycDocument.findUnique({
    where: { id: documentId },
    include: {
      seller: {
        select: { id: true, businessName: true, user: { select: { name: true } } },
      },
    },
  });

  if (!document) {
    return { success: false, error: "Document introuvable." };
  }

  const nouveau =
    decision === "VERIFIED" ? KycStatus.VERIFIED : KycStatus.REJECTED;

  if (document.status === nouveau) {
    return { success: true, message: "Cette pièce a déjà ce statut." };
  }

  const vendeur =
    document.seller.businessName || document.seller.user.name;

  await prisma.$transaction(async (tx) => {
    await tx.kycDocument.update({
      where: { id: document.id },
      data: {
        status: nouveau,
        reviewedAt: new Date(),
        reviewedById: admin.id,
        rejectionReason: decision === "REJECTED" ? motif : null,
      },
    });

    // §48 : accepter ou refuser une pièce d'identité engage la plateforme.
    await consigner(tx, {
      acteur: { id: admin.id, name: admin.name, role: admin.role },
      action: ACTIONS_AUDIT.KYC_DOCUMENT_REVIEWED,
      entite: "KycDocument",
      entiteId: document.id,
      details: {
        vendeur,
        piece: libellePiece(document.type),
        avant: LIBELLE_STATUT[document.status] ?? document.status,
        apres: LIBELLE_STATUT[nouveau] ?? nouveau,
        ...(decision === "REJECTED" ? { motif } : {}),
      },
    });
  });

  revalidatePath("/admin/verifications");
  revalidatePath("/vendeur/verification");

  return {
    success: true,
    message:
      decision === "VERIFIED"
        ? `${libellePiece(document.type)} acceptée.`
        : `${libellePiece(document.type)} refusée. Le vendeur en est informé.`,
  };
}
