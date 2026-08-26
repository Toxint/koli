import { randomBytes } from "node:crypto";

/**
 * Ce qu'un magasin de pièces justificatives doit savoir faire (§37).
 *
 * Trois gestes, pas un de plus : ranger, relire, supprimer. C'est ce qui
 * permet d'en changer sans toucher au reste — le disque local en développement,
 * le stockage objet en ligne, comme `PaymentProvider` pour les paiements (§51).
 */

export interface TypeReconnu {
  mime: string;
  extension: string;
}

export interface FichierRange {
  /** Chemin RELATIF au magasin. Jamais une adresse publique. */
  chemin: string;
  mime: string;
  taille: number;
}

export interface MagasinKyc {
  /** Nom du magasin, pour les messages d'erreur et le diagnostic. */
  readonly nom: string;
  ranger(donnees: Uint8Array, type: TypeReconnu): Promise<FichierRange>;
  lire(chemin: string): Promise<Uint8Array | null>;
  supprimer(chemin: string): Promise<void>;
}

/**
 * Fabrique le chemin d'une pièce à ranger.
 *
 * **Le nom est tiré au sort**, jamais dérivé de celui fourni par le client : un
 * nom venu du navigateur peut contenir `../`, un caractère interdit, ou
 * simplement le nom de son propriétaire — qu'on ne veut pas voir apparaître.
 *
 * **Un sous-dossier par année-mois** : un répertoire unique finit par contenir
 * des dizaines de milliers d'entrées, ce que les systèmes de fichiers comme les
 * consoles de stockage supportent mal.
 */
export function nouveauChemin(extension: string): string {
  const maintenant = new Date();
  const dossier = `${maintenant.getFullYear()}-${String(
    maintenant.getMonth() + 1
  ).padStart(2, "0")}`;

  return `${dossier}/${randomBytes(24).toString("hex")}.${extension}`;
}

/**
 * Le chemin a-t-il exactement la forme que `nouveauChemin` produit ?
 *
 * Ce contrôle porte sur des valeurs qui viennent de NOTRE base — et c'est bien
 * pour cela qu'il existe. Une reprise de données, une migration bâclée, et un
 * chemin remontant permettrait de lire ou d'effacer ce qu'il désigne. Sur un
 * disque, n'importe quel fichier du serveur ; sur un stockage objet, n'importe
 * quel objet du projet.
 *
 * Une forme stricte vaut mieux qu'une liste d'interdits : elle ne laisse rien
 * passer par oubli.
 */
export function cheminValide(chemin: string): boolean {
  return /^\d{4}-\d{2}\/[0-9a-f]{48}\.[a-z0-9]{2,4}$/.test(chemin);
}
