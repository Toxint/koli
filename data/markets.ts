// Marchés desservis par KOLI : indicatif téléphonique et zone monétaire.
//
// ── D'où vient cette liste ──────────────────────────────────────────────────
//
// Elle est calquée sur la COUVERTURE RÉELLE d'iKeePay (tableau de bord,
// section « Business » → « Couverture », relevée le 6 septembre 2026). Un pays
// qui figure ici mais pas chez eux produirait une commande impayable : le
// tunnel s'ouvrirait sans proposer un seul opérateur, et l'acheteur
// conclurait que le service est cassé.
//
// C'est exactement ce qui est arrivé. La liste ne comptait que sept pays
// d'Afrique de l'Ouest ; l'utilisateur, qui est en RDC, a créé une commande
// tombée par défaut en Côte d'Ivoire. Le tunnel a converti l'affichage en CDF
// mais la transaction restait ivoirienne, et aucun opérateur congolais n'était
// proposé.
//
// ⚠ Toute modification doit être vérifiée contre leur page de couverture. Ils
// ajoutent des pays — « D'autres pays seront bientôt disponibles ».

/**
 * Les devises que KOLI manipule.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Elles n'ont PAS la même valeur, et c'est nouveau.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Tant que la liste se limitait à XOF et XAF, la question ne se posait pas :
 * les deux francs CFA sont arrimés à l'euro au même taux (655,957) et valent
 * donc exactement la même chose. Un montant pouvait passer de l'un à l'autre
 * sans qu'aucun chiffre ne change.
 *
 * Avec le franc congolais — 1 XOF vaut environ 4 CFD — ou le naira, ce n'est
 * plus vrai. Un montant sans sa devise n'est plus un montant, c'est un nombre.
 */
export type Devise =
  | "XOF" // franc CFA, Afrique de l'Ouest
  | "XAF" // franc CFA, Afrique centrale
  | "CDF" // franc congolais
  | "GHS" // cedi ghanéen
  | "NGN" // naira nigérian
  | "SLE" // leone sierra-léonais
  | "KES" // shilling kényan
  | "TZS" // shilling tanzanien
  | "RWF" // franc rwandais
  | "UGX" // shilling ougandais
  | "ZMW" // kwacha zambien
  | "GMD" // dalasi gambien
  /*
   * Le DOLLAR, qui n'est le pays d'aucun marché.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │  Les douze autres viennent d'un pays. Celle-ci vient d'un USAGE.     │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * À Kinshasa, une part importante du commerce s'affiche en dollars, et le
   * franc congolais sert d'appoint. Un vendeur à qui l'on impose le CDF parce
   * que son pays est la RDC affiche donc des prix dans une monnaie qu'il
   * n'utilise pas.
   *
   * Elle n'apparaît dans AUCUN `Marche` : aucun pays ne l'a pour monnaie
   * officielle ici, et `deviseDuPays` ne la rendra jamais. Elle n'existe que
   * comme CHOIX du vendeur.
   *
   * ⚠ **Rien ne prouve qu'iKeePay l'accepte dans son tunnel.** Ils convertissent
   * vers la monnaie locale du payeur — 796 CDF encaissés pour 200 XOF — mais la
   * devise de départ leur est passée telle quelle, et USD n'a jamais été
   * essayé. Si leur tunnel la refuse, l'acheteur ne peut pas payer du tout.
   * Question posée dans la relance du 10 septembre 2026.
   */
  | "USD"; // dollar américain — un usage, pas un pays

export interface Marche {
  code: string;
  name: string;
  dialCode: string;
  devise: Devise;
  /** Les opérateurs qu'iKeePay dessert dans ce pays, tels qu'ils les nomment. */
  operateurs: string[];
}

