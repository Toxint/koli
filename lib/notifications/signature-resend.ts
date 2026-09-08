import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * LA SIGNATURE DES RAPPELS RESEND, et pourquoi elle change tout.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  iKeePay ne signe RIEN — faute de mieux, son adresse de rappel porte un  │
 * │  jeton secret, ce qui prouve seulement que l'appelant connaît un secret. │
 * │  Resend, lui, signe. On peut donc croire le CORPS, pas seulement         │
 * │  l'appelant.                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * La différence n'est pas théorique : un jeton dans une URL voyage dans les
 * journaux de tout ce qui se trouve entre eux et nous. Une signature prouve
 * que le corps vient d'eux ET qu'il n'a pas été modifié en chemin.
 *
 * ── Le format est celui de Svix ────────────────────────────────────────────
 *
 * Resend délègue ses rappels à Svix. Trois en-têtes :
 *
 *   svix-id         l'identifiant du message
 *   svix-timestamp  l'horodatage, en secondes
 *   svix-signature  « v1,<base64> », parfois PLUSIEURS séparées par un espace
 *
 * Ce qui est signé est `<id>.<timestamp>.<corps brut>`, en HMAC-SHA256, avec
 * le secret décodé depuis sa forme `whsec_<base64>`.
 *
 * ── Écrit à la main, sans la bibliothèque Svix ─────────────────────────────
 *
 * Quinze lignes de `node:crypto` contre une dépendance de plus à installer,
 * mettre à jour et auditer — le même raisonnement que pour le SDK Resend, et
 * ici il pèse davantage : c'est du code de sécurité, et je préfère qu'il soit
 * lisible en entier sur un écran.
 */

/** Cinq minutes. Au-delà, un rappel rejoué n'est plus un rappel. */
export const TOLERANCE_HORAIRE_S = 5 * 60;

export interface EnTetesSvix {
  id: string | null;
  horodatage: string | null;
  signature: string | null;
}

export type VerdictSignature =
  | { valide: true }
  | { valide: false; motif: string };

/**
 * Le corps vient-il bien de Resend, et intact ?
 *
 * `corpsBrut` doit être le texte REÇU, jamais un objet re-sérialisé : la
 * signature porte sur des octets, et `JSON.stringify` réordonne les clefs.
 */
export function verifierSignatureResend(
  corpsBrut: string,
  entetes: EnTetesSvix,
  secret: string,
  maintenantMs: number = Date.now()
): VerdictSignature {
  if (!secret?.trim()) return { valide: false, motif: "aucun secret configure" };
  if (!entetes.id || !entetes.horodatage || !entetes.signature) {
    return { valide: false, motif: "en-tetes svix incomplets" };
  }

  /*
   * L'HORODATAGE EST VERIFIE AVANT LA SIGNATURE.
   *
   * Une signature reste valable éternellement : sans cette borne, un rappel
   * capté une fois pourrait être rejoué des mois plus tard, avec sa signature
   * authentique. C'est précisément ce que la fenêtre empêche.
   */
  const secondes = Number(entetes.horodatage);
  if (!Number.isFinite(secondes)) {
    return { valide: false, motif: "horodatage illisible" };
  }
  const ecart = Math.abs(maintenantMs / 1000 - secondes);
  if (ecart > TOLERANCE_HORAIRE_S) {
    return { valide: false, motif: `horodatage hors fenetre (${Math.round(ecart)}s)` };
  }

  let clef: Buffer;
  try {
    // `whsec_` n'est qu'un préfixe lisible ; le secret est ce qui suit, en base64.
    clef = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return { valide: false, motif: "secret illisible" };
  }
  if (clef.length === 0) return { valide: false, motif: "secret vide" };

  const attendue = createHmac("sha256", clef)
    .update(`${entetes.id}.${entetes.horodatage}.${corpsBrut}`)
    .digest();

  /*
   * PLUSIEURS signatures peuvent arriver, séparées par des espaces.
   *
   * C'est ainsi que Svix fait tourner ses clefs : pendant la rotation, il
   * envoie l'ancienne ET la nouvelle. N'en lire qu'une ferait échouer tous
   * les rappels le jour où ils changent de clef — une panne totale, à une
   * date qu'on ne choisit pas.
   */
  for (const brute of entetes.signature.split(" ")) {
    const [version, valeur] = brute.split(",");
    if (version !== "v1" || !valeur) continue;

    let recue: Buffer;
    try {
      recue = Buffer.from(valeur, "base64");
    } catch {
      continue;
    }

    /*
     * `timingSafeEqual` et non `===`.
     *
     * Une comparaison ordinaire s'arrête au premier octet différent : le temps
     * de réponse révèle alors combien d'octets sont justes, et permet de
     * reconstruire une signature valable, octet par octet. Elle exige des
     * longueurs égales, d'où le test qui précède.
     */
    if (recue.length === attendue.length && timingSafeEqual(recue, attendue)) {
      return { valide: true };
    }
  }

  return { valide: false, motif: "aucune signature ne correspond" };
}
