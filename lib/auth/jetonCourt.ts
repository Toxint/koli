import { SignJWT, jwtVerify } from "jose";

/**
 * Jeton signé de courte durée, pour transporter un état intermédiaire entre
 * deux requêtes sans le confier au navigateur en clair.
 *
 * Cas d'usage : entre le retour de Google et la fin de l'inscription, il faut
 * retenir l'identité Google validée. La déposer telle quelle dans un cookie
 * laisserait n'importe qui se déclarer titulaire de n'importe quelle adresse ;
 * signée, elle ne peut être ni forgée ni modifiée.
 *
 * Même secret que les sessions, mais un champ `usage` distinct : un jeton
 * d'inscription ne doit jamais pouvoir servir de session, et réciproquement.
 */
function cle(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error(
      "AUTH_SECRET manquant ou trop court (32 caracteres minimum). " +
        "Definissez-le dans .env — voir .env.example."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signerJetonCourt(
  usage: string,
  charge: Record<string, unknown>,
  dureeSecondes: number
): Promise<string> {
  return new SignJWT({ ...charge, usage })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + dureeSecondes)
    .sign(cle());
}

export async function verifierJetonCourt<T>(
  usage: string,
  jeton: string
): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(jeton, cle(), {
      algorithms: ["HS256"],
    });
    if (payload.usage !== usage) return null;
    return payload as unknown as T;
  } catch {
    return null;
  }
}
