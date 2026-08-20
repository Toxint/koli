"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";

export type ProduitResult =
  | { success: true; id: string; message: string }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Catalogue produits du vendeur (§16-17).
 *
 * Jusqu'ici, creer une commande creait silencieusement un produit par
 * correspondance de nom : deux orthographes donnaient deux produits, le prix
 * du catalogue etait ignore au profit de celui saisi, et le stock n'etait
 * jamais decremente. Le catalogue devient une entite a part entiere.
 */
const produitSchema = z.object({
  name: z.string().trim().min(2, "Le nom du produit est requis."),
  description: z.string().trim().optional().or(z.literal("")),
  category: z.string().trim().optional().or(z.literal("")),
  price: z
    .coerce.number()
    .int("Le prix doit être un nombre entier.")
    .min(100, "Le prix doit être d'au moins 100 FCFA."),
  quantity: z
    .coerce.number()
    .int("La quantité doit être un nombre entier.")
    .min(0, "La quantité ne peut pas être négative."),
  weightKg: z.coerce.number().min(0).optional().or(z.literal("")).or(z.nan()),
  imageUrl: z
    .string()
    .trim()
    .url("L'adresse de l'image doit être un lien valide.")
    .optional()
    .or(z.literal("")),
});

function lireFormulaire(formData: FormData) {
  return {
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    category: formData.get("category") ?? "",
    price: formData.get("price"),
    quantity: formData.get("quantity"),
    weightKg: formData.get("weightKg") ?? "",
    imageUrl: formData.get("imageUrl") ?? "",
  };
}

function erreursParChamp(erreur: z.ZodError): Record<string, string> {
  const champs: Record<string, string> = {};
  for (const p of erreur.issues) {
    if (p.path[0]) champs[String(p.path[0])] = p.message;
  }
  return champs;
}

export async function creerProduitAction(
  formData: FormData
): Promise<ProduitResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    return {
      success: false,
      error: "Vous devez être connecté en tant que vendeur.",
    };
  }

  const validation = produitSchema.safeParse(lireFormulaire(formData));
  if (!validation.success) {
    return {
      success: false,
      error: "Veuillez vérifier les champs du formulaire.",
      fieldErrors: erreursParChamp(validation.error),
    };
  }

  const d = validation.data;
  const poids = typeof d.weightKg === "number" && !Number.isNaN(d.weightKg)
    ? d.weightKg
    : null;

  // Un meme vendeur ne doit pas avoir deux fois le meme produit : c'est ce qui
  // arrivait quand la commande creait le produit a la volee.
  const existant = await prisma.product.findFirst({
    where: { sellerId: user.sellerProfile.id, name: d.name },
    select: { id: true },
  });
  if (existant) {
    return {
      success: false,
      error: "Vous avez déjà un produit portant ce nom.",
      fieldErrors: { name: "Ce nom est déjà utilisé dans votre catalogue." },
    };
  }

  const produit = await prisma.product.create({
    data: {
      sellerId: user.sellerProfile.id,
      name: d.name,
      description: d.description || null,
      category: d.category || null,
      price: d.price,
      quantity: d.quantity,
      weightKg: poids,
      status: "ACTIVE",
      ...(d.imageUrl
        ? { images: { create: [{ url: d.imageUrl, position: 0 }] } }
        : {}),
    },
  });

  revalidatePath("/vendeur/produits");
  revalidatePath("/vendeur/commandes/nouvelle");

  return { success: true, id: produit.id, message: "Produit ajouté." };
}

export async function modifierProduitAction(
  produitId: string,
  formData: FormData
): Promise<ProduitResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    return {
      success: false,
      error: "Vous devez être connecté en tant que vendeur.",
    };
  }

  // Verification de propriete : sans elle, un vendeur pourrait modifier le
  // catalogue d'un concurrent en devinant un identifiant.
  const produit = await prisma.product.findUnique({
    where: { id: produitId },
    select: { id: true, sellerId: true },
  });

  if (!produit || produit.sellerId !== user.sellerProfile.id) {
    return { success: false, error: "Produit introuvable." };
  }

  const validation = produitSchema.safeParse(lireFormulaire(formData));
  if (!validation.success) {
    return {
      success: false,
      error: "Veuillez vérifier les champs du formulaire.",
      fieldErrors: erreursParChamp(validation.error),
    };
  }

  const d = validation.data;
  const poids = typeof d.weightKg === "number" && !Number.isNaN(d.weightKg)
    ? d.weightKg
    : null;

  await prisma.product.update({
    where: { id: produit.id },
    data: {
      name: d.name,
      description: d.description || null,
      category: d.category || null,
      price: d.price,
      quantity: d.quantity,
      weightKg: poids,
    },
  });

  revalidatePath("/vendeur/produits");
  revalidatePath("/vendeur/commandes/nouvelle");

  return { success: true, id: produit.id, message: "Produit mis à jour." };
}

/**
 * Retire ou remet un produit au catalogue (§58 : les actions sensibles se
 * confirment). On ne supprime pas : le produit est reference par des
 * commandes passees, et effacer reecrirait l'historique.
 */
export async function basculerStatutProduitAction(
  produitId: string
): Promise<ProduitResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    return {
      success: false,
      error: "Vous devez être connecté en tant que vendeur.",
    };
  }

  const produit = await prisma.product.findUnique({
    where: { id: produitId },
    select: { id: true, sellerId: true, status: true, name: true },
  });

  if (!produit || produit.sellerId !== user.sellerProfile.id) {
    return { success: false, error: "Produit introuvable." };
  }

  const nouveau = produit.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";

  await prisma.product.update({
    where: { id: produit.id },
    data: { status: nouveau },
  });

  revalidatePath("/vendeur/produits");
  revalidatePath("/vendeur/commandes/nouvelle");

  return {
    success: true,
    id: produit.id,
    message:
      nouveau === "ARCHIVED"
        ? `${produit.name} retiré du catalogue.`
        : `${produit.name} remis au catalogue.`,
  };
}
