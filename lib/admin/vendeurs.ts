"use server";

import { revalidatePath } from "next/cache";
import { SellerVerificationStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";

export type VerificationResult =
  | { success: true; statut: SellerVerificationStatus; message: string }
  | { success: false; error: string };

/**
 * Vérification des vendeurs (§36-37).
 *
 * Le statut existait en base depuis le début mais aucune interface ne
 * permettait de le faire évoluer : tout vendeur restait `PENDING` à vie.
 *
 * Le §37 précise que le KYC « doit être préparé mais ne doit pas bloquer tout
 * le MVP » : la décision est donc ici manuelle et ne s'appuie sur aucun
 * document — la table `KycDocument` reste vide jusqu'à la phase 24. C'est
 * assumé, et l'interface l'indique.
 */
const STATUTS_AUTORISES: SellerVerificationStatus[] = [
  SellerVerificationStatus.VERIFIED,
  SellerVerificationStatus.PENDING,
  SellerVerificationStatus.REJECTED,
];

export async function definirVerificationVendeurAction(
  sellerId: string,
  statut: string
): Promise<VerificationResult> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "ADMIN") {
    return { success: false, error: "Action réservée à l'administration." };
  }

  // Validation par liste blanche : la valeur vient du navigateur, et une
  // chaîne arbitraire écrirait un statut que le reste du code ne sait pas lire.
  if (!STATUTS_AUTORISES.includes(statut as SellerVerificationStatus)) {
    return { success: false, error: "Statut de vérification inconnu." };
  }
  const nouveau = statut as SellerVerificationStatus;

  const vendeur = await prisma.sellerProfile.findUnique({
    where: { id: sellerId },
    select: {
      id: true,
      businessName: true,
      verificationStatus: true,
      user: { select: { name: true } },
    },
  });

  if (!vendeur) {
    return { success: false, error: "Vendeur introuvable." };
  }

  if (vendeur.verificationStatus === nouveau) {
    return {
      success: true,
      statut: nouveau,
      message: "Ce vendeur a déjà ce statut.",
    };
  }

  await prisma.sellerProfile.update({
    where: { id: vendeur.id },
    data: { verificationStatus: nouveau },
  });

  const nom = vendeur.businessName || vendeur.user.name;
  const libelles: Record<SellerVerificationStatus, string> = {
    VERIFIED: `${nom} est désormais vérifié.`,
    PENDING: `${nom} est repassé en attente de vérification.`,
    REJECTED: `La vérification de ${nom} a été rejetée.`,
    SUSPENDED: `${nom} est suspendu.`,
  };

  revalidatePath("/admin/vendeurs");
  revalidatePath("/admin/dashboard");

  return { success: true, statut: nouveau, message: libelles[nouveau] };
}
