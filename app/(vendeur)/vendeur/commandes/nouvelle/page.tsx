import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { FormulaireCommande } from "@/components/domain/FormulaireCommande";
import { deviseDuVendeur } from "@/data/markets";

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

  /*
   * La devise du vendeur descend jusqu au formulaire.
   *
   * Il affiche des prix et un total en direct, dans un composant client qui
   * n a acces ni a la base ni a la session. Sans ce prop, il ecrivait « FCFA »
   * sous les prix d un vendeur congolais.
   */
  return (
    <FormulaireCommande
      produits={produits}
      devise={deviseDuVendeur(user.sellerProfile)}
      /*
       * Un vendeur sans pays retombe sur la Côte d'Ivoire — le repli documenté
       * au §8, celui des comptes créés avant que `SellerProfile.country`
       * n'existe. C'est un repli, pas un choix : à corriger sur le profil.
       */
      paysVendeur={user.sellerProfile.country || "Côte d'Ivoire"}
    />
  );
}
