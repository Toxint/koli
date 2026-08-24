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
  { label: "Factures", href: "/vendeur/factures", icone: "recu" },
  { label: "Transactions", href: "/vendeur/transactions", icone: "journal" },
  { label: "Solde", href: "/vendeur/solde", icone: "solde" },
  { label: "Profil", href: "/vendeur/profil", icone: "profil" },
];

export const NAV_CLIENT: NavItem[] = [
  { label: "Mes commandes", href: "/client/dashboard", icone: "commandes" },
  { label: "Mes reçus", href: "/client/factures", icone: "recu" },
  { label: "Profil", href: "/client/profil", icone: "profil" },
];

export const NAV_LIVREUR: NavItem[] = [
  { label: "Mes livraisons", href: "/livreur/dashboard", icone: "livraisons" },
  { label: "Profil", href: "/livreur/profil", icone: "profil" },
];

/**
 * Navigation, accueil et libellé d'un rôle.
 *
 * La page de notifications sert les quatre espaces : elle ne peut pas savoir à
 * l'avance quel menu afficher. Ces trois fonctions évitent d'y recopier une
 * cascade de `if` qui divergerait du reste à la première modification.
 */
export function navigationDuRole(role: string): NavItem[] {
  switch (role) {
    case "SELLER":
      return NAV_VENDEUR;
    case "DRIVER":
      return NAV_LIVREUR;
    case "ADMIN":
      return NAV_ADMIN;
    default:
      return NAV_CLIENT;
  }
}

export function accueilDuRole(role: string): string {
  switch (role) {
    case "SELLER":
      return "/vendeur/dashboard";
    case "DRIVER":
      return "/livreur/dashboard";
    case "ADMIN":
      return "/admin/dashboard";
    default:
      return "/client/dashboard";
  }
}

export function libelleRole(role: string): string {
  switch (role) {
    case "SELLER":
      return "Vendeur";
    case "DRIVER":
      return "Livreur";
    case "ADMIN":
      return "Administrateur";
    default:
      return "Client";
  }
}

export const NAV_ADMIN: NavItem[] = [
  { label: "Vue d'ensemble", href: "/admin/dashboard", icone: "tableau" },
  { label: "Utilisateurs", href: "/admin/utilisateurs", icone: "utilisateurs" },
  { label: "Vendeurs", href: "/admin/vendeurs", icone: "vendeurs" },
  { label: "Litiges", href: "/admin/litiges", icone: "bouclier" },
  { label: "Remboursements", href: "/admin/remboursements", icone: "argent" },
  { label: "Journal", href: "/admin/journal", icone: "document" },
  { label: "Transactions", href: "/admin/transactions", icone: "journal" },
  { label: "Commissions", href: "/admin/commissions", icone: "pourcentage" },
  { label: "Profil", href: "/admin/profil", icone: "profil" },
];
