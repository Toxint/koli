/**
 * Espace d'accueil de chaque role.
 *
 * Module a part, sans "use server" : la table etait recopiee a l'identique
 * dans lib/auth/actions.ts et dans middleware.ts. Deux copies d'une meme
 * correspondance finissent toujours par diverger, et le middleware est
 * precisement l'endroit ou une divergence produit une boucle de redirection.
 */
export function espaceParDefaut(role: string): string {
  switch (role) {
    case "SELLER":
      return "/vendeur/dashboard";
    case "DRIVER":
      return "/livreur/dashboard";
    case "CLIENT":
      return "/client/dashboard";
    case "ADMIN":
      return "/admin/dashboard";
    default:
      return "/";
  }
}
