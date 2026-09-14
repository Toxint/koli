/**
 * Les NUMÉROS DE RETRAIT enregistrés par un vendeur (§43) — la règle, pure.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Demande de l'utilisateur, le 14 septembre 2026 : un vendeur ne doit pas │
 * │  retaper son numéro Mobile Money à chaque retrait. Il l'enregistre une   │
 * │  fois, avec le nom exact du titulaire, et le CHOISIT ensuite.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ **Cela défait en partie une garde existante, et il faut savoir laquelle.**
 * Le numéro était redemandé à chaque versement pour qu'un transfert ne parte
 * jamais vers une ligne résiliée sans que personne ne le voie. Ce qui remplace
 * cette garde n'est pas la confiance : c'est que le vendeur **choisit**
 * explicitement un compte à chaque demande, en lisant à l'écran le numéro
 * complet et le nom du titulaire. Un pré-remplissage silencieux, lui, reste
 * interdit — c'est exactement ce qu'on ne veut pas.
 *
 * Comme `versement.ts`, ce module ne touche ni la base ni le réseau : il répond
 * à « pourquoi ce numéro est-il refusé ? », et rien d'autre.
 */

/** Au-delà, la liste devient un tiroir où l'on choisit mal. */
export const COMPTES_RETRAIT_MAX = 5;

/** Un numéro sans indicatif fait déjà huit chiffres dans la zone desservie. */
const CHIFFRES_MINIMUM = 8;

/** Un nom de titulaire plus court n'en est pas un. */
const NOM_MINIMUM = 3;

export interface CompteRetraitSaisi {
  /** Le numéro Mobile Money, tel qu'il a été tapé. */
  telephone: string;
  /** L'opérateur choisi dans la liste du pays du vendeur. */
  operateur: string;
  /** Le nom du titulaire du compte Mobile Money. */
  titulaire: string;
  /** Les opérateurs que le prestataire dessert dans le pays du vendeur. */
  operateursAutorises: readonly string[];
  /** Les numéros DÉJÀ enregistrés par ce vendeur — celui qu'on modifie exclu. */
  numerosDejaEnregistres: readonly string[];
  /** Combien de comptes le vendeur possède déjà — celui qu'on modifie exclu. */
  comptesExistants: number;
}

/** Les seuls chiffres, pour comparer deux écritures d'un même numéro. */
export function chiffresDe(telephone: string): string {
  return telephone.replace(/\D/g, "");
}

/**
 * Deux écritures désignent-elles le même numéro ?
 *
 * « +225 07 01 02 03 04 » et « 0701020304 » sont la même ligne. Comparer les
 * chaînes telles quelles laisserait le même numéro s'enregistrer deux fois sous
 * deux formes — et le vendeur choisirait alors entre deux entrées identiques,
 * ce qui est précisément la confusion qu'on veut éviter au moment de décider où
 * part l'argent.
 *
 * On compare donc les chiffres, et l'un peut être le SUFFIXE de l'autre :
 * c'est ce que fait un indicatif pays. La comparaison exige au moins huit
 * chiffres communs, sinon deux numéros courts sans rapport se confondraient.
 */
export function memeNumero(a: string, b: string): boolean {
  const x = chiffresDe(a);
  const y = chiffresDe(b);
  if (x.length < CHIFFRES_MINIMUM || y.length < CHIFFRES_MINIMUM) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

/**
 * Le motif qui EMPÊCHE d'enregistrer ce numéro, ou `null`.
 *
 * ── L'ORDRE suit le FORMULAIRE, et ce n'est pas un détail ───────────────────
 *
 * Numéro, puis opérateur, puis titulaire : c'est l'ordre des champs à l'écran.
 * Un message qui saute au troisième champ pendant que le premier est vide fait
 * croire que le premier est bon — on corrige alors ce qui n'était pas en cause,
 * et l'on recommence. Les contrôles de FORME passent avant ceux qui regardent
 * les autres comptes : « ce numéro est déjà enregistré » n'a aucun sens tant
 * qu'on ne sait pas si c'en est un.
 */
export function refusDeCompteRetrait(saisi: CompteRetraitSaisi): string | null {
  const telephone = saisi.telephone.trim();
  const operateur = saisi.operateur.trim();
  const titulaire = saisi.titulaire.trim();

  if (chiffresDe(telephone).length < CHIFFRES_MINIMUM) {
    return "Ce numéro ne ressemble pas à un numéro Mobile Money. Vérifiez-le : c'est là que l'argent sera envoyé.";
  }

  if (!operateur) {
    return "Choisissez l'opérateur de ce numéro.";
  }

  /*
   * L'opérateur est CHOISI dans une liste, pas écrit librement.
   *
   * La liste est celle que le prestataire dessert dans le pays du vendeur. Un
   * opérateur inventé — ou celui d'un pays voisin — produirait un versement
   * qu'aucune application de transfert ne sait exécuter, et l'administration ne
   * le découvrirait qu'au moment d'envoyer.
   */
  if (
    saisi.operateursAutorises.length > 0 &&
    !saisi.operateursAutorises.includes(operateur)
  ) {
    return "Cet opérateur n'est pas desservi dans votre pays. Choisissez-en un dans la liste.";
  }

  if (titulaire.length < NOM_MINIMUM) {
    return "Indiquez le nom exact du titulaire de ce compte Mobile Money, tel qu'il s'affiche lors d'un transfert.";
  }

  if (saisi.numerosDejaEnregistres.some((n) => memeNumero(n, telephone))) {
    return "Ce numéro est déjà enregistré.";
  }

  /* La borne ne protège pas la base — cinq lignes ne coûtent rien — mais le
     moment du choix : une liste longue se parcourt mal sur un téléphone, et
     l'on y coche vite le mauvais. */
  if (saisi.comptesExistants >= COMPTES_RETRAIT_MAX) {
    return `Vous avez déjà ${COMPTES_RETRAIT_MAX} numéros enregistrés. Supprimez-en un avant d'en ajouter un autre.`;
  }

  return null;
}

/**
 * Comment le compte s'annonce dans une liste de choix.
 *
 * Le NUMÉRO d'abord, parce que c'est lui qui décide où part l'argent ; le nom
 * du titulaire ensuite, parce que c'est lui qui trahit un chiffre inversé ; le
 * surnom en dernier, parce qu'il n'engage rien. Même raisonnement que le
 * symbole de monnaie placé en tête des options de pays : ce qui décide vient
 * avant ce qui peut être tronqué.
 */
export function libelleDuCompte(compte: {
  phone: string;
  holderName: string;
  operator: string;
  label?: string | null;
}): string {
  const surnom = compte.label?.trim();
  return [
    compte.phone,
    compte.holderName,
    compte.operator,
    surnom ? `« ${surnom} »` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
