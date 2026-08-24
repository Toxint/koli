import type { SellerVerificationStatus } from "@prisma/client";

/**
 * Libellés partagés de l'administration.
 *
 * **Ce fichier n'est PAS un module `"use server"`, et c'est délibéré.** Un
 * fichier portant cette directive ne peut exporter que des fonctions async :
 * y placer une constante fait échouer le rendu à l'exécution, avec
 * « A "use server" file can only export async functions, found object ».
 *
 * Le piège est que rien ne le signale avant le clic — ni TypeScript, ni le
 * linter, ni la construction. La page se charge, le bouton s'affiche, et c'est
 * l'action qui renvoie une erreur 500.
 */
export const LIBELLE_VERIFICATION: Record<SellerVerificationStatus, string> = {
  VERIFIED: "vérifié",
  PENDING: "en attente",
  REJECTED: "rejeté",
  SUSPENDED: "suspendu",
};
