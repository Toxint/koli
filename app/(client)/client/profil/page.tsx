import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { DashboardNav } from "@/components/ui/DashboardNav";
import { NAV_CLIENT } from "@/lib/navigation";
import { FormulaireProfil } from "@/components/domain/FormulaireProfil";

export const metadata: Metadata = { title: "Mon profil" };

export default async function ProfilPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "CLIENT") {
    redirect("/connexion");
  }

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <DashboardNav
        userName={user.name}
        roleName="Client"
        roleBadgeColor="bg-brand-soft text-brand border border-brand-border"
        homeHref="/client/dashboard"
        navItems={NAV_CLIENT}
      />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Mon profil
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Vos informations de compte et votre mot de passe.
          </p>
        </div>

        <FormulaireProfil
          initial={{
            name: user.name,
            phone: user.phone,
            email: user.email ?? "",
            role: user.role,
            // Un compte cree via Google n'a pas de mot de passe : le formulaire
            // propose alors d'en definir un premier plutot que d'en changer.
            aMotDePasse: user.passwordHash !== null,
            ...(user.sellerProfile
              ? { businessName: user.sellerProfile.businessName }
              : {}),
            ...(user.driverProfile
              ? { vehicle: user.driverProfile.vehicle }
              : {}),
            ...(user.customerProfile ? { city: user.customerProfile.city } : {}),
          }}
        />
      </main>
    </div>
  );
}
