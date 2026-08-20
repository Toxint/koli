// Marchés desservis par KOLI : indicatif téléphonique et zone monétaire.
// Source unique — le formulaire de commande dupliquait cette liste en dur.

/**
 * Deux zones monétaires distinctes, toutes deux appelées « franc CFA » dans le
 * langage courant mais NON interchangeables :
 *  - XOF : UEMOA, Afrique de l'Ouest ;
 *  - XAF : CEMAC, Afrique Centrale (le Cameroun en fait partie).
 *
 * Le code traitait toutes les commandes comme des XOF, y compris
 * camerounaises. L'affichage reste « FCFA » (c'est l'usage local, correct dans
 * les deux zones), mais la devise réelle est désormais stockée par commande —
 * sans quoi un vrai prestataire de paiement recevrait une devise erronée.
 */
export type Devise = "XOF" | "XAF";

export interface Market {
  code: string;
  name: string;
  dialCode: string;
  devise: Devise;
}

export const markets: Market[] = [
  { code: "CI", name: "Côte d'Ivoire", dialCode: "+225", devise: "XOF" },
  { code: "SN", name: "Sénégal", dialCode: "+221", devise: "XOF" },
  { code: "CM", name: "Cameroun", dialCode: "+237", devise: "XAF" },
  { code: "BJ", name: "Bénin", dialCode: "+229", devise: "XOF" },
  { code: "TG", name: "Togo", dialCode: "+228", devise: "XOF" },
  { code: "ML", name: "Mali", dialCode: "+223", devise: "XOF" },
  { code: "BF", name: "Burkina Faso", dialCode: "+226", devise: "XOF" },
];

/**
 * Devise d'un pays, désigné par son nom tel que saisi dans la commande.
 * Repli sur XOF : la majorité des marchés desservis, et le pays est libre à la
 * saisie tant que le sélecteur n'est pas contraint.
 */
export function deviseDuPays(nomPays: string): Devise {
  const normalise = nomPays.trim().toLowerCase();
  const marche = markets.find(
    (m) => m.name.toLowerCase() === normalise || m.code.toLowerCase() === normalise
  );
  return marche?.devise ?? "XOF";
}
