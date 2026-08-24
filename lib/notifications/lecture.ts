import type { NotificationType, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { formulerNotification, lienNotification } from "@/lib/notifications/libelles";

/**
 * Lecture des notifications d'un utilisateur (§45).
 *
 * « Chaque utilisateur possède : notifications non lues, notifications lues,
 * date, type, lien vers l'objet concerné. »
 *
 * Tout passe par `userId`, toujours pris de la session et jamais d'un
 * paramètre : une notification cite des références de commande et l'activité
 * d'un compte. Laisser choisir la boîte que l'on consulte serait une fuite.
 */
export interface NotificationLue {
  id: string;
  type: NotificationType;
  titre: string;
  detail: string;
  lien: string | null;
  reference: string | null;
  quand: Date;
  lue: boolean;
}

export interface ResultatNotifications {
  lignes: NotificationLue[];
  total: number;
  nonLues: number;
}

export async function compterNonLues(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function chargerNotifications({
  userId,
  role,
  page,
  parPage,
  seulementNonLues = false,
}: {
  userId: string;
  role: UserRole;
  page: number;
  parPage: number;
  seulementNonLues?: boolean;
}): Promise<ResultatNotifications> {
  const where = {
    userId,
    ...(seulementNonLues ? { readAt: null } : {}),
  };

  const [lignes, total, nonLues] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * parPage,
      take: parPage,
    }),
    prisma.notification.count({ where }),
    // Le compteur porte TOUJOURS sur les non-lues, filtre ou pas : sinon il
    // tomberait a zero dès qu'on consulte l'onglet « lues », ce qui donnerait
    // l'impression d'avoir tout traite.
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return {
    lignes: lignes.map((n) => {
      const { titre, detail } = formulerNotification(n.type, role);
      return {
        id: n.id,
        type: n.type,
        titre,
        detail,
        lien: lienNotification(n.entityType, n.entityId, role),
        reference: n.entityType === "Order" ? n.entityId : null,
        quand: n.createdAt,
        lue: n.readAt !== null,
      };
    }),
    total,
    nonLues,
  };
}