export const MARCHES: Marche[] = [
  // ── Afrique de l'Ouest, franc CFA ──
  { code: "CI", name: "Côte d'Ivoire", dialCode: "+225", devise: "XOF", operateurs: ["Orange Money", "MTN"] },
  { code: "SN", name: "Sénégal", dialCode: "+221", devise: "XOF", operateurs: ["Orange Money", "Free Money"] },
  { code: "BJ", name: "Bénin", dialCode: "+229", devise: "XOF", operateurs: ["Moov", "MTN"] },
  { code: "BF", name: "Burkina Faso", dialCode: "+226", devise: "XOF", operateurs: ["Orange", "Mobicash"] },

  // ── Afrique centrale, franc CFA ──
  { code: "CM", name: "Cameroun", dialCode: "+237", devise: "XAF", operateurs: ["MTN", "Orange"] },
  { code: "GA", name: "Gabon", dialCode: "+241", devise: "XAF", operateurs: ["Airtel"] },
  { code: "CG", name: "République du Congo", dialCode: "+242", devise: "XAF", operateurs: ["Airtel", "MTN"] },

  // ── Le reste, chacun sa monnaie ──
  { code: "CD", name: "République Démocratique du Congo", dialCode: "+243", devise: "CDF", operateurs: ["Airtel", "Orange", "Vodacom"] },
  { code: "GH", name: "Ghana", dialCode: "+233", devise: "GHS", operateurs: ["Airtel", "MTN", "Vodafone"] },
  { code: "NG", name: "Nigeria", dialCode: "+234", devise: "NGN", operateurs: ["OPay", "Moniepoint", "MTN", "Airtel"] },
  { code: "SL", name: "Sierra Leone", dialCode: "+232", devise: "SLE", operateurs: ["Orange"] },
  { code: "KE", name: "Kenya", dialCode: "+254", devise: "KES", operateurs: ["M-Pesa"] },
  { code: "TZ", name: "Tanzanie", dialCode: "+255", devise: "TZS", operateurs: ["Airtel", "Halopesa", "Tigo"] },
  { code: "RW", name: "Rwanda", dialCode: "+250", devise: "RWF", operateurs: ["Airtel", "MTN MoMo"] },
  { code: "UG", name: "Ouganda", dialCode: "+256", devise: "UGX", operateurs: ["Airtel", "MTN MoMo"] },
  { code: "ZM", name: "Zambie", dialCode: "+260", devise: "ZMW", operateurs: ["Airtel", "MTN", "Zamtel"] },
  { code: "GM", name: "Gambie", dialCode: "+220", devise: "GMD", operateurs: ["QMoney", "Afrimoney"] },
];

/**
 * Comment chaque devise s'écrit à côté d'un montant.
 *
 * « FCFA » était écrit en dur dans `formatCFA` et dans une trentaine d'écrans.
 * Un montant congolais affiché « 796 FCFA » ne serait pas une imprécision, ce
 * serait un chiffre faux d'un facteur quatre — sur une application dont le
 * sujet est la confiance entre un acheteur et un vendeur qui ne se connaissent
 * pas.
 */
export const SYMBOLE: Record<Devise, string> = {
  XOF: "FCFA",
  XAF: "FCFA",
  CDF: "FC",
  GHS: "GH₵",
  NGN: "₦",
  SLE: "Le",
  KES: "KSh",
  TZS: "TSh",
  RWF: "RF",
  UGX: "USh",
  ZMW: "ZK",
  GMD: "D",
  /*
   * « USD » et non « $ », pour deux raisons.
   *
   * D'abord la clarté : dans une application qui porte treize monnaies, « $ »
   * ne dit pas laquelle — le dollar canadien, australien et zimbabwéen le
   * portent aussi.
   *
   * Ensuite, plus prosaïquement : `verif:devises` cherche les symboles écrits
   * en dur dans les sources. Un « $ » y déclencherait sur chaque `${…}` du
   * projet, et un contrôle qui crie à tort finit par ne plus être lu.
   */
  USD: "USD",
};

/**
 * Devise d'un pays, désigné par son nom tel que saisi dans la commande.
 *
 * ⚠ **Le repli sur XOF est un choix par défaut, pas une vérité.** Il existe
 * parce qu'une commande sans devise ne peut pas être créée ; mais un pays
 * inconnu qui retombe silencieusement sur le franc CFA produit un montant
 * faux. `estUnMarcheConnu` permet de refuser en amont plutôt que de deviner.
 */
export function deviseDuPays(nomPays: string): Devise {
  return marcheDuPays(nomPays)?.devise ?? "XOF";
}

