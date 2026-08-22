import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createSessionCookie, cookieSecurise } from "@/lib/auth/session";
import { espaceParDefaut } from "@/lib/auth/dashboards";
import { signerJetonCourt } from "@/lib/auth/jetonCourt";
import {
  COOKIE_ETAT,
  COOKIE_INSCRIPTION,
  COOKIE_NONCE,
  COOKIE_VERIFIEUR,
  echangerCodeContreIdentite,
  googleEstConfigure,
  origineDemandee,
  type IdentiteGoogle,
} from "@/lib/auth/google";

/** Le temps de finir l'inscription, pas davantage. */
const DUREE_INSCRIPTION_SECONDES = 30 * 60;

/**
 * Toutes les redirections restent sur l'origine RÉELLEMENT visitée.
 *
 * Renvoyer vers `NEXT_PUBLIC_APP_URL` ferait changer d'origine en cours de
 * route — de `http://127.0.0.1:3000` vers `http://localhost:3000`, par
 * exemple. Le navigateur traite les deux comme des sites distincts : le cookie
 * de session déposé juste avant ne suivrait pas, et l'utilisateur se
 * retrouverait déconnecté au terme d'une connexion pourtant réussie.
 */
function versConnexion(origine: string, message: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/connexion?erreur=${encodeURIComponent(message)}`, origine)
  );
}

/** Comparaison à durée constante : un `===` sur un secret fuit sa longueur. */
function memeJeton(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ta = Buffer.from(a);
  const tb = Buffer.from(b);
  if (ta.length !== tb.length) return false;
  return timingSafeEqual(ta, tb);
}

function effacerCookiesPoignee(reponse: NextResponse) {
  for (const nom of [COOKIE_ETAT, COOKIE_VERIFIEUR, COOKIE_NONCE]) {
    reponse.cookies.set(nom, "", { path: "/", maxAge: 0 });
  }
}

/**
 * Retour de Google.
 *
 * Trois issues possibles :
 *   1. `googleId` déjà connu → connexion ;
 *   2. e-mail **vérifié** correspondant à un compte existant → rattachement
 *      puis connexion ;
 *   3. inconnu → on ne crée rien tout de suite : KOLI exige un numéro de
 *      téléphone (livraison, code de réception, rattachement des commandes
 *      passées en invité) et un rôle, que Google ne fournit pas. L'identité
 *      validée part dans un cookie signé vers /inscription/google.
 */
export async function GET(requete: NextRequest) {
  const origine = origineDemandee(requete);

  if (!googleEstConfigure()) {
    return versConnexion(origine, "La connexion Google n'est pas configurée sur cette instance.");
  }

  const params = requete.nextUrl.searchParams;

  if (params.get("error")) {
    // Refus de l'utilisateur sur l'écran Google : ce n'est pas une panne.
    return NextResponse.redirect(new URL("/connexion", origine));
  }

  const code = params.get("code");
  const etatRecu = params.get("state") ?? undefined;
  const etatAttendu = requete.cookies.get(COOKIE_ETAT)?.value;
  const verifieur = requete.cookies.get(COOKIE_VERIFIEUR)?.value;
  const nonce = requete.cookies.get(COOKIE_NONCE)?.value;

  if (!code || !verifieur || !nonce || !memeJeton(etatRecu, etatAttendu)) {
    const echec = versConnexion(
      origine,
      "La connexion Google a expiré ou n'a pas pu être vérifiée. Veuillez réessayer."
    );
    effacerCookiesPoignee(echec);
    return echec;
  }

  let identite: IdentiteGoogle;
  try {
    identite = await echangerCodeContreIdentite(
      code,
      verifieur,
      nonce,
      origine
    );
  } catch {
    // Le détail de l'échec ne regarde pas le visiteur : il ne l'aiderait pas
    // et renseignerait un attaquant sur l'état de la configuration.
    const echec = versConnexion(
      origine,
      "La connexion Google a échoué. Veuillez réessayer ou utiliser votre mot de passe."
    );
    effacerCookiesPoignee(echec);
    return echec;
  }

  const inclusions = {
    sellerProfile: true,
    customerProfile: true,
    driverProfile: true,
  };

  // 1. Compte déjà lié à ce compte Google.
  let utilisateur = await prisma.user.findUnique({
    where: { googleId: identite.sub },
    include: inclusions,
  });

  // 2. Rattachement par e-mail — uniquement si Google atteste l'avoir vérifié.
  //    Sans cette condition, il suffirait de créer un compte Google portant
  //    l'adresse d'un vendeur KOLI pour prendre la main sur sa boutique.
  if (!utilisateur && identite.email && identite.emailVerifie) {
    const parEmail = await prisma.user.findUnique({
      where: { email: identite.email },
      include: inclusions,
    });

    if (parEmail) {
      utilisateur = await prisma.user.update({
        where: { id: parEmail.id },
        data: {
          googleId: identite.sub,
          photoUrl: parEmail.photoUrl ?? identite.photo,
        },
        include: inclusions,
      });
    }
  }

  if (utilisateur) {
    if (utilisateur.status === "SUSPENDED") {
      const echec = versConnexion(
        origine,
        "Votre compte a été suspendu. Veuillez contacter le support."
      );
      effacerCookiesPoignee(echec);
      return echec;
    }

    // Une connexion réussie remet le compteur de tentatives à zéro, comme
    // pour le mot de passe : sinon un compte verrouillé le resterait.
    if (utilisateur.failedLoginAttempts > 0 || utilisateur.lockedUntil) {
      await prisma.user.update({
        where: { id: utilisateur.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    await createSessionCookie({
      userId: utilisateur.id,
      role: utilisateur.role,
      name: utilisateur.name,
      phone: utilisateur.phone,
      sellerId: utilisateur.sellerProfile?.id,
      customerId: utilisateur.customerProfile?.id,
      driverId: utilisateur.driverProfile?.id,
    });

    const reponse = NextResponse.redirect(
      new URL(espaceParDefaut(utilisateur.role), origine)
    );
    effacerCookiesPoignee(reponse);
    return reponse;
  }

  // 3. Nouveau venu : il reste à recueillir le téléphone et le rôle.
  const jeton = await signerJetonCourt(
    "inscription-google",
    {
      sub: identite.sub,
      email: identite.email,
      nom: identite.nom,
      photo: identite.photo,
    },
    DUREE_INSCRIPTION_SECONDES
  );

  const reponse = NextResponse.redirect(new URL("/inscription/google", origine));
  effacerCookiesPoignee(reponse);
  reponse.cookies.set(COOKIE_INSCRIPTION, jeton, {
    httpOnly: true,
    secure: cookieSecurise(),
    sameSite: "lax",
    path: "/",
    maxAge: DUREE_INSCRIPTION_SECONDES,
  });

  return reponse;
}
