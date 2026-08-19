import { randomInt } from "node:crypto";

/**
 * Generation des references de commande KOLI.
 *
 * La reference n'est pas qu'un numero d'affichage : elle circule dans le lien
 * de paiement (`/pay/<reference>`) et fait office de CAPACITE D'ACCES — c'est
 * elle qui autorise a consulter la commande et a la payer, l'achat invite
 * etant explicitement prevu par le cahier des charges.
 *
 * Elle doit donc etre non devinable. L'implementation precedente
 * (`count() + 125`) produisait des references sequentielles : n'importe qui
 * pouvait parcourir KOLI-000125, 000126, … et moissonner les noms, telephones
 * et adresses des acheteurs — en plus de declencher des collisions en creation
 * concurrente ou apres suppression d'une commande.
 *
 * Alphabet sans I, L, O, U ni chiffres 0/1 : evite les confusions a la lecture
 * et a la dictee au telephone, usage courant en Afrique de l'Ouest.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const LONGUEUR = 8;

export const ORDER_REFERENCE_PATTERN = new RegExp(
  `^KOLI-[${ALPHABET}]{${LONGUEUR}}$`
);

export function generateOrderReference(): string {
  let suffixe = "";

  for (let i = 0; i < LONGUEUR; i++) {
    // randomInt (crypto) et non Math.random : la reference est un secret.
    suffixe += ALPHABET[randomInt(ALPHABET.length)];
  }

  return `KOLI-${suffixe}`;
}

export function isValidOrderReference(valeur: string): boolean {
  return ORDER_REFERENCE_PATTERN.test(valeur);
}
