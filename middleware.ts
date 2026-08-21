import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { espaceParDefaut } from "@/lib/auth/dashboards";

const COOKIE_NAME = "koli_session";

/** Voir lib/auth/session.ts : aucune valeur de repli, jamais de secret en dur. */
function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.trim().length < 32) {
    throw new Error(
      "AUTH_SECRET manquant ou trop court (32 caracteres minimum). " +
        "Definissez-le dans .env — voir .env.example."
    );
  }

  return new TextEncoder().encode(secret);
}

// Map paths to required roles
const ROLE_ROUTES: { prefix: string; role: string; redirect: string }[] = [
  { prefix: "/vendeur", role: "SELLER", redirect: "/connexion" },
  { prefix: "/livreur", role: "DRIVER", redirect: "/connexion" },
  { prefix: "/client", role: "CLIENT", redirect: "/connexion" },
  { prefix: "/admin", role: "ADMIN", redirect: "/connexion" },
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(COOKIE_NAME)?.value;
  let userPayload: { userId: string; role: string } | null = null;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSecretKey(), {
        algorithms: ["HS256"],
      });
      userPayload = payload as unknown as { userId: string; role: string };
    } catch {
      userPayload = null;
    }
  }

  // Check auth for protected role routes
  for (const route of ROLE_ROUTES) {
    if (pathname.startsWith(route.prefix)) {
      if (!userPayload) {
        const loginUrl = new URL("/connexion", request.url);
        loginUrl.searchParams.set("redirect", pathname);
        return NextResponse.redirect(loginUrl);
      }

      if (userPayload.role !== route.role && userPayload.role !== "ADMIN") {
        // Redirect to user's dashboard based on their role
        const defaultDashboard = espaceParDefaut(userPayload.role);
        return NextResponse.redirect(new URL(defaultDashboard, request.url));
      }
    }
  }

  // La redirection « vous etes deja connecte » N'EST PLUS FAITE ICI.
  //
  // Ce middleware ne verifie que la SIGNATURE du jeton ; il n'interroge jamais
  // la base. Quand le compte a disparu — suppression, reinitialisation de la
  // base — les deux couches cessaient d'etre d'accord et se renvoyaient la
  // balle indefiniment :
  //
  //   /vendeur/dashboard  ->  la page ne trouve pas le compte  ->  /connexion
  //   /connexion          ->  le middleware voit un jeton valide  ->  /vendeur/dashboard
  //
  // Resultat : ERR_TOO_MANY_REDIRECTS et une page blanche, sans aucun moyen de
  // s'en sortir autrement qu'en effacant ses cookies a la main.
  //
  // Decider « vous etes deja connecte » suppose de savoir que le compte EXISTE,
  // ce que seule la page peut verifier. Le choix vit donc desormais dans
  // app/(public)/connexion et /inscription, ou `getCurrentUser()` lit la base.
  // Le middleware garde son seul role legitime : proteger les routes privees.

  return NextResponse.next();
}


export const config = {
  matcher: [
    "/vendeur/:path*",
    "/livreur/:path*",
    "/client/:path*",
    "/admin/:path*",
  ],
};
