import type { NomIcone } from "@/components/ui/Icone";

export interface NavItem {
  label: string;
  href: string;
  icone: NomIcone;
  /**
   * Rangee dans le menu « Plus » plutot que dans le ruban.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │  Le menu est passe d'une colonne VERTICALE a un ruban HORIZONTAL.    │
   * │  Une colonne accepte onze entrees ; un ruban, non.                   │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * Mesure a 1280 px : les onze entrees du vendeur font 1351 px pour 776
   * disponibles — « Mes livreurs » etait coupe, et les quatre suivantes
   * n'apparaissaient pas du tout. Elles restaient atteignables en faisant
   * defiler, mais une entree qu'il faut chercher n'est pas une entree.
   *
   * Ce qui reste au ruban : ce qu'on ouvre chaque jour. Ce qui passe dans
   * « Plus » : ce qu'on ouvre quand on en a besoin.
   */
  secondaire?: boolean;
  /**
   * Libelle COURT, pour le ruban horizontal.
   *
   * « Tableau de bord » fait 170 px avec son icone ; « Accueil », 100. Sur six
   * entrees, ces soixante-dix pixels decident si « Solde » s'affiche ou s'il
   * faut aller le chercher en faisant defiler.
   *
   * ⚠ Il ne remplace PAS `label` : le menu « Plus », les tiroirs et tout ce
   * qui a de la place gardent le nom entier. Un libelle court partout serait
   * un appauvrissement ; ici il achete une entree visible.
   */
  court?: string;
  /**
   * C'est une ACTION, pas une section.
   *
   * « Nouvelle commande » ne decrit pas un endroit ou l'on va, mais quelque
   * chose que l'on fait. Elle s'affiche donc comme un bouton, a droite du
   * ruban — comme le « + Add New Item » de la maquette de reference.
   */
  action?: boolean;
}

/**
 * Navigation de chaque espace (§10).
 *
 * Source unique : les entrees etaient recopiees sur chaque page, au risque de
 * diverger. Regle stricte — on n'y met QUE des routes existantes : un lien qui
 * mene a une page 404 est pire que pas de lien.
 */

export const NAV_VENDEUR: NavItem[] = [
  {
    label: "Tableau de bord",
    court: "Accueil",
    href: "/vendeur/dashboard",
    icone: "tableau",
  },
  { label: "Commandes", href: "/vendeur/commandes", icone: "commandes" },
  {
    label: "Nouvelle commande",
    href: "/vendeur/commandes/nouvelle",
    icone: "nouveau",
    action: true,
  },
  { label: "Catalogue", href: "/vendeur/produits", icone: "catalogue" },
  { label: "Clients", href: "/vendeur/clients", icone: "utilisateurs" },
  // §5.3 — « Au debut, chaque vendeur peut utiliser son propre livreur. »
  // Place juste apres les clients : ce sont les deux carnets d'adresses du
  // vendeur, et on les cherche au meme endroit.
  { label: "Mes livreurs", href: "/vendeur/livreurs", icone: "livreur", secondaire: true },
  { label: "Factures", href: "/vendeur/factures", icone: "recu" },
  { label: "Transactions", href: "/vendeur/transactions", icone: "journal", secondaire: true },
  { label: "Solde", href: "/vendeur/solde", icone: "solde" },
  {
    label: "Vérification",
    href: "/vendeur/verification",
    icone: "bouclier",
    secondaire: true,
  },
  /*
   * Le profil est SECONDAIRE ici, mais il reste dans la liste.
   *
   * La barre l'affiche deja dans le menu du compte — c'est la qu'on le
   * cherche. Le retirer d'ici casserait pourtant `hrefProfil`, qui le trouve
   * par son icone, et le tiroir de « Plus » perdrait une entree que certains
   * espaces n'ont nulle part ailleurs.
   */
  { label: "Profil", href: "/vendeur/profil", icone: "profil", secondaire: true },
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
  { label: "Vérifications", href: "/admin/verifications", icone: "cadenas" },
  { label: "Litiges", href: "/admin/litiges", icone: "bouclier" },
  { label: "Remboursements", href: "/admin/remboursements", icone: "argent" },
  /* §43 — la file des versements aux vendeurs. C'est le seul écran de KOLI
     depuis lequel de l'argent SORT de la plateforme : il n'est pas rangé dans
     « Transactions », qui ne fait que lire le grand livre. */
  { label: "Versements", href: "/admin/versements", icone: "solde" },
  /* Le rapprochement quotidien avec iKeePay : tant qu'ils n'offrent aucune
     route de vérification, un rappel perdu ne se voit QUE là. Rangé à côté des
     versements parce que c'est la même personne, le même jour, devant le même
     tableau de bord iKeePay. */
  { label: "Rapprochement", href: "/admin/rapprochement", icone: "horloge" },
  { label: "Journal", href: "/admin/journal", icone: "document" },
  { label: "Transactions", href: "/admin/transactions", icone: "journal" },
  { label: "Commissions", href: "/admin/commissions", icone: "pourcentage" },
  { label: "Profil", href: "/admin/profil", icone: "profil" },
];
