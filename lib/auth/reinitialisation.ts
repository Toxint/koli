"use server";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";

/**
 * Mot de passe oublié (§62).
 *
 * Le lien de réinitialisation devra être envoyé par SMS ou e-mail (phases 25 et
 * 31). Tant que ce canal n'existe pas, KOLI étant en **mode test**, le lien est
 * affiché à l'écran — comme le code de réception l'est au client. C'est assumé
 * et écrit noir sur blanc dans l'interface : cela ne doit jamais rester ainsi
 * en production, sans quoi n'importe qui pourrait réinitialiser n'importe quel
 * compte en saisissant simplement un numéro.
 *
 * Le reste du mécanisme est, lui, celui de production :
 *  - jeton tiré au sort par `randomBytes` (crypto), jamais `Math.random` ;
 *  - seul son HACHAGE est stocké, pour qu'une fuite de la base ne donne pas la
 *    main sur les comptes ayant une demande en cours ;
 *  - durée de vie courte, usage unique, comparaison à durée constante ;
 *  - la réponse ne dit jamais si le compte existe.
 */
const DUREE_VALIDITE_MS = 30 * 60 * 1000;

export interface ResultatDemande {
  success: boolean;
  message: string;
  /** MODE TEST uniquement : le lien qu'un SMS transmettrait. */
  lienDeTest?: string;
}

export interface ResultatReinitialisation {
  success: boolean;
  error?: string;
  message?: string;
}

function hacherJeton(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}

const identifiantSchema = z
  .string()
  .trim()
  .min(3, "Saisissez votre numéro de téléphone ou votre e-mail.");

/**
 * Étape 1 — le visiteur demande à réinitialiser.
 *
 * La réponse est **identique** que le compte existe ou non : autrement, ce
 * formulaire deviendrait un moyen commode de savoir qui est inscrit sur KOLI.
 */
export async function demanderReinitialisationAction(
  formData: FormData
): Promise<ResultatDemande> {
  const validation = identifiantSchema.safeParse(formData.get("identifiant"));

  const reponseNeutre: ResultatDemande = {
    success: true,
    message:
      "Si un compte correspond, la marche à suivre pour changer le mot de passe lui a été envoyée.",
  };

  if (!validation.success) {
    return { success: false, message: validation.error.issues[0].message };
  }

  const identifiant = validation.data.toLowerCase();
  const telephone = identifiant.replace(/\s+/g, "");

  const utilisateur = await prisma.user.findFirst({
    where: { OR: [{ email: identifiant }, { phone: telephone }] },
    select: { id: true, status: true },
  });

  // Compte inexistant ou suspendu : même réponse, aucun jeton émis.
  if (!utilisateur || utilisateur.status === "SUSPENDED") {
    return reponseNeutre;
  }

  const jeton = randomBytes(32).toString("hex");

  await prisma.user.update({
    where: { id: utilisateur.id },
    data: {
      resetTokenHash: hacherJeton(jeton),
      resetTokenExpiry: new Date(Date.now() + DUREE_VALIDITE_MS),
    },
  });

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

  return {
    ...reponseNeutre,
    lienDeTest: `${base}/mot-de-passe-oublie/${jeton}`,
  };
}

const nouveauMotDePasseSchema = z.object({
  jeton: z.string().min(10),
  motDePasse: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères."),
});

/** Le jeton est-il encore recevable ? Sert à décider quoi afficher. */
export async function jetonEstValideAction(jeton: string): Promise<boolean> {
  if (!jeton || jeton.length < 10) return false;

  const utilisateur = await prisma.user.findFirst({
    where: { resetTokenHash: hacherJeton(jeton) },
    select: { resetTokenExpiry: true },
  });

  return Boolean(
    utilisateur?.resetTokenExpiry && utilisateur.resetTokenExpiry > new Date()
  );
}

/** Étape 2 — le visiteur choisit son nouveau mot de passe. */
export async function reinitialiserMotDePasseAction(
  formData: FormData
): Promise<ResultatReinitialisation> {
  const validation = nouveauMotDePasseSchema.safeParse({
    jeton: formData.get("jeton"),
    motDePasse: formData.get("motDePasse"),
  });

  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  const { jeton, motDePasse } = validation.data;
  const hachage = hacherJeton(jeton);

  const utilisateur = await prisma.user.findFirst({
    where: { resetTokenHash: hachage },
    select: { id: true, resetTokenHash: true, resetTokenExpiry: true, status: true },
  });

  const expire =
    !utilisateur?.resetTokenExpiry || utilisateur.resetTokenExpiry <= new Date();

  // Comparaison à durée constante, même si la recherche a déjà filtré : le
  // hachage est ici un secret, et un `===` sur un secret fuit sa longueur.
  const correspond =
    utilisateur?.resetTokenHash != null &&
    utilisateur.resetTokenHash.length === hachage.length &&
    timingSafeEqual(
      Buffer.from(utilisateur.resetTokenHash),
      Buffer.from(hachage)
    );

  if (!utilisateur || !correspond || expire) {
    return {
      success: false,
      error:
        "Ce lien n'est plus valide. Demandez-en un nouveau depuis la page de connexion.",
    };
  }

  if (utilisateur.status === "SUSPENDED") {
    return {
      success: false,
      error: "Votre compte a été suspendu. Veuillez contacter le support.",
    };
  }

  await prisma.user.update({
    where: { id: utilisateur.id },
    data: {
      passwordHash: await hashPassword(motDePasse),
      // Le jeton ne sert qu'une fois.
      resetTokenHash: null,
      resetTokenExpiry: null,
      // Un compte verrouillé par des tentatives ratées doit redevenir
      // accessible : c'est souvent la raison même de la réinitialisation.
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  return {
    success: true,
    message: "Mot de passe modifié. Vous pouvez maintenant vous connecter.",
  };
}
