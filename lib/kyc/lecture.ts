import type { KycStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { PIECES_REQUISES, TYPES_PIECES, type CodePiece } from "@/lib/kyc/types";

/**
 * Lecture des dossiers de vérification (§37).
 *
 * Le dossier d'un vendeur est TOUJOURS présenté comme la liste complète des
 * pièces attendues, y compris celles qui manquent. Ne montrer que ce qui a
 * été déposé laisserait le vendeur croire son dossier complet.
 */
export interface PieceDossier {
  code: CodePiece;
  libelle: string;
  aide: string;
  requise: boolean;
  /** Absente tant que rien n'a été déposé. */
  document: {
    id: string;
    status: KycStatus;
    nomOrigine: string | null;
    taille: number | null;
    deposeeLe: Date;
    motifRefus: string | null;
  } | null;
}

export interface DossierKyc {
  sellerId: string;
  nomLegal: string | null;
  /** Nom du compte, qui sert de comparaison avec la pièce. */
  nomCompte: string;
  telephone: string;
  enseigne: string | null;
  statutVendeur: string;
  pieces: PieceDossier[];
  /** Les pièces requises sont-elles toutes déposées ? */
  complet: boolean;
  /** Toutes les pièces requises sont-elles acceptées ? */
  toutesAcceptees: boolean;
  /** Au moins une pièce refusée — le vendeur a quelque chose à corriger. */
  aDesRefus: boolean;
}

export async function chargerDossierKyc(
  sellerId: string
): Promise<DossierKyc | null> {
  const vendeur = await prisma.sellerProfile.findUnique({
    where: { id: sellerId },
    select: {
      id: true,
      businessName: true,
      legalName: true,
      verificationStatus: true,
      user: { select: { name: true, phone: true } },
      kyc: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!vendeur) return null;

  const pieces: PieceDossier[] = TYPES_PIECES.map((type) => {
    // La plus récente de ce type : redéposer remplace, mais une reprise de
    // données pourrait laisser plusieurs lignes.
    const doc = vendeur.kyc.find((d) => d.type === type.code) ?? null;

    return {
      code: type.code,
      libelle: type.libelle,
      aide: type.aide,
      requise: PIECES_REQUISES.includes(type.code),
      document: doc
        ? {
            id: doc.id,
            status: doc.status,
            nomOrigine: doc.originalName,
            taille: doc.sizeBytes,
            deposeeLe: doc.createdAt,
            motifRefus: doc.rejectionReason,
          }
        : null,
    };
  });

  const requises = pieces.filter((p) => p.requise);

  return {
    sellerId: vendeur.id,
    nomLegal: vendeur.legalName,
    nomCompte: vendeur.user.name,
    telephone: vendeur.user.phone,
    enseigne: vendeur.businessName,
    statutVendeur: vendeur.verificationStatus,
    pieces,
    complet: requises.every((p) => p.document !== null),
    toutesAcceptees:
      requises.length > 0 &&
      requises.every((p) => p.document?.status === "VERIFIED"),
    aDesRefus: pieces.some((p) => p.document?.status === "REJECTED"),
  };
}

export interface DossierEnAttente {
  sellerId: string;
  vendeur: string;
  nomLegal: string | null;
  telephone: string;
  statutVendeur: string;
  piecesEnAttente: number;
  deposeLe: Date | null;
}

/**
 * Les dossiers qui attendent un examen.
 *
 * Triés par date de dépôt CROISSANTE : le plus ancien d'abord. Un tri
 * décroissant ferait remonter les nouveaux dossiers en tête et laisserait les
 * premiers arrivés indéfiniment au fond de la file.
 */
export async function chargerDossiersEnAttente({
  page,
  parPage,
}: {
  page: number;
  parPage: number;
}): Promise<{ dossiers: DossierEnAttente[]; total: number }> {
  const where = { kyc: { some: { status: "PENDING" as KycStatus } } };

  const [vendeurs, total] = await Promise.all([
    prisma.sellerProfile.findMany({
      where,
      select: {
        id: true,
        businessName: true,
        legalName: true,
        verificationStatus: true,
        kycSubmittedAt: true,
        user: { select: { name: true, phone: true } },
        kyc: { where: { status: "PENDING" }, select: { id: true } },
      },
      orderBy: { kycSubmittedAt: "asc" },
      skip: (page - 1) * parPage,
      take: parPage,
    }),
    prisma.sellerProfile.count({ where }),
  ]);

  return {
    dossiers: vendeurs.map((v) => ({
      sellerId: v.id,
      vendeur: v.businessName || v.user.name,
      nomLegal: v.legalName,
      telephone: v.user.phone,
      statutVendeur: v.verificationStatus,
      piecesEnAttente: v.kyc.length,
      deposeLe: v.kycSubmittedAt,
    })),
    total,
  };
}
