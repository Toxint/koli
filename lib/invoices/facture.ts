import { prisma } from "@/lib/db/prisma";
import type { OrderStatus, PaymentStatus } from "@prisma/client";

/**
 * Facture / reçu (§38).
 *
 * Émise à l'aboutissement du paiement, dans la même transaction : émise après
 * coup, un incident laisserait un paiement encaissé sans pièce correspondante.
 *
 * Elle porte exactement ce que le §38 énumère — KOLI, numéro de commande,
 * date, vendeur, client, produit, quantité, prix, livraison, total, statut du
 * paiement, statut de la commande.
 */
export interface LigneFacture {
  produit: string;
  quantite: number;
  prixUnitaire: number;
  total: number;
}

export interface Facture {
  numero: string;
  emiseLe: Date;

  referenceCommande: string;
  commandeeLe: Date;

  vendeur: string;
  vendeurTelephone: string;

  clientNom: string;
  clientTelephone: string;
  clientEmail: string | null;
  clientAdresse: string;

  lignes: LigneFacture[];
  sousTotal: number;
  livraison: number;
  total: number;
  devise: string;

  statutPaiement: PaymentStatus;
  paiementConfirmeLe: Date | null;
  statutCommande: OrderStatus;
}

export async function chargerFacture(
  referenceCommande: string
): Promise<Facture | null> {
  const commande = await prisma.order.findUnique({
    where: { reference: referenceCommande },
    include: {
      invoice: true,
      payment: true,
      items: { include: { product: { select: { name: true } } } },
      seller: {
        select: {
          businessName: true,
          user: { select: { name: true, phone: true } },
        },
      },
    },
  });

  if (!commande?.invoice || !commande.payment) return null;

  const lignes = commande.items.map((ligne) => ({
    produit: ligne.product.name,
    quantite: ligne.quantity,
    prixUnitaire: ligne.unitPrice,
    total: ligne.unitPrice * ligne.quantity,
  }));

  // Le total est LU sur le paiement, et non recalculé : c'est le montant
  // réellement réglé par le client qui fait foi sur une facture. Le recalculer
  // ferait diverger la pièce du mouvement financier si un prix changeait.
  const sousTotal = lignes.reduce((acc, l) => acc + l.total, 0);

  return {
    numero: commande.invoice.number,
    emiseLe: commande.invoice.createdAt,

    referenceCommande: commande.reference,
    commandeeLe: commande.createdAt,

    vendeur: commande.seller.businessName || commande.seller.user.name,
    vendeurTelephone: commande.seller.user.phone,

    clientNom: commande.buyerName,
    clientTelephone: commande.buyerPhone,
    clientEmail: commande.buyerEmail,
    clientAdresse: [
      commande.buyerAddress,
      commande.buyerCity,
      commande.buyerCountry,
    ]
      .filter(Boolean)
      .join(", "),

    lignes,
    sousTotal,
    livraison: commande.deliveryFee,
    total: commande.payment.amount,
    devise: commande.currency,

    statutPaiement: commande.payment.status,
    paiementConfirmeLe: commande.payment.confirmedAt,
    statutCommande: commande.status,
  };
}
