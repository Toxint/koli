/**
 * Libelles et couleurs des statuts de verification vendeur (§36).
 *
 * Module a part, et non exporte depuis le composant : une fonction exportee
 * par un fichier « use client » devient une reference client et ne peut plus
 * etre appelee lors du rendu serveur.
 */

const LIBELLES: Record<string, string> = {
  VERIFIED: "Vérifié",
  PENDING: "En attente",
  REJECTED: "Rejeté",
  SUSPENDED: "Suspendu",
};

const CLASSES: Record<string, string> = {
  VERIFIED: "bg-brand-soft text-brand",
  PENDING: "bg-test-mode-surface text-test-mode",
  REJECTED: "bg-red-50 text-danger",
  SUSPENDED: "bg-hairline text-ink-muted",
};

export function badgeVerification(statut: string) {
  return {
    libelle: LIBELLES[statut] ?? statut,
    classes: CLASSES[statut] ?? "bg-hairline text-ink-muted",
  };
}
