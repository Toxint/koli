import type { NavItem } from "@/components/ui/DashboardNav";

/**
 * Navigation de chaque espace (§10).
 *
 * Source unique : les entrees etaient recopiees sur chaque page, au risque de
 * diverger. Regle stricte — on n'y met QUE des routes existantes : un lien qui
 * mene a une page 404 est pire que pas de lien.
 */

export const NAV_VENDEUR: NavItem[] = [
  { label: "Tableau de bord", href: "/vendeur/dashboard" },
  { label: "Commandes", href: "/vendeur/commandes" },
  { label: "Nouvelle commande", href: "/vendeur/commandes/nouvelle" },
  { label: "Solde", href: "/vendeur/solde" },
  { label: "Profil", href: "/vendeur/profil" },
];

export const NAV_CLIENT: NavItem[] = [
  { label: "Mes commandes", href: "/client/dashboard" },
  { label: "Profil", href: "/client/profil" },
];

export const NAV_LIVREUR: NavItem[] = [
  { label: "Mes livraisons", href: "/livreur/dashboard" },
  { label: "Profil", href: "/livreur/profil" },
];

export const NAV_ADMIN: NavItem[] = [
  { label: "Vue d'ensemble", href: "/admin/dashboard" },
  { label: "Utilisateurs", href: "/admin/utilisateurs" },
  { label: "Profil", href: "/admin/profil" },
];
