import type { NomIcone } from "@/components/ui/Icone";

export interface NavItem {
  label: string;
  href: string;
  icone: NomIcone;
}

/**
 * Navigation de chaque espace (§10).
 *
 * Source unique : les entrees etaient recopiees sur chaque page, au risque de
 * diverger. Regle stricte — on n'y met QUE des routes existantes : un lien qui
 * mene a une page 404 est pire que pas de lien.
 */

export const NAV_VENDEUR: NavItem[] = [
  { label: "Tableau de bord", href: "/vendeur/dashboard", icone: "tableau" },
  { label: "Commandes", href: "/vendeur/commandes", icone: "commandes" },
  {
    label: "Nouvelle commande",
    href: "/vendeur/commandes/nouvelle",
    icone: "nouveau",
  },
  { label: "Catalogue", href: "/vendeur/produits", icone: "catalogue" },
  { label: "Clients", href: "/vendeur/clients", icone: "utilisateurs" },
  { label: "Solde", href: "/vendeur/solde", icone: "solde" },
  { label: "Profil", href: "/vendeur/profil", icone: "profil" },
];

export const NAV_CLIENT: NavItem[] = [
  { label: "Mes commandes", href: "/client/dashboard", icone: "commandes" },
  { label: "Profil", href: "/client/profil", icone: "profil" },
];

export const NAV_LIVREUR: NavItem[] = [
  { label: "Mes livraisons", href: "/livreur/dashboard", icone: "livraisons" },
  { label: "Profil", href: "/livreur/profil", icone: "profil" },
];

export const NAV_ADMIN: NavItem[] = [
  { label: "Vue d'ensemble", href: "/admin/dashboard", icone: "tableau" },
  { label: "Utilisateurs", href: "/admin/utilisateurs", icone: "utilisateurs" },
  { label: "Vendeurs", href: "/admin/vendeurs", icone: "vendeurs" },
  { label: "Litiges", href: "/admin/litiges", icone: "bouclier" },
  { label: "Remboursements", href: "/admin/remboursements", icone: "argent" },
  { label: "Profil", href: "/admin/profil", icone: "profil" },
];
