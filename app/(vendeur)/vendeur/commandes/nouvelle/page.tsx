import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { FormulaireCommande } from "@/components/domain/FormulaireCommande";

/**
 * Page serveur : elle charge le catalogue du vendeur (§16) et le confie au
 * formulaire, qui reste un composant client pour le calcul du total en direct.
 */
export default async function NouvelleCommandePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  const produits = await prisma.product.findMany({
    where: { sellerId: user.sellerProfile.id, status: "ACTIVE" },
    select: { id: true, name: true, price: true, quantity: true },
    orderBy: { name: "asc" },
  });

  return <FormulaireCommande produits={produits} />;
}
