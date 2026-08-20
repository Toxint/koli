"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionCookie, deleteSessionCookie, getSession } from "@/lib/auth/session";
import { loginSchema, registerSchema } from "@/lib/auth/schemas";
import { UserRole } from "@prisma/client";

export interface ActionResponse {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  redirectTo?: string;
}

/** §47 — limitation des tentatives de connexion. */
const MAX_TENTATIVES_CONNEXION = 5;
const DUREE_VERROUILLAGE_MS = 15 * 60 * 1000;

/**
 * Hachage bcrypt d'une valeur sans interet, utilise uniquement pour egaliser
 * le temps de reponse quand l'identifiant n'existe pas. Sans cela, la
 * difference de duree revele quels comptes existent sur la plateforme.
 */
const HACHAGE_FACTICE =
  "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export async function loginAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  const rawData = {
    identifier: formData.get("identifier") as string,
    password: formData.get("password") as string,
  };

  const validation = loginSchema.safeParse(rawData);
  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        fieldErrors[issue.path[0] as string] = issue.message;
      }
    });
    return { success: false, fieldErrors, error: "Formulaire invalide" };
  }

  const { identifier, password } = validation.data;
  const cleanedIdentifier = identifier.trim().toLowerCase();

  // Search by phone or email
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { phone: cleanedIdentifier },
        { email: cleanedIdentifier },
        { phone: identifier.replace(/\s+/g, "") },
      ],
    },
    include: {
      sellerProfile: true,
      customerProfile: true,
      driverProfile: true,
    },
  });

  if (!user) {
    // Verification factice : sans elle, un identifiant inconnu repond
    // nettement plus vite qu'un mot de passe errone, ce qui permet de
    // decouvrir quels comptes existent (§47).
    await verifyPassword(password, HACHAGE_FACTICE);
    return {
      success: false,
      error: "Identifiant ou mot de passe incorrect.",
    };
  }

  if (user.status === "SUSPENDED") {
    return {
      success: false,
      error: "Votre compte a été suspendu. Veuillez contacter le support.",
    };
  }

  // --- Limitation des tentatives (§47) ---
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.max(
      1,
      Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
    );
    return {
      success: false,
      error: `Trop de tentatives. Réessayez dans ${minutes} minute(s).`,
    };
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    const tentatives = user.failedLoginAttempts + 1;
    const doitVerrouiller = tentatives >= MAX_TENTATIVES_CONNEXION;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: doitVerrouiller ? 0 : tentatives,
        lockedUntil: doitVerrouiller
          ? new Date(Date.now() + DUREE_VERROUILLAGE_MS)
          : null,
      },
    });

    if (doitVerrouiller) {
      return {
        success: false,
        error: `Trop de tentatives. Compte bloqué pendant ${DUREE_VERROUILLAGE_MS / 60000} minutes.`,
      };
    }

    const restantes = MAX_TENTATIVES_CONNEXION - tentatives;
    return {
      success: false,
      error: `Identifiant ou mot de passe incorrect. Il vous reste ${restantes} tentative(s).`,
    };
  }

  // Connexion reussie : le compteur repart de zero.
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  }

  // Create JWT session cookie
  await createSessionCookie({
    userId: user.id,
    role: user.role,
    name: user.name,
    phone: user.phone,
    sellerId: user.sellerProfile?.id,
    customerId: user.customerProfile?.id,
    driverId: user.driverProfile?.id,
  });

  const redirectTo = getDefaultDashboard(user.role);
  return { success: true, redirectTo };
}

export async function registerAction(
  prevState: ActionResponse | null,
  formData: FormData
): Promise<ActionResponse> {
  const rawData = {
    name: formData.get("name") as string,
    phone: formData.get("phone") as string,
    email: formData.get("email") as string || undefined,
    password: formData.get("password") as string,
    role: formData.get("role") as UserRole,
    businessName: formData.get("businessName") as string || undefined,
    vehicle: formData.get("vehicle") as string || undefined,
    city: formData.get("city") as string || undefined,
  };

  const validation = registerSchema.safeParse(rawData);
  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        fieldErrors[issue.path[0] as string] = issue.message;
      }
    });
    return { success: false, fieldErrors, error: "Veuillez corriger les erreurs ci-dessous." };
  }

  const data = validation.data;
  const cleanedPhone = data.phone.replace(/\s+/g, "");

  // Check if phone or email already exists
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { phone: cleanedPhone },
        ...(data.email ? [{ email: data.email.toLowerCase() }] : []),
      ],
    },
  });

  if (existingUser) {
    return {
      success: false,
      error: "Un compte avec ce numéro de téléphone ou cet email existe déjà.",
    };
  }

  const hashedPassword = await hashPassword(data.password);

  // Create User with specific profile
  const user = await prisma.user.create({
    data: {
      name: data.name,
      phone: cleanedPhone,
      email: data.email ? data.email.toLowerCase() : null,
      passwordHash: hashedPassword,
      role: data.role as UserRole,
      ...(data.role === "SELLER" && {
        sellerProfile: {
          create: {
            businessName: data.businessName || data.name,
            verificationStatus: "PENDING",
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
        driverProfile: {
          create: {
            vehicle: data.vehicle || "Moto",
          },
        },
      }),
    },
    include: {
      sellerProfile: true,
      customerProfile: true,
      driverProfile: true,
    },
  });

  // Create JWT session cookie
  await createSessionCookie({
    userId: user.id,
    role: user.role,
    name: user.name,
    phone: user.phone,
    sellerId: user.sellerProfile?.id,
    customerId: user.customerProfile?.id,
    driverId: user.driverProfile?.id,
  });

  const redirectTo = getDefaultDashboard(user.role);
  return { success: true, redirectTo };
}

export async function logoutAction(): Promise<void> {
  await deleteSessionCookie();
  redirect("/connexion");
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      sellerProfile: true,
      customerProfile: true,
      driverProfile: true,
    },
  });

  return user;
}

function getDefaultDashboard(role: UserRole): string {
  switch (role) {
    case "SELLER":
      return "/vendeur/dashboard";
    case "DRIVER":
      return "/livreur/dashboard";
    case "CLIENT":
      return "/client/dashboard";
    case "ADMIN":
      return "/admin/dashboard";
    default:
      return "/";
  }
}
