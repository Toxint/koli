import { prisma } from "@/lib/db/prisma";

/**
 * Preuve de livraison (§28).
 *
 * La table `DeliveryProof` etait ecrite a chaque validation de code mais
 * n'apparaissait nulle part : ni le client, ni le vendeur, ni l'administration
 * ne pouvaient constater la remise. Une preuve que personne ne peut consulter
 * ne prouve rien.
 *
 * En V1 : code de reception, date et heure, livreur, commande. Les champs
 * signature, photo et geolocalisation existent en base et sont prevus pour
 * plus tard (§28) — l'affichage les prendra sans changement de structure.
 */
export interface PreuveLivraison {
  /** Code de reception effectivement remis par le client. */
  code: string;
  date: Date;
  livreur: string | null;
  vehicule: string | null;
  /** Prevus par le §28, pas encore collectes. */
  signatureUrl: string | null;
  photoUrl: string | null;
  latitude: number | null;
  longitude: number | null;
}

export async function chargerPreuveLivraison(
  orderId: string
): Promise<PreuveLivraison | null> {
  const livraison = await prisma.delivery.findUnique({
    where: { orderId },
    select: {
      proof: true,
      driver: { select: { vehicle: true, user: { select: { name: true } } } },
    },
  });

  if (!livraison?.proof) return null;

  return {
    code: livraison.proof.otpCode,
    date: livraison.proof.confirmedAt,
    livreur: livraison.driver?.user.name ?? null,
    vehicule: livraison.driver?.vehicle ?? null,
    signatureUrl: livraison.proof.signatureUrl,
    photoUrl: livraison.proof.photoUrl,
    latitude: livraison.proof.latitude,
    longitude: livraison.proof.longitude,
  };
}
