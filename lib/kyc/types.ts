/**
 * Types de pièces attendues (§37).
 *
 * « La liste exacte des documents sera adaptée au pays et au partenaire
 * financier sélectionné. » Aucun partenaire n'est choisi : cette liste est
 * donc **provisoire et volontairement courte**, limitée à ce qu'un commerçant
 * ivoirien a raisonnablement sous la main.
 *
 * Elle vit ici, dans un module ordinaire, et non dans un fichier
 * `"use server"` : un tel fichier ne peut exporter que des fonctions async, et
 * l'erreur ne se voit qu'au clic.
 */
export const TYPES_PIECES = [
  {
    code: "IDENTITE",
    libelle: "Pièce d'identité",
    aide: "Carte nationale d'identité, passeport ou permis de conduire.",
  },
  {
    code: "SELFIE",
    libelle: "Photo de vous avec la pièce",
    aide: "Votre visage et la pièce lisibles sur la même photo.",
  },
  {
    code: "REGISTRE",
    libelle: "Document d'entreprise",
    aide: "Registre de commerce ou déclaration d'activité, si vous en avez un.",
  },
  {
    code: "ADRESSE",
    libelle: "Justificatif d'adresse",
    aide: "Facture d'électricité ou d'eau de moins de trois mois.",
  },
] as const;

export type CodePiece = (typeof TYPES_PIECES)[number]["code"];

/** Liste blanche : le code vient d'un formulaire, on ne le croit pas. */
export function estTypePieceConnu(valeur: unknown): valeur is CodePiece {
  return TYPES_PIECES.some((t) => t.code === valeur);
}

export function libellePiece(code: string): string {
  return TYPES_PIECES.find((t) => t.code === code)?.libelle ?? code;
}

/**
 * Les deux pièces sans lesquelles un dossier ne peut pas être examiné.
 *
 * Le registre de commerce et le justificatif d'adresse restent facultatifs :
 * beaucoup de commerçants du public visé n'en ont pas, et les exiger
 * fermerait la plateforme à ceux qu'elle veut servir.
 */
export const PIECES_REQUISES: CodePiece[] = ["IDENTITE", "SELFIE"];

export const LIBELLE_STATUT_KYC: Record<string, string> = {
  PENDING: "En attente d'examen",
  VERIFIED: "Acceptée",
  REJECTED: "Refusée",
};
