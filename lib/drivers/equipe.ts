"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { consigner } from "@/lib/audit/journal";

/**
 * L'équipe de livraison d'un vendeur (§5.3).
 *
 * « Au début, chaque vendeur peut utiliser son propre livreur. » La phrase est
 * courte, mais elle décide de tout ce fichier : un vendeur ne voit que SES
 * livreurs, il n'en découvre aucun autre, et il ne peut en assigner aucun autre.
 *
 * Avant, la liste d'assignation renvoyait tous les livreurs ACTIFS de la
 * plateforme. Ce n'était pas seulement contraire au §5.3 : c'était une fuite de
 * cloisonnement — le nom du livreur d'un concurrent s'affichait dans un menu
 * déroulant, et rien n'empêchait de le lui prendre pour une course.
 */

export interface MembreEquipe {
  /** Identifiant du `DriverProfile` — celui qu'attend l'assignation. */
  id: string;
  nom: string;
  vehicule: string | null;
  zone: string | null;
  /** Le livreur prend-il des courses en ce moment ? */
  disponible: boolean;
  /** Compte suspendu par l'administration : il reste listé, mais grisé. */
  actif: boolean;
  /** Depuis quand il est dans l'équipe. */
  depuis: Date;
  /** Courses menées à bien pour CE vendeur. Pas son total sur la plateforme. */
  livraisons: number;
}

/**
 * L'équipe, telle que le vendeur la voit.
 *
 * Ne renvoie **ni téléphone ni adresse électronique**. Le vendeur a déjà les
 * coordonnées de ses livreurs — c'est lui qui les a invités. Les redonner ici
 * ferait de l'écran une fiche de contact, donc une cible : il suffirait d'un
 * compte vendeur compromis pour aspirer l'annuaire de ses livreurs.
 *
 * Le décompte de livraisons est **borné au vendeur** : le nombre de courses que
 * ce livreur a faites pour lui. Son activité chez les autres commerçants ne le
 * regarde pas, et un livreur n'a pas à voir son carnet d'adresses exposé à
 * chacun de ses donneurs d'ordre.
 */
