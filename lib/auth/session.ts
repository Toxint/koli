import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { UserRole } from "@prisma/client";

const COOKIE_NAME = "koli_session";

/**
 * Cle de signature des sessions.
 *
 * Lue paresseusement (et non au chargement du module) pour que l'import de ce
 * fichier ne casse pas avant que l'environnement soit charge. Aucune valeur de
 * repli : un secret code en dur dans le depot est un secret public, et une
 * absence silencieuse de configuration rendrait les jetons forgeables
 * (cahier des charges §47).
 */
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

export interface SessionPayload {
  userId: string;
  role: UserRole;
  name: string;
  phone: string;
  sellerId?: string;
  customerId?: string;
  driverId?: string;
}

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export async function decryptSession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * L'attribut `secure` interdit au navigateur de renvoyer le cookie ailleurs
 * qu'en HTTPS.
 *
 * Le lier a NODE_ENV etait un piege : un build de production servi en HTTP sur
 * le reseau local (http://192.168.x.x, la facon normale de tester depuis un
 * telephone) posait un cookie que le navigateur refusait ensuite de renvoyer.
 * La connexion reussissait, puis l'utilisateur etait aussitot renvoye vers la
 * page de connexion — sans le moindre message. Le defaut restait invisible sur
 * `localhost`, que les navigateurs traitent comme une origine de confiance et
 * ou les cookies `secure` sont acceptes en clair.
 *
 * On se fie donc au protocole reellement servi, declare dans NEXT_PUBLIC_APP_URL.
 */
function cookieSecurise(): boolean {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://");
}

export async function createSessionCookie(payload: SessionPayload) {
  const token = await encryptSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: cookieSecurise(),
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 jours
  });
}

export async function deleteSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return decryptSession(token);
}
