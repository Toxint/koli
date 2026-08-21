import { NextResponse } from "next/server";
import { cookieSecurise } from "@/lib/auth/session";
import {
  COOKIE_ETAT,
  COOKIE_NONCE,
  COOKIE_VERIFIEUR,
  googleEstConfigure,
  jetonAleatoire,
  urlAutorisation,
} from "@/lib/auth/google";

/** Les jetons de la poignée de main ne servent qu'une fois, et brièvement. */
const DUREE_ETAT_SECONDES = 10 * 60;

/**
 * Départ de la connexion Google.
 *
 * Dépose `state`, `code_verifier` et `nonce` en cookies httpOnly, puis envoie
 * l'utilisateur chez Google. Les trois sont revérifiés au retour, dans
 * `callback/route.ts`.
 */
export async function GET() {
  if (!googleEstConfigure()) {
    return NextResponse.redirect(
      new URL(
        `/connexion?erreur=${encodeURIComponent("La connexion Google n'est pas configurée sur cette instance.")}`,
        process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
      )
    );
  }

  const etat = jetonAleatoire();
  const verifieur = jetonAleatoire();
  const nonce = jetonAleatoire();

  const reponse = NextResponse.redirect(
    urlAutorisation({ etat, verifieur, nonce })
  );

  const options = {
    httpOnly: true,
    secure: cookieSecurise(),
    // `lax` et non `strict` : Google nous renvoie par une navigation venant
    // d'un autre site. En `strict`, le navigateur retiendrait les cookies et
    // la vérification échouerait systématiquement.
    sameSite: "lax" as const,
    path: "/",
    maxAge: DUREE_ETAT_SECONDES,
  };

  reponse.cookies.set(COOKIE_ETAT, etat, options);
  reponse.cookies.set(COOKIE_VERIFIEUR, verifieur, options);
  reponse.cookies.set(COOKIE_NONCE, nonce, options);

  return reponse;
}
