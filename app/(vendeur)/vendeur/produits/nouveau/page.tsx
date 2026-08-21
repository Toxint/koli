import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/actions";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { NAV_VENDEUR } from "@/lib/navigation";
import { FormulaireProduit } from "@/components/domain/FormulaireProduit";

export default async function NouveauProduitPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

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
          <h1 className="text-2xl font-semibold tracking-tight">
            Ajouter un produit
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            Enregistré une fois, réutilisable sur toutes vos commandes.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-hairline dark:border-slate-800 shadow-sm p-6">
          <FormulaireProduit />
        </div>
      </main>
    </div>
  );
}
