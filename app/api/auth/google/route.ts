import { NextResponse, type NextRequest } from "next/server";
import { cookieSecurise } from "@/lib/auth/session";
import {
  COOKIE_ETAT,
  COOKIE_NONCE,
  COOKIE_VERIFIEUR,
  googleEstConfigure,
  origineDemandee,
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
export async function GET(requete: NextRequest) {
  const origine = origineDemandee(requete);

  if (!googleEstConfigure()) {
    // Le détail technique va au journal du serveur, pas à l'écran : les
    // instructions « renseignez GOOGLE_CLIENT_ID dans .env » s'adressaient à
    // un développeur et s'affichaient à un commerçant, qui n'y peut rien.
    console.warn(
      "[KOLI] Connexion Google demandée mais non configurée. " +
        "Renseignez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans .env, " +
        "puis redémarrez. Contrôle : npm run google:verifier"
    );

    // On reste sur l'origine visitée : changer d'origine ici perdrait les
    // cookies de l'utilisateur (voir callback/route.ts).
    return NextResponse.redirect(
      new URL(
        `/connexion?erreur=${encodeURIComponent(
          "La connexion avec Google n'est pas encore disponible. " +
            "Utilisez votre numéro de téléphone ou votre e-mail pour vous connecter."
        )}`,
        origine
      )
    );
  }

  const etat = jetonAleatoire();
  const verifieur = jetonAleatoire();
  const nonce = jetonAleatoire();

  const reponse = NextResponse.redirect(
    urlAutorisation({ etat, verifieur, nonce, origine: origine })
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
