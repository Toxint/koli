"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/actions";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export type ProfilResult =
  | { success: true; message: string }
  | { success: false; error: string };

const profilSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères."),
  email: z
    .string()
    .trim()
    .email("Adresse e-mail invalide.")
    .optional()
    .or(z.literal("")),
  city: z.string().trim().optional().or(z.literal("")),
  businessName: z.string().trim().optional().or(z.literal("")),
  vehicle: z.string().trim().optional().or(z.literal("")),
});

/**
 * Mise a jour du profil (§64).
 *
 * Le telephone n'est PAS modifiable ici : il sert d'identifiant de connexion et
 * de rattachement des commandes passees en mode invite. Le changer demanderait
 * une verification de propriete du nouveau numero — a traiter avec l'envoi de
 * SMS, en phase 31.
 */
export async function updateProfilAction(
  formData: FormData
): Promise<ProfilResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Vous devez être connecté." };
  }

  const validation = profilSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") ?? "",
    city: formData.get("city") ?? "",
    businessName: formData.get("businessName") ?? "",
    vehicle: formData.get("vehicle") ?? "",
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "Formulaire invalide.",
    };
  }

  const data = validation.data;
  const email = data.email ? data.email.toLowerCase() : null;

  // Unicite de l'e-mail : sans ce controle, Prisma leverait une erreur brute
  // que l'utilisateur ne pourrait pas comprendre (§65).
  if (email) {
    const occupe = await prisma.user.findFirst({
      where: { email, NOT: { id: user.id } },
      select: { id: true },
    });
    if (occupe) {
      return {
        success: false,
        error: "Cette adresse e-mail est déjà utilisée par un autre compte.",
      };
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { name: data.name, email },
  });

  // Champs propres a chaque role — chacun n'ecrit que sur son propre profil.
  if (user.sellerProfile && data.businessName !== undefined) {
    await prisma.sellerProfile.update({
      where: { id: user.sellerProfile.id },
      data: { businessName: data.businessName || null },
    });
  }
  if (user.driverProfile && data.vehicle !== undefined) {
    await prisma.driverProfile.update({
      where: { id: user.driverProfile.id },
      data: { vehicle: data.vehicle || null },
    });
  }
  if (user.customerProfile && data.city !== undefined) {
    await prisma.customerProfile.update({
      where: { id: user.customerProfile.id },
      data: { city: data.city || null },
    });
  }

  revalidatePath("/vendeur/profil");
  revalidatePath("/client/profil");
  revalidatePath("/livreur/profil");
  revalidatePath("/admin/profil");

  return { success: true, message: "Profil mis à jour." };
}

const motDePasseSchema = z.object({
  actuel: z.string().min(1, "Saisissez votre mot de passe actuel."),
  nouveau: z
    .string()
    .min(8, "Le nouveau mot de passe doit contenir au moins 8 caractères."),
});

/** Changement de mot de passe (§64 : « les champs sensibles doivent être protégés »). */
export async function changerMotDePasseAction(
  formData: FormData
): Promise<ProfilResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Vous devez être connecté." };
  }

  const validation = motDePasseSchema.safeParse({
    actuel: formData.get("actuel"),
    nouveau: formData.get("nouveau"),
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "Formulaire invalide.",
    };
  }

  const compte = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (!compte) {
    return { success: false, error: "Compte introuvable." };
  }

  // Le mot de passe actuel est exige : sans lui, quiconque accede a une session
  // ouverte pourrait verrouiller le compte de son proprietaire.
  const valide = await verifyPassword(validation.data.actuel, compte.passwordHash);
  if (!valide) {
    return { success: false, error: "Mot de passe actuel incorrect." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(validation.data.nouveau),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  return { success: true, message: "Mot de passe modifié." };
}
