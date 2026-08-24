import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Magasin de pièces justificatives (§37).
 *
 * **Rien n'est écrit sous `public/`.** Un dossier de `public/` est servi tel
 * quel par le serveur, sans le moindre contrôle : une carte d'identité y
 * atterrissant serait lisible par quiconque devine son adresse, et rien ne le
 * signalerait. Les fichiers vivent donc hors de l'arborescence servie, et
 * `/api/kyc/<id>` est le seul chemin qui les restitue, après vérification du
 * demandeur.
 *
 * **Interface volontairement étroite** — écrire, lire, supprimer. Le MVP écrit
 * sur le disque local ; le jour où un stockage objet sera choisi, seule cette
 * implémentation change, comme `PaymentProvider` pour les paiements (§51).
 *
 * **Le nom du fichier est tiré au sort**, jamais dérivé de celui fourni. Un nom
 * venu du client peut contenir `../`, un caractère interdit, ou simplement le
 * nom de son propriétaire — qu'on ne veut pas voir apparaître sur le disque.
 */

/** Racine du magasin. Hors de `public/`, et ignorée par git. */
const RACINE =
  process.env.KYC_STORAGE_DIR ?? path.join(process.cwd(), ".donnees", "kyc");

/**
 * Types acceptés, et leur signature binaire.
 *
 * **Le type est déterminé en LISANT le fichier**, jamais d'après ce que le
 * navigateur annonce : `Content-Type` est fourni par le client et se falsifie
 * en une ligne. Un fichier HTML présenté comme `image/png` et servi ensuite
 * comme tel deviendrait une page exécutée dans notre propre domaine.
 *
 * SVG est délibérément absent : c'est du XML, il peut porter du script.
 */
const SIGNATURES: { mime: string; extension: string; octets: number[][] }[] = [
  { mime: "image/jpeg", extension: "jpg", octets: [[0xff, 0xd8, 0xff]] },
  {
    mime: "image/png",
    extension: "png",
    octets: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  },
  { mime: "application/pdf", extension: "pdf", octets: [[0x25, 0x50, 0x44, 0x46]] },
];

/** WebP : "RIFF" .... "WEBP" — la signature n'est pas contiguë. */
function estWebp(donnees: Uint8Array): boolean {
  if (donnees.length < 12) return false;
  const texte = (d: number[]) => String.fromCharCode(...d);
  return (
    texte([...donnees.slice(0, 4)]) === "RIFF" &&
    texte([...donnees.slice(8, 12)]) === "WEBP"
  );
}

export const TAILLE_MAX_OCTETS = 5 * 1024 * 1024; // 5 Mo

export interface TypeReconnu {
  mime: string;
  extension: string;
}

/**
 * Reconnaît le type réel d'un fichier, ou `null`.
 *
 * `null` doit conduire au REFUS, jamais à un repli sur le type annoncé.
 */
export function reconnaitreType(donnees: Uint8Array): TypeReconnu | null {
  for (const { mime, extension, octets } of SIGNATURES) {
    for (const signature of octets) {
      if (
        donnees.length >= signature.length &&
        signature.every((octet, i) => donnees[i] === octet)
      ) {
        return { mime, extension };
      }
    }
  }

  if (estWebp(donnees)) return { mime: "image/webp", extension: "webp" };

  return null;
}

export interface FichierRange {
  /** Chemin RELATIF au magasin. Jamais une adresse publique. */
  chemin: string;
  mime: string;
  taille: number;
}

export async function rangerFichier(
  donnees: Uint8Array,
  type: TypeReconnu
): Promise<FichierRange> {
  // Sous-dossier par année-mois : un répertoire unique finit par contenir des
  // dizaines de milliers d'entrées, ce que le système de fichiers supporte mal.
  const maintenant = new Date();
  const dossier = `${maintenant.getFullYear()}-${String(
    maintenant.getMonth() + 1
  ).padStart(2, "0")}`;

  const nom = `${randomBytes(24).toString("hex")}.${type.extension}`;
  const relatif = path.posix.join(dossier, nom);
  const absolu = path.join(RACINE, dossier, nom);

  await mkdir(path.dirname(absolu), { recursive: true });
  await writeFile(absolu, donnees, { mode: 0o600 });

  return { chemin: relatif, mime: type.mime, taille: donnees.length };
}

/**
 * Relit un fichier rangé.
 *
 * Le chemin est reconstruit depuis la racine et **vérifié** : même s'il vient
 * de notre propre base, une valeur contenant `..` sortirait du magasin et
 * permettrait de lire n'importe quel fichier du serveur. Le contrôle coûte une
 * comparaison de chaînes.
 */
export async function lireFichier(chemin: string): Promise<Uint8Array | null> {
  const absolu = path.resolve(RACINE, chemin);
  const racine = path.resolve(RACINE);

  if (absolu !== racine && !absolu.startsWith(racine + path.sep)) {
    return null;
  }

  try {
    return new Uint8Array(await readFile(absolu));
  } catch {
    return null;
  }
}

export async function supprimerFichier(chemin: string): Promise<void> {
  const absolu = path.resolve(RACINE, chemin);
  const racine = path.resolve(RACINE);
  if (absolu !== racine && !absolu.startsWith(racine + path.sep)) return;
  await unlink(absolu).catch(() => {});
}
