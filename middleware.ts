import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

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
  { prefix: "/seller", role: "SELLER", redirect: "/connexion" },
  { prefix: "/driver", role: "DRIVER", redirect: "/connexion" },
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
        const defaultDashboard = getDefaultDashboardForRole(userPayload.role);
        return NextResponse.redirect(new URL(defaultDashboard, request.url));
      }
    }
  }

  // Redirect from login/register if already authenticated
  if ((pathname === "/connexion" || pathname === "/inscription") && userPayload) {
    const defaultDashboard = getDefaultDashboardForRole(userPayload.role);
    return NextResponse.redirect(new URL(defaultDashboard, request.url));
  }

  return NextResponse.next();
}

function getDefaultDashboardForRole(role: string): string {
  switch (role) {
    case "SELLER":
      return "/seller/dashboard";
    case "DRIVER":
      return "/driver/dashboard";
    case "CLIENT":
      return "/client/dashboard";
    case "ADMIN":
      return "/admin/dashboard";
    default:
      return "/";
  }
}

export const config = {
  matcher: [
    "/seller/:path*",
    "/driver/:path*",
    "/client/:path*",
    "/admin/:path*",
    "/connexion",
    "/inscription",
  ],
};
