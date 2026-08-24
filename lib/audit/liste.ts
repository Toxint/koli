import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Lecture du journal d'audit (§48, §217 « Logs »).
 *
 * Le journal existait en base depuis le premier jour et n'était **jamais
 * écrit** — donc jamais lu. Cinq actes d'autorité s'exerçaient sans laisser de
 * trace : changer le taux de commission, suspendre un compte, rejeter un
 * vendeur, trancher un litige, traiter un remboursement.
 *
 * La lecture est paginée et filtrable, sinon elle devient vite inutilisable :
 * un journal se consulte pour répondre à une question précise — « qui a changé
 * le taux le mois dernier ? » —, pas pour se faire défiler du début à la fin.
 */
export interface LigneJournal {
  id: string;
  quand: Date;
  action: string;
  /** Nom recopié à l'écriture : survit à la suppression du compte. */
  acteur: string;
  acteurRole: string | null;
  /** Le compte existe-t-il encore ? Change ce qu'on affiche. */
  acteurExiste: boolean;
  entite: string;
  entiteId: string;
  details: string | null;
}

export interface ResultatJournal {
  lignes: LigneJournal[];
  total: number;
  /** Actions réellement présentes, pour ne proposer que des filtres utiles. */
  actionsPresentes: string[];
}

export async function chargerJournalAudit({
  action,
  recherche,
  page,
  parPage,
}: {
  action?: string;
  recherche?: string;
  page: number;
  parPage: number;
}): Promise<ResultatJournal> {
  const terme = recherche?.trim();

  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action } : {}),
    ...(terme
      ? {
          OR: [
            { entityId: { contains: terme } },
            { actorName: { contains: terme } },
            { metadata: { contains: terme } },
          ],
        }
      : {}),
  };

  const [lignes, total, groupes] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * parPage,
      take: parPage,
    }),
    prisma.auditLog.count({ where }),
    // Sans filtre : la liste des filtres ne doit pas se vider quand on filtre.
    prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true } }),
  ]);

  return {
    lignes: lignes.map((l) => ({
      id: l.id,
      quand: l.createdAt,
      action: l.action,
      // Le nom recopié fait foi : il dit qui a agi AU MOMENT DES FAITS, même
      // si la personne a depuis changé de nom ou si son compte a disparu.
      acteur: l.actorName ?? l.actor?.name ?? "Compte supprimé",
      acteurRole: l.actorRole,
      acteurExiste: l.actor !== null,
      entite: l.entityType,
      entiteId: l.entityId,
      details: l.metadata,
    })),
    total,
    actionsPresentes: groupes
      .map((g) => g.action)
      .sort((a, b) => a.localeCompare(b, "fr")),
  };
}
