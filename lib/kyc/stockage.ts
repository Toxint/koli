import path from "node:path";
import { magasinDisque } from "./magasin-disque";
import { magasinSupabase } from "./magasin-supabase";
import type { FichierRange, MagasinKyc, TypeReconnu } from "./magasin";

export type { FichierRange, TypeReconnu } from "./magasin";

/**
 * Magasin de pièces justificatives (§37).
 *
 * Ce fichier ne range rien lui-même : il RECONNAÎT les types de fichiers et
 * choisit le magasin. Les deux implémentations vivent à côté — `magasin-disque`
 * pour le développement, `magasin-supabase` pour l'hébergement en ligne.
 */

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

/**
 * Choisit le magasin, et REFUSE le choix par défaut en production.
 *
 * L'ordre :
 *
 *  1. `KYC_STORAGE_DIR` → disque, à un emplacement DÉLIBÉRÉMENT indiqué
 *     (volume monté, dossier de développement, dossier de test).
 *  2. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` → stockage objet.
 *  3. En production, sans l'un ni l'autre → **erreur**.
 *  4. Sinon → `.donnees/kyc`, le disque local du poste de développement.
 *
 * **Pourquoi le disque explicite passe DEVANT Supabase.** `.env` porte les
 * identifiants Supabase — il en a besoin pour `npm run supabase:stockage` — et
 * le serveur local lit `.env` en plus de `.env.local`. Sans cette priorité, le
 * développement écrirait dans le vrai seau : lentement, et en y laissant des
 * pièces de test. La règle est celle du reste du projet : ce qui est déclaré
 * explicitement l'emporte.
 *
 * Le point 3 est la raison d'être de cette fonction. Sans lui, un déploiement
 * sans serveur se rabattrait sur un disque éphémère : les pièces d'identité
 * disparaîtraient au déploiement suivant, sans erreur, sans trace, et le
 * défaut ne se découvrirait qu'au moment d'examiner un dossier. Mieux vaut un
 * refus net au premier dépôt.
 */
function choisirMagasin(): MagasinKyc {
  if (process.env.KYC_STORAGE_DIR) {
    return magasinDisque(process.env.KYC_STORAGE_DIR);
  }

  const url = process.env.SUPABASE_URL;
  const clef = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && clef) {
    return magasinSupabase(url, clef, process.env.KYC_BUCKET ?? "kyc");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Aucun stockage durable n'est configuré pour les pièces KYC. " +
        "Renseignez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (stockage objet), " +
        "ou KYC_STORAGE_DIR si l'hébergement dispose d'un disque persistant. " +
        "Se rabattre sur le disque local perdrait les pièces au déploiement suivant."
    );
  }

  return magasinDisque(path.join(process.cwd(), ".donnees", "kyc"));
}

/**
 * Le magasin est résolu au PREMIER usage, pas au chargement du module.
 *
 * En production, `choisirMagasin` peut lever : le faire à l'import ferait
 * échouer la construction de l'application, y compris pour les pages qui ne
 * touchent pas au KYC.
 */
let magasin: MagasinKyc | null = null;
const obtenir = (): MagasinKyc => (magasin ??= choisirMagasin());

/** Le magasin réellement utilisé, pour le diagnostic. */
export function nomDuMagasin(): string {
  return obtenir().nom;
}

export async function rangerFichier(
  donnees: Uint8Array,
  type: TypeReconnu
): Promise<FichierRange> {
  return obtenir().ranger(donnees, type);
}

/**
 * Relit une pièce rangée.
 *
 * Le chemin est **vérifié** avant tout accès, même s'il vient de notre propre
 * base : une valeur contenant `..` désignerait autre chose que ce qu'on a
 * rangé. Le contrôle est dans chaque magasin, au plus près de l'accès.
 */
export async function lireFichier(chemin: string): Promise<Uint8Array | null> {
  return obtenir().lire(chemin);
}

export async function supprimerFichier(chemin: string): Promise<void> {
  return obtenir().supprimer(chemin);
}
