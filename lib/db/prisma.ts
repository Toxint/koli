import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Client Prisma — PostgreSQL, fourni par Supabase.
 *
 * **Pourquoi une seule instance.** En développement, Next recharge les modules
 * à chaque modification ; sans le cache global ci-dessous, chaque rechargement
 * ouvrirait un nouveau jeu de connexions et la base finirait par les refuser.
 *
 * **Pourquoi le mode « transaction » du pooler.** Supabase expose deux
 * adresses : le port 5432 parle directement à Postgres, le port 6543 passe par
 * un pooler. Sur un hébergement sans serveur — chaque requête pouvant démarrer
 * son propre processus — le port direct épuise les connexions en quelques
 * minutes de trafic. C'est le pooler qu'il faut, et c'est ce que
 * `DATABASE_URL` doit désigner.
 *
 * `DIRECT_URL` reste nécessaire aux migrations : le pooler en mode transaction
 * ne sait pas exécuter les instructions de définition de schéma.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function creerClient() {
  const url = process.env.DATABASE_URL;

  // Aucune valeur de repli : une chaîne de connexion absente doit faire
  // échouer bruyamment. Se rabattre sur une base locale ferait tourner
  // l'application sur des données qui ne sont pas les bonnes, sans le dire.
  if (!url) {
    throw new Error(
      "DATABASE_URL manquant. Renseignez la chaîne de connexion Supabase " +
        "(pooler, port 6543) — voir .env.example."
    );
  }

  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? creerClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
