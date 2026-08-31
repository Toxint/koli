import { prisma } from "@/lib/db/prisma";

/**
 * Ce qui vient réellement de se passer sur KOLI.
 *
 * Alimente les vignettes du coin bas-gauche de l'accueil
 * (`components/domain/AnnoncesActivite.tsx`).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  ELLES ÉTAIENT INVENTÉES. Elles ne le sont plus.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Six annonces écrites à la main — « Awa K. vient de s'inscrire »,
 * « Kouadio B. a reçu 42 500 FCFA » — tournaient sur la page d'accueil,
 * retenues hors ligne par une garde et marquées « exemple ». C'était la seule
 * façon honnête de les afficher tant qu'elles ne correspondaient à rien.
 *
 * Elles correspondent maintenant à quelque chose : ce fichier lit le registre.
 * Une inscription affichée est une inscription qui a eu lieu, un versement
 * affiché est un versement qui a eu lieu. La garde et la mention « exemple »
 * n'ont plus de raison d'être — non parce qu'on a décidé de s'en passer, mais
 * parce que ce qu'elles protégeaient a disparu.
 *
 * **S'il ne s'est rien passé, il n'y a rien à dire.** La fonction renvoie une
 * liste vide et le composant ne s'affiche pas. C'est le comportement voulu :
 * une vitrine qui annonce une activité qu'elle n'a pas se paie au premier
 * client, et c'est exactement le défaut qu'on vient de retirer.
 */

export interface Annonce {
  /** `client` pour une inscription, `argent` pour un versement. */
  icone: "client" | "argent";
  titre: string;
  detail: string;
}

/** Combien on en garde. Au-delà, la boucle dure plus que la visite. */
const COMBIEN = 6;

/**
 * Quatorze jours. Une inscription d'il y a trois mois annoncée comme si elle
 * venait d'arriver serait un mensonge de plus, en plus petit.
 */
const FENETRE_JOURS = 14;

/**
 * « Awa K. » — prénom entier, nom réduit à son initiale.
 *
 * Ce sont de VRAIES personnes, et cette page est publique. Le prénom seul ne
 * distingue personne, le nom complet expose un client qui n'a jamais demandé à
 * figurer sur la vitrine. L'initiale est l'usage de ce genre de vignette, et
 * c'est le minimum qu'on doive à quelqu'un dont on affiche le passage.
 *
 * Un nom vide ou d'un seul mot ressort tel quel : mieux vaut un prénom seul
 * qu'un « undefined K. ».
 */
function abreger(nomComplet: string): string {
  const morceaux = nomComplet.trim().split(/\s+/).filter(Boolean);
  if (morceaux.length === 0) return "Quelqu'un";
  if (morceaux.length === 1) return morceaux[0];
  return `${morceaux[0]} ${morceaux[morceaux.length - 1][0].toUpperCase()}.`;
}

/** Le séparateur de milliers de `lib/format`, sans importer tout le module. */
function montant(v: number): string {
  return `${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
}

/**
 * Les dernières inscriptions et les derniers versements, entremêlés.
 *
 * Deux requêtes plutôt qu'une union SQL : les deux tables n'ont ni les mêmes
 * colonnes ni les mêmes jointures, et une union les aurait fait se ressembler
 * de force. On les fusionne ensuite par date, ce qui est de toute façon ce
 * qu'on veut lire — l'ordre réel des événements.
 */
export async function annoncesActivite(): Promise<Annonce[]> {
  const depuis = new Date(Date.now() - FENETRE_JOURS * 24 * 60 * 60 * 1000);

  const [inscriptions, versements] = await Promise.all([
    prisma.user.findMany({
      where: {
        createdAt: { gte: depuis },
        status: "ACTIVE",
        // L'administration n'est pas une inscription : l'annoncer dirait au
        // premier venu qu'un compte d'administrateur vient d'être créé.
        role: { in: ["CLIENT", "SELLER", "DRIVER"] },
      },
      select: { name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: COMBIEN,
    }),

    prisma.transaction.findMany({
      where: { type: "FUNDS_RELEASED", createdAt: { gte: depuis } },
      select: {
        amount: true,
        createdAt: true,
        order: {
          select: { seller: { select: { user: { select: { name: true } } } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: COMBIEN,
    }),
  ]);

  const tout = [
    ...inscriptions.map((u) => ({
      quand: u.createdAt,
      annonce: {
        icone: "client" as const,
        titre: "Nouveau compte",
        detail: `${abreger(u.name)} vient de s'inscrire`,
      },
    })),
    ...versements.map((t) => ({
      quand: t.createdAt,
      annonce: {
        icone: "argent" as const,
        titre: "Fonds libérés",
        // `amount` est signé : un crédit est positif, mais on affiche une
        // somme reçue — la valeur absolue évite un « a reçu -32 000 FCFA »
        // si la convention de signe change un jour.
        detail: `${abreger(t.order.seller.user.name)} a reçu ${montant(Math.abs(t.amount))}`,
      },
    })),
  ];

  return tout
    .sort((a, b) => b.quand.getTime() - a.quand.getTime())
    .slice(0, COMBIEN)
    .map((e) => e.annonce);
}
