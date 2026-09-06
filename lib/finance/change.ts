import { type Devise, SYMBOLE } from "@/data/markets";
import { formatMontant } from "@/lib/format";

/**
 * LA CONVERSION EST INDICATIVE. Elle ne fait jamais foi.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Le vendeur fixe 2 000 FCFA : c'est ce qu'il reçoit, et c'est le montant │
 * │  que porte la commande. L'acheteur congolais voit « ≈ 8 100 FC » pour    │
 * │  savoir ce que cela représente chez lui — mais c'est iKeePay qui         │
 * │  convertit au moment du prélèvement, à SON taux.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * L'écart est mesuré, pas supposé : le 6 septembre 2026, notre source donnait
 * 1 XOF = 4,0506 CDF quand leur tunnel affichait 796 CDF pour 200 XOF, soit
 * 3,98. Environ 2 % — leur marge de change. Annoncer notre chiffre comme
 * définitif ferait donc mentir l'écran d'un client sur deux, et sur une
 * application dont le sujet est la confiance, c'est le pire endroit pour un
 * chiffre approximatif présenté comme exact.
 *
 * D'où le « ≈ », qui n'est pas décoratif, et le montant du vendeur affiché à
 * côté. Un acheteur doit pouvoir vérifier ce qu'on lui dit.
 *
 * ── Ce qui se passe quand le taux manque ────────────────────────────────────
 *
 * `convertir` rend `null`, et l'écran n'affiche RIEN de plus. Il ne montre pas
 * un taux périmé, ne devine pas, ne met pas « — ». Un montant absent se
 * remarque ; un montant faux se croit.
 */

/**
 * Les parités FIXES, connues sans réseau.
 *
 * XOF et XAF sont arrimés à l'euro au même taux (655,957) : un franc CFA
 * d'Afrique de l'Ouest vaut exactement un franc CFA d'Afrique centrale. Ce
 * n'est pas une approximation qu'on rafraîchit, c'est une décision monétaire —
 * aller la demander à une API serait payer un aller-retour réseau pour
 * apprendre que 1 = 1, et introduire une panne possible là où il n'y en a
 * aucune.
 */
function paritefixe(de: Devise, vers: Devise): number | null {
  if (de === vers) return 1;
  const cfa: Devise[] = ["XOF", "XAF"];
  if (cfa.includes(de) && cfa.includes(vers)) return 1;
  return null;
}

/** Ce que rend une conversion réussie. */
export interface Conversion {
  montant: number;
  taux: number;
  de: Devise;
  vers: Devise;
  /** Vrai si le taux vient d'une parité fixe, donc exact et sans réseau. */
  exact: boolean;
}

/**
 * Convertit un montant, ou rend `null` si le taux est hors d'atteinte.
 *
 * La réponse est mise en cache une heure par Next : les taux de change ne
 * bougent pas assez vite pour justifier un appel par affichage, et la page de
 * paiement est vue sur des réseaux lents (§70).
 */
export async function convertir(
  montant: number,
  de: Devise,
  vers: Devise
): Promise<Conversion | null> {
  const fixe = paritefixe(de, vers);
  if (fixe !== null) {
    return { montant: Math.round(montant * fixe), taux: fixe, de, vers, exact: true };
  }

  try {
    const reponse = await fetch(`https://open.er-api.com/v6/latest/${de}`, {
      // Une heure. Assez court pour suivre une monnaie qui glisse, assez long
      // pour qu'un pic de trafic ne fasse pas cent appels.
      next: { revalidate: 3600 },
      // Un écran de paiement qui attend un taux de change n'est plus un écran
      // de paiement. Au-delà, on renonce à la conversion et on garde la page.
      signal: AbortSignal.timeout(4000),
    });

    if (!reponse.ok) return null;

    const donnees = (await reponse.json()) as {
      result?: string;
      rates?: Record<string, number>;
    };

    if (donnees.result !== "success") return null;

    const taux = donnees.rates?.[vers];
    // `> 0` et non `!= null` : un taux à zéro rendrait un montant nul, c'est-à-dire
    // « gratuit » affiché sur un écran de paiement.
    if (typeof taux !== "number" || !(taux > 0)) return null;

    return { montant: Math.round(montant * taux), taux, de, vers, exact: false };
  } catch {
    // Réseau coupé, délai dépassé, réponse illisible : on ne convertit pas. La
    // page reste juste, simplement moins bavarde.
    return null;
  }
}

/**
 * La phrase à afficher sous un prix, ou `null` s'il n'y a rien à dire.
 *
 * Rend `null` quand les deux devises sont la même — répéter « 2 000 FCFA
 * ≈ 2 000 FCFA » n'aide personne — et quand le taux manque.
 */
export async function equivalentPourLAcheteur(
  montant: number,
  deviseVendeur: Devise,
  deviseAcheteur: Devise
): Promise<{ texte: string; exact: boolean } | null> {
  if (deviseVendeur === deviseAcheteur) return null;

  const c = await convertir(montant, deviseVendeur, deviseAcheteur);
  if (!c) return null;

  // Le « ≈ » disparaît pour une parité fixe : entre francs CFA, le montant est
  // exact, et un « environ » y serait une fausse modestie.
  return {
    texte: c.exact
      ? formatMontant(c.montant, deviseAcheteur)
      : `≈ ${formatMontant(c.montant, deviseAcheteur)}`,
    exact: c.exact,
  };
}

/** Le symbole d'une devise, pour les écrans qui n'affichent pas de montant. */
export function symbole(devise: Devise): string {
  return SYMBOLE[devise];
}
