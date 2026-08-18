// Marchés desservis par Koli et leur indicatif téléphonique.
// Utilisé pour le sélecteur de pays du formulaire de livraison.

export interface Market {
  code: string;
  name: string;
  dialCode: string;
}

export const markets: Market[] = [
  { code: "CI", name: "Côte d'Ivoire", dialCode: "+225" },
  { code: "SN", name: "Sénégal", dialCode: "+221" },
  { code: "CM", name: "Cameroun", dialCode: "+237" },
  { code: "BJ", name: "Bénin", dialCode: "+229" },
  { code: "TG", name: "Togo", dialCode: "+228" },
  { code: "ML", name: "Mali", dialCode: "+223" },
  { code: "BF", name: "Burkina Faso", dialCode: "+226" },
];
