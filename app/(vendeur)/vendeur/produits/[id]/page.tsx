import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { NAV_VENDEUR } from "@/lib/navigation";
import { FormulaireProduit } from "@/components/domain/FormulaireProduit";

export default async function ModifierProduitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  const { id } = await params;

  // Le filtre par `sellerId` fait ici office de controle de propriete : un
  // identifiant devine renvoie 404, pas le produit d'un concurrent.
  const produit = await prisma.product.findFirst({
    where: { id, sellerId: user.sellerProfile.id },
    include: { images: { orderBy: { position: "asc" }, take: 1 } },
  });

  if (!produit) notFound();

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[15.5rem]">
      <DashboardNav
        userName={user.sellerProfile.businessName || user.name}
        roleName="Vendeur"
        homeHref="/vendeur/dashboard"
        navItems={NAV_VENDEUR}
      />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <Link
            href="/vendeur/produits"
            className="inline-flex items-center min-h-[44px] text-xs text-ink-muted hover:text-brand"
          >
            ← Retour au catalogue
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {produit.name}
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            Les commandes déjà créées conservent le prix appliqué à l&apos;époque.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-hairline dark:border-slate-800 shadow-sm p-6">
          <FormulaireProduit
            initial={{
              id: produit.id,
              name: produit.name,
              description: produit.description,
              category: produit.category,
              price: produit.price,
              quantity: produit.quantity,
              weightKg: produit.weightKg,
              imageUrl: produit.images[0]?.url ?? null,
            }}
          />
        </div>
      </main>
    </div>
  );
}