/** Le marché correspondant à un nom de pays, ou `null`. */
export function marcheDuPays(nomPays: string): Marche | null {
  const normalise = nomPays.trim().toLowerCase();
  return (
    MARCHES.find(
      (m) => m.name.toLowerCase() === normalise || m.code.toLowerCase() === normalise
    ) ?? null
  );
}

/** Vrai si KOLI — et donc iKeePay — dessert ce pays. */
export function estUnMarcheConnu(nomPays: string): boolean {
  return marcheDuPays(nomPays) !== null;
}

/**
 * Restreint une chaine venue de la base au type `Devise`.
 *
 * `Order.currency` est une colonne `String` : le schema ne peut pas garantir
 * qu elle porte une devise connue. Elle n est ecrite que par `deviseDuPays`,
 * donc le cas ne devrait pas se produire — mais « ne devrait pas » n est pas
 * « ne peut pas », et un transtypage aveugle ferait chercher un symbole qui
 * n existe pas, donc afficher `undefined` a cote d un montant.
 *
 * Le repli sur XOF est DELIBERE et visible : il vaut mieux un franc CFA affiche
 * a tort qu un montant sans unite. Mais si ce repli sert un jour, c est que la
 * base porte une valeur qu on n a pas prevue.
 */
export function commeDevise(valeur: string): Devise {
  return valeur in SYMBOLE ? (valeur as Devise) : "XOF";
}

/**
 * La devise d'un vendeur — celle de TOUS ses prix.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  C'est le VENDEUR qui fixe le prix, donc c'est lui qui fixe la monnaie.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La commande prenait la devise de l'ACHETEUR. Tant que les sept marchés
 * desservis étaient tous en franc CFA, cela ne se voyait pas : XOF et XAF sont
 * arrimés à l'euro au même taux. Avec la RDC, un vendeur ivoirien vendant
 * 2 000 XOF à un acheteur congolais aurait encaissé 2 000 CDF — environ 500
 * XOF, le quart de son dû, et rien ne l'aurait signalé.
 *
 * L'acheteur voit une conversion à l'écran (`lib/finance/change.ts`) et
 * iKeePay le débite dans sa propre monnaie ; mais le montant qui fait foi, sur
 * la commande comme au séquestre, reste celui du vendeur.
 *
 * ⚠ **La devise CHOISIE l'emporte sur celle du pays.** Le pays ne dit pas
 * toujours la monnaie : à Kinshasa une part importante du commerce s'affiche en
 * dollars. `currency` est nulle par défaut, et l'on retombe alors sur le pays
 * — les comptes créés avant ce champ gardent donc exactement leur
 * comportement, sans qu'on ait à leur écrire quoi que ce soit.
 *
 * ⚠ `country` est nul pour les comptes créés avant que ce champ n'existe. Le
 * repli sur XOF est alors correct — ces comptes sont tous ivoiriens, le pays
 * ayant été écrit en dur à l'inscription — mais il reste un repli : un vendeur
 * qui n'a pas déclaré son pays vend en francs CFA sans l'avoir choisi.
 */
export function deviseDuVendeur(
  profil:
    | { country?: string | null; currency?: string | null }
    | null
    | undefined
): Devise {
  /*
   * ELLE PREND LE PROFIL, PAS LE PAYS — et ce n'est pas une commodité.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │  Signature précédente : `deviseDuVendeur(pays)`. Douze écrans        │
   * │  l'appelaient, chacun une occasion d'oublier la devise choisie.      │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * En prenant l'objet, un appelant ne PEUT plus passer le pays seul : le
   * compilateur le refuse. C'est le même raisonnement que `data-mention-test`
   * (§8) — quand une règle doit tenir dans vingt-sept endroits, on ne la
   * confie pas à la mémoire de celui qui écrit le vingt-huitième.
   */
  const choisie = profil?.currency?.trim();

  /*
   * Une valeur inconnue en base est IGNORÉE, pas affichée.
   *
   * `currency` est une chaîne libre : une reprise de données, une faute de
   * frappe, une devise retirée de la liste. `commeDevise` retomberait sur XOF
   * — ce qui masquerait le pays du vendeur derrière un franc CFA arbitraire.
   * Ici on préfère revenir au PAYS, qui reste une information vraie.
   */
  if (choisie && choisie in SYMBOLE) return choisie as Devise;

  return profil?.country ? deviseDuPays(profil.country) : "XOF";
}
