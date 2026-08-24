import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/actions";
import { lireFichier } from "@/lib/kyc/stockage";

/**
 * Restitution d'une pièce justificative (§37, §47).
 *
 * **C'est le seul chemin par lequel un document d'identité sort du serveur.**
 * Les fichiers sont rangés hors de `public/`, précisément pour qu'aucune
 * adresse devinée ne puisse les atteindre.
 *
 * Trois protections, et chacune répond à une attaque précise :
 *
 * 1. **Autorisation** — seul le vendeur propriétaire, ou un administrateur.
 *    L'identifiant du document est un `cuid` difficile à deviner, mais
 *    l'obscurité n'est pas un contrôle d'accès : un identifiant se copie, se
 *    retrouve dans un journal, se partage par mégarde.
 *
 * 2. **`Content-Type` imposé** depuis la valeur déterminée à l'envoi par
 *    lecture du fichier, et `X-Content-Type-Options: nosniff`. Sans cela, un
 *    navigateur peut décider lui-même du type d'après le contenu et exécuter
 *    comme page ce qui a été déposé comme image — dans notre propre domaine,
 *    donc avec accès aux cookies de session.
 *
 * 3. **`Content-Disposition: attachment`** : le fichier est proposé au
 *    téléchargement plutôt qu'affiché. C'est la protection de dernier recours
 *    si les deux précédentes venaient à être contournées.
 *
 * Aucune mise en cache publique : `private, no-store`. Un cache partagé — un
 * proxy d'entreprise, par exemple — pourrait sinon servir la carte d'identité
 * d'un vendeur au visiteur suivant.
 */
export async function GET(
  _requete: Request,
  contexte: { params: Promise<{ id: string }> }
) {
  const { id } = await contexte.params;

  const utilisateur = await getCurrentUser();
  if (!utilisateur) {
    return new NextResponse("Non authentifié", { status: 401 });
  }

  const document = await prisma.kycDocument.findUnique({
    where: { id },
    select: {
      fileUrl: true,
      mimeType: true,
      seller: { select: { userId: true } },
    },
  });

  // Même réponse pour « n'existe pas » et « ne vous appartient pas » : deux
  // codes différents diraient à un curieux quels identifiants existent.
  const autorise =
    document !== null &&
    (utilisateur.role === "ADMIN" ||
      document.seller.userId === utilisateur.id);

  if (!autorise) {
    return new NextResponse("Introuvable", { status: 404 });
  }

  const donnees = await lireFichier(document.fileUrl);
  if (donnees === null) {
    return new NextResponse("Fichier indisponible", { status: 404 });
  }

  return new NextResponse(new Uint8Array(donnees), {
    headers: {
      // Jamais le type annoncé par le client : celui reconnu à l'envoi.
      "Content-Type": document.mimeType ?? "application/octet-stream",
      "Content-Length": String(donnees.length),
      "Content-Disposition": "attachment",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store, max-age=0",
      // Rien à indexer ni à conserver.
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
