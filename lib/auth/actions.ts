"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionCookie, deleteSessionCookie, getSession } from "@/lib/auth/session";
import { loginSchema, registerSchema } from "@/lib/auth/schemas";
import { UserRole } from "@prisma/client";
import { espaceParDefaut } from "@/lib/auth/dashboards";
import { rejoindreEquipeAction } from "@/lib/drivers/equipe";

export interface ActionResponse {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  redirectTo?: string;
  /**
   * Ce que la personne venait de taper, pour le lui rendre.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │  SANS JavaScript, un formulaire refuse revient VIDE.                 │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * Le navigateur recharge la page : React n'est pas la pour garder l'etat,
   * et rien ne subsiste. Retaper un numero de telephone sur un clavier de
   * telephone apres s'etre trompe de mot de passe, c'est le genre de detail
   * qui fait abandonner.
   *
   * Le mot de passe n'y figure JAMAIS : il traverserait le reseau une
   * seconde fois, dans une reponse, pour se poser dans un attribut du
   * document.
   */
  saisie?: Record<string, string>;
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
    return {
      success: false,
      fieldErrors,
      error: "Formulaire invalide",
      saisie: { identifier: rawData.identifier ?? "" },
    };
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
      saisie: { identifier },
    };
  }

  if (user.status === "SUSPENDED") {
    return {
      success: false,
      error: "Votre compte a été suspendu. Veuillez contacter le support.",
      saisie: { identifier },
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
      saisie: { identifier },
    };
  }

  // Compte créé via Google : il n'a pas de mot de passe. Répondre
  // « identifiant ou mot de passe incorrect » enverrait l'utilisateur essayer
  // indéfiniment un mot de passe qui n'existe pas. On le dit, et cela ne
  // divulgue rien qu'un clic sur « Continuer avec Google » ne révélerait.
  if (!user.passwordHash) {
    return {
      success: false,
      error:
        "Ce compte se connecte avec Google. Utilisez le bouton « Continuer avec Google ».",
      saisie: { identifier },
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
        saisie: { identifier },
      };
    }

    const restantes = MAX_TENTATIVES_CONNEXION - tentatives;
    return {
      success: false,
      error: `Identifiant ou mot de passe incorrect. Il vous reste ${restantes} tentative(s).`,
      saisie: { identifier },
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

  /*
   * La redirection se fait ICI, et non en rendant une adresse au navigateur.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │  Rendre { redirectTo } suppose que quelqu'un l'utilise. Sans         │
   * │  JavaScript, personne ne le fait : le cookie est pose, la session    │
   * │  existe, et la personne reste devant le formulaire de connexion.     │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * `redirect()` sert les DEUX chemins : le navigateur sans JavaScript suit
   * une reponse 303, et le routeur de Next fait la navigation quand il est
   * la. C'est le meme code, et c'est pour cela qu'il ne peut pas diverger.
   *
   * ⚠ Elle leve `NEXT_REDIRECT` : ne jamais l'entourer d'un try/catch qui
   * avale tout, sinon le succes se change en « erreur reseau ».
   */
  redirect(espaceParDefaut(user.role));
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
    zone: formData.get("zone") as string || undefined,
    city: formData.get("city") as string || undefined,
    country: (formData.get("country") as string) || undefined,
    currency: (formData.get("currency") as string) || undefined,
  };

  const validation = registerSchema.safeParse(rawData);
  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.issues.forEach((issue) => {
      if (issue.path[0]) {
        fieldErrors[issue.path[0] as string] = issue.message;
      }
    });
    return {
      success: false,
      fieldErrors,
      error: "Veuillez corriger les erreurs ci-dessous.",
      saisie: {
        name: rawData.name ?? "",
        phone: rawData.phone ?? "",
        email: rawData.email ?? "",
        role: rawData.role ?? "",
        businessName: rawData.businessName ?? "",
        vehicle: rawData.vehicle ?? "",
        zone: rawData.zone ?? "",
        city: rawData.city ?? "",
        country: rawData.country ?? "",
      },
    };
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
      saisie: {
        name: rawData.name ?? "",
        phone: rawData.phone ?? "",
        email: rawData.email ?? "",
        role: rawData.role ?? "",
        businessName: rawData.businessName ?? "",
        vehicle: rawData.vehicle ?? "",
        zone: rawData.zone ?? "",
        city: rawData.city ?? "",
        country: rawData.country ?? "",
      },
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
            // Le pays du vendeur fixe la devise de TOUS ses prix…
            country: data.country ?? null,
            /*
             * …sauf s'il en a CHOISI une autre.
             *
             * Vide ou absente ⇒ `null`, et `deviseDuVendeur` retombe sur le
             * pays. On n'écrit pas la devise du pays ici : ce serait figer
             * un repli, et un vendeur qui déménage ou se corrige garderait
             * une monnaie qu'il n'a jamais demandée.
             */
            currency: data.currency?.trim() || null,
          },
        },
      }),
      ...(data.role === "CLIENT" && {
        customerProfile: {
          create: {
            city: data.city || "Abidjan",
            /*
             * Le pays DÉCLARÉ, plus « Côte d'Ivoire » en dur.
             *
             * Tout compte créé était enregistré comme ivoirien, quel que soit
             * l'endroit d'où il venait. Sur une plateforme qui dessert
             * dix-sept pays, c'est une donnée fausse dès l'inscription — et
             * c'est elle qui décidait de la devise des commandes.
             */
            country: data.country ?? null,
          },
        },
      }),
      ...(data.role === "DRIVER" && {
        driverProfile: {
          create: {
            vehicle: data.vehicle || "Moto",
            // Pas de valeur de repli sur la zone : « Abidjan » invente ou
            // travaille quelqu un qui ne l a pas dit, et le vendeur choisirait
            // sur cette invention. Vide, l ecran affiche « zone non precisee ».
            zone: data.zone?.trim() || null,
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

  /*
   * Le livreur invité entre dans l'équipe du vendeur qui l'a invité (§5.3).
   *
   * APRÈS la création du compte et APRÈS la session : dans cet ordre, un lien
   * périmé ou révoqué ne peut pas faire échouer une inscription par ailleurs
   * valide. Le livreur a bien son compte ; il lui manque seulement son
   * rattachement, et le vendeur n'a qu'à lui renvoyer un lien.
   *
   * L'échec est donc SILENCIEUX ici, et c'est la seule fois où c'est le bon
   * choix : refuser le compte punirait le livreur d'une négligence du vendeur.
   * L'écran d'inscription, lui, a déjà dit à qui le lien rattache — et s'il
   * n'était plus valable, il l'affichait avant même le formulaire.
   */
  const jetonInvitation = formData.get("invitation");
  if (
    data.role === "DRIVER" &&
    user.driverProfile &&
    typeof jetonInvitation === "string" &&
    jetonInvitation.length > 0
  ) {
    await rejoindreEquipeAction(jetonInvitation, user.driverProfile.id, {
      id: user.id,
      name: user.name,
      role: user.role,
    });
  }

  const redirectTo = espaceParDefaut(user.role);
  /*
   * Meme raison qu'a la connexion : la redirection se fait ICI.
   *
   * Rendre { redirectTo } suppose un navigateur qui l'utilise. Sans
   * JavaScript, le compte serait CREE et la personne resterait devant le
   * formulaire d'inscription — sans savoir si elle a reussi, et tentee de
   * recommencer, ce qui lui repondrait « un compte existe deja ».
   */
  redirect(redirectTo);
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