export async function listerEquipeAction(): Promise<MembreEquipe[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) return [];

  const sellerId = user.sellerProfile.id;

  const liens = await prisma.sellerDriver.findMany({
    where: { sellerId },
    select: {
      createdAt: true,
      driver: {
        select: {
          id: true,
          vehicle: true,
          zone: true,
          available: true,
          user: { select: { name: true, status: true } },
          _count: {
            select: {
              // Les courses faites POUR CE VENDEUR, et menées au bout.
              deliveries: {
                where: {
                  status: "CONFIRMED",
                  order: { sellerId },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return liens.map((lien) => ({
    id: lien.driver.id,
    nom: lien.driver.user.name,
    vehicule: lien.driver.vehicle,
    zone: lien.driver.zone,
    disponible: lien.driver.available,
    actif: lien.driver.user.status === "ACTIVE",
    depuis: lien.createdAt,
    livraisons: lien.driver._count.deliveries,
  }));
}

export type ResultatRetrait =
  | { success: true; nom: string }
  | { success: false; error: string };

/**
 * Retire un livreur de l'équipe.
 *
 * **Ne touche à AUCUNE livraison passée ni en cours.** Un livreur retiré
 * pendant qu'il porte un colis doit pouvoir le remettre et saisir l'OTP :
 * couper son accès à mi-course laisserait un colis dans la nature et un client
 * sans recours. Le retrait ferme la porte des PROCHAINES assignations, rien de
 * plus — c'est aussi pourquoi `Delivery.driverId` reste intact.
 *
 * Il ne supprime pas non plus le compte du livreur : ce compte ne nous
 * appartient pas, et il sert peut-être à d'autres vendeurs.
 */
export async function retirerDeLEquipeAction(
  driverId: string
): Promise<ResultatRetrait> {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    return { success: false, error: "Vous devez être connecté en tant que vendeur." };
  }

  if (typeof driverId !== "string" || driverId.trim().length === 0) {
    return { success: false, error: "Aucun livreur désigné." };
  }

  const sellerId = user.sellerProfile.id;

  const lien = await prisma.sellerDriver.findUnique({
    where: { sellerId_driverId: { sellerId, driverId } },
    select: { id: true, driver: { select: { user: { select: { name: true } } } } },
  });

  // Le lien n'existe pas : soit il n'a jamais existé, soit il vise l'équipe
  // d'un autre. Une seule réponse pour les deux — distinguer apprendrait à un
  // vendeur curieux que tel livreur travaille pour quelqu'un.
  if (!lien) {
    return { success: false, error: "Ce livreur ne fait pas partie de votre équipe." };
  }

  const nom = lien.driver.user.name;

  await prisma.$transaction(async (tx) => {
    await tx.sellerDriver.delete({ where: { id: lien.id } });

    await consigner(tx, {
      acteur: { id: user.id, name: user.name, role: user.role },
      action: "DRIVER_REMOVED_FROM_TEAM",
      entite: "SellerProfile",
      entiteId: sellerId,
      details: { livreur: nom, driverId },
    });
  });

  revalidatePath("/vendeur/livreurs");
  revalidatePath("/vendeur/commandes");

  return { success: true, nom };
}

export type ResultatAdhesion =
  | { success: true; boutique: string }
  | { success: false; error: string };

/**
 * Rattache un livreur à l'équipe du vendeur qui a émis l'invitation.
 *
 * Appelée juste après la création du compte (voir `registerAction`), et aussi
 * par un livreur DÉJÀ inscrit qui ouvre le lien d'un nouveau vendeur — ce
 * second cas est le plus fréquent une fois l'application en service, et
 * l'oublier aurait obligé les livreurs à se réinscrire pour chaque commerçant.
 *
 * L'invitation est revalidée ICI, et non seulement à l'affichage : entre
 * l'ouverture de la page et la validation du formulaire, le vendeur a pu
 * révoquer le lien. Le contrôle qui compte est celui fait au moment d'écrire.
 */
export async function rejoindreEquipeAction(
  token: string,
  driverId: string,
  acteur: { id: string; name: string; role: string }
): Promise<ResultatAdhesion> {
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

  if (!invitation || invitation.revokedAt || invitation.expiresAt <= new Date()) {
    return { success: false, error: "Ce lien d'invitation n'est plus valable." };
  }

  const boutique =
    invitation.seller.businessName ?? invitation.seller.user.name;

  // Déjà dans l'équipe : ce n'est pas une erreur. Un livreur qui rouvre le
  // lien qu'on lui a envoyé deux fois ne doit pas voir un message d'échec.
  const dejaLa = await prisma.sellerDriver.findUnique({
    where: {
      sellerId_driverId: { sellerId: invitation.sellerId, driverId },
    },
    select: { id: true },
  });

  if (dejaLa) return { success: true, boutique };

  await prisma.$transaction(async (tx) => {
    await tx.sellerDriver.create({
      data: {
        sellerId: invitation.sellerId,
        driverId,
        inviteId: invitation.id,
      },
    });

    await consigner(tx, {
      acteur,
      action: "DRIVER_JOINED_TEAM",
      entite: "SellerProfile",
      entiteId: invitation.sellerId,
      details: { livreur: acteur.name, driverId, boutique },
    });
  });

  revalidatePath("/vendeur/livreurs");

  return { success: true, boutique };
}

export type ResultatDisponibilite =
  | { success: true; disponible: boolean }
  | { success: false; error: string };

/**
 * Le livreur dit où il tourne, et s'il prend des courses.
 *
 * C'est LUI qui le déclare, jamais le vendeur : une disponibilité qu'un tiers
 * peut mettre à « oui » ne veut plus rien dire, et le livreur se retrouverait
 * avec des courses qu'il n'a pas acceptées.
 *
 * La zone est du texte libre, borné à 80 caractères — de quoi écrire « Cocody,
 * Plateau et Adjamé », pas de quoi loger un roman dans un menu déroulant.
 */
export async function definirDisponibiliteAction(
  formData: FormData
): Promise<ResultatDisponibilite> {
  const user = await getCurrentUser();
  if (!user || user.role !== "DRIVER" || !user.driverProfile) {
    return { success: false, error: "Vous devez être connecté en tant que livreur." };
  }

  const disponible = formData.get("disponible") === "1";
  const zoneBrute = (formData.get("zone") as string | null) ?? "";
  const zone = zoneBrute.trim().slice(0, 80);

  await prisma.driverProfile.update({
    where: { id: user.driverProfile.id },
    data: { available: disponible, zone: zone.length > 0 ? zone : null },
  });

  revalidatePath("/livreur/profil");
  revalidatePath("/livreur/dashboard");
  // Les vendeurs de ses équipes voient la disponibilité dans leur liste : sans
  // cette ligne, ils continueraient de lire l'état d'avant jusqu'au prochain
  // rendu, et assigneraient un livreur qui vient de se déclarer indisponible.
  revalidatePath("/vendeur/livreurs");
  revalidatePath("/vendeur/commandes");

  return { success: true, disponible };
}

export interface EquipesDuLivreur {
  boutique: string;
  depuis: Date;
}

/**
 * Les vendeurs pour lesquels un livreur travaille.
 *
 * Le pendant de `listerEquipeAction`, côté livreur : il doit pouvoir savoir qui
 * peut lui envoyer des courses. Un rattachement qu'on subit sans le voir n'est
 * pas un rattachement, c'est une inscription à son insu.
 */
export async function mesVendeursAction(): Promise<EquipesDuLivreur[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "DRIVER" || !user.driverProfile) return [];

  const liens = await prisma.sellerDriver.findMany({
    where: { driverId: user.driverProfile.id },
    select: {
      createdAt: true,
      seller: {
        select: { businessName: true, user: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return liens.map((lien) => ({
    boutique: lien.seller.businessName ?? lien.seller.user.name,
    depuis: lien.createdAt,
  }));
}
