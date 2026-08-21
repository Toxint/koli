"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createSessionCookie } from "@/lib/auth/session";
import { espaceParDefaut } from "@/lib/auth/dashboards";
import { verifierJetonCourt } from "@/lib/auth/jetonCourt";
import { COOKIE_INSCRIPTION } from "@/lib/auth/google";

export interface IdentiteEnAttente {
  sub: string;
  email: string | null;
  nom: string;
  photo: string | null;
}

export interface ResultatInscriptionGoogle {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  redirectTo?: string;
}

/**
 * Identité Google retenue entre le retour de Google et la fin de
 * l'inscription. Elle vit dans un cookie SIGNÉ : déposée en clair, n'importe
 * qui pourrait se déclarer titulaire de n'importe quelle adresse.
 */
export async function lireIdentiteEnAttente(): Promise<IdentiteEnAttente | null> {
  const jeton = (await cookies()).get(COOKIE_INSCRIPTION)?.value;
  if (!jeton) return null;
  return verifierJetonCourt<IdentiteEnAttente>("inscription-google", jeton);
}

const schemaComplement = z.object({
  phone: z
    .string()
    .min(8, "Numéro de téléphone invalide (au moins 8 chiffres)")
    .regex(/^[0-9+\s-]+$/, "Numéro de téléphone invalide"),
  role: z.enum(["SELLER", "DRIVER", "CLIENT"], {
    message: "Veuillez choisir un rôle valide",
  }),
  businessName: z.string().optional(),
  vehicle: z.string().optional(),
  city: z.string().optional(),
});

/**
 * Crée le compte à partir de l'identité Google validée et du complément saisi.
 *
 * Le téléphone n'est pas un détail administratif : il porte la livraison, le
 * code de réception (§27) et le rattachement des commandes passées en invité
 * (`createOrderAction` relie l'acheteur à un compte par son numéro). Un compte
 * sans téléphone ne verrait jamais ses propres achats — d'où cette étape,
 * plutôt qu'une création silencieuse au retour de Google.
 */
export async function terminerInscriptionGoogleAction(
  formData: FormData
): Promise<ResultatInscriptionGoogle> {
  const identite = await lireIdentiteEnAttente();
  if (!identite) {
    return {
      success: false,
      error:
        "Votre session Google a expiré. Veuillez recommencer la connexion.",
    };
  }

  const validation = schemaComplement.safeParse({
    phone: formData.get("phone"),
    role: formData.get("role"),
    businessName: (formData.get("businessName") as string) || undefined,
    vehicle: (formData.get("vehicle") as string) || undefined,
    city: (formData.get("city") as string) || undefined,
  });

  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    for (const p of validation.error.issues) {
      if (p.path[0]) fieldErrors[String(p.path[0])] = p.message;
    }
    return {
      success: false,
      error: "Veuillez corriger les erreurs ci-dessous.",
      fieldErrors,
    };
  }

  const data = validation.data;
  const telephone = data.phone.replace(/\s+/g, "");

  // Le compte Google a pu être lié entre-temps, dans un autre onglet.
  const dejaLie = await prisma.user.findUnique({
    where: { googleId: identite.sub },
    select: { id: true },
  });
  if (dejaLie) {
    return {
      success: false,
      error: "Ce compte Google est déjà rattaché à un compte KOLI. Connectez-vous.",
    };
  }

  const conflit = await prisma.user.findFirst({
    where: {
      OR: [
        { phone: telephone },
        ...(identite.email ? [{ email: identite.email }] : []),
      ],
    },
    select: { phone: true },
  });

  if (conflit) {
    return {
      success: false,
      error:
        conflit.phone === telephone
          ? "Ce numéro de téléphone est déjà utilisé par un autre compte."
          : "Un compte KOLI utilise déjà cette adresse e-mail.",
      ...(conflit.phone === telephone
        ? { fieldErrors: { phone: "Numéro déjà utilisé." } }
        : {}),
    };
  }

  const utilisateur = await prisma.user.create({
    data: {
      name: identite.nom,
      phone: telephone,
      email: identite.email,
      // Aucun mot de passe : le compte se connecte par Google. `loginAction`
      // le détecte et le dit clairement plutôt que de répondre « identifiant
      // ou mot de passe incorrect », qui enverrait l'utilisateur en boucle.
      passwordHash: null,
      googleId: identite.sub,
      photoUrl: identite.photo,
      role: data.role as UserRole,
      ...(data.role === "SELLER" && {
        sellerProfile: {
          create: {
            businessName: data.businessName || identite.nom,
            verificationStatus: "PENDING" as const,
          },
        },
      }),
      ...(data.role === "CLIENT" && {
        customerProfile: {
          create: {
            city: data.city || "Abidjan",
            country: "Côte d'Ivoire",
          },
        },
      }),
      ...(data.role === "DRIVER" && {
        driverProfile: { create: { vehicle: data.vehicle || "Moto" } },
      }),
    },
    include: {
      sellerProfile: true,
      customerProfile: true,
      driverProfile: true,
    },
  });

  await createSessionCookie({
    userId: utilisateur.id,
    role: utilisateur.role,
    name: utilisateur.name,
    phone: utilisateur.phone,
    sellerId: utilisateur.sellerProfile?.id,
    customerId: utilisateur.customerProfile?.id,
    driverId: utilisateur.driverProfile?.id,
  });

  // Le cookie d'inscription a rempli son office : le laisser traîner
  // permettrait de rejouer l'étape.
  (await cookies()).set(COOKIE_INSCRIPTION, "", { path: "/", maxAge: 0 });

  return { success: true, redirectTo: espaceParDefaut(utilisateur.role) };
}
