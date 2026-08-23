import type { Prisma } from "@prisma/client";
import type { OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Listes de factures (§38, phase 20).
 *
 * La pièce existait déjà — émise dans la transaction du paiement, consultable
 * à l'adresse `/facture/<référence>`. Ce qui manquait, c'était de pouvoir les
 * voir **ensemble** : le vendeur n'atteignait une facture que depuis la ligne
 * de sa commande, et le client seulement depuis son lien de paiement. Personne
 * ne pouvait répondre à « combien ai-je facturé ce mois-ci ».
 *
 * Le cloisonnement repose entièrement sur le filtre passé ici. Une facture
 * porte le nom, le téléphone et l'adresse d'un client : la laisser fuir vers
 * un autre compte serait une fuite de données personnelles, pas seulement une
 * indiscrétion commerciale.
 */
export interface LigneFactureListe {
  numero: string;
  emiseLe: Date;
  referenceCommande: string;
  contrepartie: string;
  total: number;
  statutPaiement: PaymentStatus;
  statutCommande: OrderStatus;
}

export interface ResultatFactures {
  lignes: LigneFactureListe[];
  total: number;
  /** Somme des factures du filtre — calculée en base, pas sur la page. */
  montantTotal: number;
}

interface Filtres {
  recherche?: string;
  page: number;
  parPage: number;
}

/**
 * Construit la clause de lecture.
 *
 * `portee` est **imposée par l'appelant** à partir de la session, jamais lue
 * dans l'URL : c'est ce qui garantit qu'aucun paramètre fabriqué ne peut
 * élargir la vue.
 *
 * Le `AND` explicite quand il y a une recherche n'est pas une coquetterie :
 * poser la portée et le `OR` de recherche au même niveau les mettrait en
 * concurrence, et une recherche sur un nom courant ferait alors remonter les
 * factures de tout le monde.
 */
function clause(
  portee: Prisma.OrderWhereInput,
  terme?: string
): Prisma.InvoiceWhereInput {
  if (!terme) return { order: portee };

  // La recherche couvre les trois identifiants qu'une personne a sous la main :
  // le numéro de facture, la référence de commande, le nom du client. Le
  // numéro porte sur `Invoice` et non sur la commande, d'où les deux niveaux.
  return {
    AND: [
      { order: portee },
      {
        OR: [
          { number: { contains: terme } },
          { order: { reference: { contains: terme } } },
          { order: { buyerName: { contains: terme } } },
        ],
      },
    ],
  };
}

/**
 * `vue` détermine qui est la contrepartie affichée.
 *
 * Le vendeur veut voir à QUI il a facturé ; le client veut voir DE QUI vient
 * le reçu. Afficher le nom de l'acheteur des deux côtés donnerait au client
 * une liste où chaque ligne porte son propre nom — parfaitement inutile.
 */
async function charger(
  portee: Prisma.OrderWhereInput,
  vue: "vendeur" | "client",
  { recherche, page, parPage }: Filtres
): Promise<ResultatFactures> {
  const where = clause(portee, recherche?.trim() || undefined);

  const [factures, total, montant] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        order: {
          select: {
            reference: true,
            status: true,
            buyerName: true,
            payment: { select: { amount: true, status: true } },
            seller: {
              select: {
                businessName: true,
                user: { select: { name: true } },
              },
            },
          },
        },
      },
      // Décroissant sur le numéro : le format à zéros complétés rend l'ordre
      // alphabétique identique à l'ordre chronologique.
      orderBy: { number: "desc" },
      skip: (page - 1) * parPage,
      take: parPage,
    }),
    prisma.invoice.count({ where }),
    // Le montant total est agrégé sur les PAIEMENTS des commandes du filtre,
    // pas sur la page affichée : un total qui change en tournant la page ment
    // sans en avoir l'air.
    prisma.payment.aggregate({
      where: { order: { ...portee, invoice: { isNot: null } } },
      _sum: { amount: true },
    }),
  ]);

  return {
    lignes: factures.map((f) => ({
      numero: f.number,
      emiseLe: f.createdAt,
      referenceCommande: f.order.reference,
      contrepartie:
        vue === "vendeur"
          ? f.order.buyerName
          : f.order.seller.businessName || f.order.seller.user.name,
      total: f.order.payment?.amount ?? 0,
      statutPaiement: f.order.payment?.status ?? "PENDING",
      statutCommande: f.order.status,
    })),
    total,
    montantTotal: montant._sum.amount ?? 0,
  };
}

/** Les factures émises par un vendeur. */
export function chargerFacturesVendeur(
  sellerId: string,
  filtres: Filtres
): Promise<ResultatFactures> {
  return charger({ sellerId }, "vendeur", filtres);
}

/**
 * Les factures d'un client.
 *
 * Deux rattachements, réunis par un `OR` : le compte (`customerId`) et le
 * **numéro de téléphone**. Le second est indispensable — une grande partie du
 * public achète en mode invité via un lien WhatsApp, puis crée un compte plus
 * tard. Sans lui, ces factures resteraient invisibles à la personne qui les a
 * pourtant payées.
 */
export function chargerFacturesClient(
  { customerId, telephone }: { customerId: string | null; telephone: string },
  filtres: Filtres
): Promise<ResultatFactures> {
  return charger(
    {
      OR: [
        ...(customerId ? [{ customerId }] : []),
        { buyerPhone: telephone },
      ],
    },
    "client",
    filtres
  );
}
