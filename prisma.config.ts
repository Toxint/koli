import { defineConfig } from "@prisma/config";

/**
 * Configuration Prisma.
 *
 * **Aucune valeur de repli sur `DATABASE_URL`.** Elle pointait auparavant vers
 * un fichier SQLite local : une variable oubliée faisait alors travailler les
 * migrations sur une base de développement au lieu de la vraie, sans le
 * moindre avertissement. Mieux vaut un échec net.
 *
 * **`DIRECT_URL` pour les migrations.** Supabase expose deux adresses : le
 * pooler (port 6543), qui convient au trafic applicatif, et la connexion
 * directe (port 5432). Le pooler en mode transaction ne sait pas exécuter les
 * instructions de définition de schéma — les migrations doivent donc passer en
 * direct. Sans cette distinction, `migrate deploy` échoue avec une erreur qui
 * ne dit pas pourquoi.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
