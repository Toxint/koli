"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { consigner } from "@/lib/audit/journal";

/**
 * Les liens d'invitation qu'un vendeur remet à ses livreurs.
 *
 * §5.3 : « Au début, chaque vendeur peut utiliser son propre livreur. » Reste
 * à savoir comment un livreur ENTRE dans l'équipe d'un vendeur. Deux réponses
 * étaient possibles, et une seule tient.
 *
 * **Rejetée : le vendeur cherche un livreur par son numéro.** Il faudrait
 * alors qu'une recherche sur un numéro de téléphone dise si un livreur existe
 * derrière — c'est-à-dire un annuaire interrogeable de tous les livreurs de la
 * plateforme, ouvert à quiconque ouvre un compte vendeur. On ne construit pas
 * ça pour éviter une page.
 *
 * **Retenue : le livreur entre par un lien que le vendeur lui donne.** Le
 * vendeur ne découvre personne, il invite quelqu'un qu'il connaît déjà. C'est
 * aussi l'ordre naturel du terrain : le commerçant a déjà son livreur, il veut
 * juste le retrouver dans l'application.
 */

/** Trente jours. Assez pour équiper une boutique, trop peu pour traîner. */
const DUREE_VALIDITE_JOURS = 30;

export interface InvitationVendeur {
  id: string;
  /** L'adresse complète à partager. Construite par l'appelant qui connaît l'hôte. */
  token: string;
  expiresAt: Date;
  createdAt: Date;
  /** Combien de livreurs sont entrés par ce lien. */
  entrees: number;
}

/**
 * Le jeton — 32 octets tirés au sort, en base64url.
 *
 * PAS un `cuid()`. Un cuid porte un horodatage et un compteur : deux jetons
 * émis à la suite se ressemblent, et c'est exactement ce qu'on ne veut pas
 * d'une valeur qui vaut droit d'entrée dans une équipe. `randomBytes` puise
 * dans le générateur du système.
 *
 * base64url et non hexadécimal : même entropie, chaîne plus courte, et aucun
 * caractère qui demande à être échappé dans une URL — un lien recopié à la
 * main depuis un message WhatsApp ne doit pas se casser sur un `+` ou un `/`.
 */
function tirerJeton(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * L'invitation en cours du vendeur, ou `null` s'il n'en a pas.
 *
 * Une seule à la fois, volontairement : plusieurs liens vivants pour une même
 * boutique ne servent à rien et compliquent la révocation — il faudrait se
 * souvenir duquel on a donné à qui. En émettre un nouveau révoque l'ancien.
 */
export async function invitationCouranteAction(): Promise<InvitationVendeur | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) return null;

  const invitation = await prisma.driverInvite.findFirst({
    where: {
      sellerId: user.sellerProfile.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      expiresAt: true,
      createdAt: true,
      _count: { select: { liens: true } },
    },
  });

  if (!invitation) return null;

  return {
    id: invitation.id,
    token: invitation.token,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    entrees: invitation._count.liens,
  };
}

export type ResultatInvitation =
  | { success: true; token: string }
  | { success: false; error: string };

/**
 * Émet un lien, en révoquant celui d'avant.
 *
 * La révocation de l'ancien est le geste attendu quand on « régénère » un lien :
 * on le fait précisément parce que l'ancien a fuité. Le laisser vivant aurait
 * fait exactement l'inverse de ce que le vendeur croyait faire.
 *
 * Les livreurs DÉJÀ entrés par l'ancien lien restent dans l'équipe — d'où le
 * `SetNull` sur `SellerDriver.inviteId`. Révoquer un lien ferme une porte, ça
 * ne met personne dehors.
 */
export async function emettreInvitationAction(): Promise<ResultatInvitation> {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    return { success: false, error: "Vous devez être connecté en tant que vendeur." };
  }

  const sellerId = user.sellerProfile.id;
  const token = tirerJeton();
  const expiresAt = new Date(Date.now() + DUREE_VALIDITE_JOURS * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.driverInvite.updateMany({
      where: { sellerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await tx.driverInvite.create({ data: { sellerId, token, expiresAt } });

    // Le jeton lui-même n'entre PAS au journal. Une ligne d'audit se relit, se
    // recopie, s'exporte — y déposer une capacité d'accès la ferait vivre bien
    // au-delà de sa révocation.
    await consigner(tx, {
      acteur: { id: user.id, name: user.name, role: user.role },
      action: "DRIVER_INVITE_ISSUED",
      entite: "SellerProfile",
      entiteId: sellerId,
      details: { expiresAt: expiresAt.toISOString() },
    });
  });

  revalidatePath("/vendeur/livreurs");
  return { success: true, token };
}

export type ResultatRevocation =
  | { success: true }
  | { success: false; error: string };

/** Ferme le lien en cours, sans toucher à l'équipe déjà constituée. */
export async function revoquerInvitationAction(): Promise<ResultatRevocation> {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    return { success: false, error: "Vous devez être connecté en tant que vendeur." };
  }

  const sellerId = user.sellerProfile.id;

  const { count } = await prisma.driverInvite.updateMany({
    where: { sellerId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (count === 0) {
    return { success: false, error: "Aucun lien actif à révoquer." };
  }

  await consigner(prisma, {
    acteur: { id: user.id, name: user.name, role: user.role },
    action: "DRIVER_INVITE_REVOKED",
    entite: "SellerProfile",
    entiteId: sellerId,
  });

  revalidatePath("/vendeur/livreurs");
  return { success: true };
}

export interface InvitationLue {
  /** L'enseigne, telle que le livreur la verra. */
  boutique: string;
  sellerId: string;
  inviteId: string;
}

/**
 * Lit une invitation depuis son jeton — appelée par la page d'inscription.
 *
 * Renvoie `null` pour un jeton inconnu, révoqué ou périmé, **sans distinguer
 * les trois**. La différence n'aiderait que celui qui cherche un jeton valide
 * au hasard : « révoqué » lui apprendrait qu'il a trouvé un vendeur réel.
 *
 * Ce n'est PAS une action serveur au sens d'une mutation : elle ne demande
 * aucune session, puisqu'elle est appelée par quelqu'un qui n'a pas encore de
 * compte. C'est justement pourquoi elle ne renvoie que l'enseigne — rien du
 * dossier du vendeur, rien de ses chiffres.
 */
export async function lireInvitationAction(
  token: string
): Promise<InvitationLue | null> {
  if (typeof token !== "string" || token.length === 0 || token.length > 200) {
    return null;
  }

  const invitation = await prisma.driverInvite.findUnique({
    where: { token },
    select: {
      id: true,
      sellerId: true,
      revokedAt: true,
      expiresAt: true,
      seller: {
        select: { businessName: true, user: { select: { name: true } } },
      },
    },
  });

  if (!invitation) return null;
  if (invitation.revokedAt) return null;
  if (invitation.expiresAt <= new Date()) return null;

  return {
    boutique: invitation.seller.businessName ?? invitation.seller.user.name,
    sellerId: invitation.sellerId,
    inviteId: invitation.id,
  };
}
