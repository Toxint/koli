/**
 * L'AMORCE — ce qu'il faut pour qu'une base VIDE fonctionne. Rien de plus.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  À ne pas confondre avec `prisma/seed.ts`, le jeu de DÉMONSTRATION.       │
 * │                                                                          │
 * │  `seed.ts`   comptes + produits + commandes + paiements + transactions.  │
 * │              Pour la campagne de vérification, sur le poste. Il EFFACE    │
 * │              toutes les tables avant d'écrire.                            │
 * │                                                                          │
 * │  `amorce.ts` réglages + taux de commission + un compte administrateur.    │
 * │              Pour la production. Il n'efface RIEN et n'invente aucun      │
 * │              mouvement d'argent.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * **Pourquoi ce fichier existe.** `preparer-supabase.mjs` lançait `seed.ts` —
 * le jeu complet — contre la base de déploiement. La conséquence était directe
 * et invisible : le tout premier vendeur à ouvrir son tableau de bord y aurait
 * lu des encaissements, une courbe, des factures et un solde qui ne sont ceux
 * de personne. Sur une application dont le sujet est la confiance, des chiffres
 * inventés dans l'écran des comptes ne sont pas un détail de mise en route.
 *
 * Un tableau de bord neuf doit afficher ZÉRO. Les écrans savent le faire — la
 * courbe dit « Aucun mouvement sur la période », la liste de commandes propose
 * d'en créer une. Ces états vides ont été écrits et vérifiés ; encore
 * faut-il les laisser s'afficher.
 *
 * **Idempotent** : `upsert` partout. On le relance après une migration sans se
 * demander ce qui existe déjà, et sans jamais écraser un taux de commission que
 * l'administration aurait changé depuis.
 *
 *   npx tsx prisma/amorce.ts
 */
import { PrismaClient, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { chargerEnv } from "../scripts/env.mjs";

chargerEnv();

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL manquant : l'amorce refuse de s'exécuter sans savoir SUR " +
      "QUELLE BASE elle écrit."
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

/**
 * Le taux par défaut, en pourcentage.
 *
 * Il DOIT exister : `lib/finance/commission.ts` en a besoin dès la première
 * commande. Sans lui, le premier paiement échouerait sur une base parfaitement
 * saine par ailleurs — le pire moment pour découvrir une valeur manquante.
 */
const TAUX_COMMISSION_DEFAUT = 5.0;

async function main() {
  console.log("Amorce KOLI — réglages, commission, administrateur.\n");

  /* ── Réglages ──
   * `upsert` sur la clé : relancer l'amorce ne doit pas rétablir des valeurs
   * que l'administration a modifiées depuis l'écran des réglages. */
  const reglages = [
    { key: "DEFAULT_COMMISSION_RATE", value: String(TAUX_COMMISSION_DEFAUT) },
    { key: "TEST_PAYMENT_ENABLED", value: "true" },
    { key: "PLATFORM_NAME", value: "KOLI" },
  ];

  for (const reglage of reglages) {
    await prisma.setting.upsert({
      where: { key: reglage.key },
      update: {},
      create: reglage,
    });
  }
  console.log(`  ✓ ${reglages.length} réglages`);

  /* ── Commission ──
   * On ne crée un taux que s'il n'y en a AUCUN d'actif. En créer un second
   * ferait cohabiter deux taux actifs, et le calcul choisirait au hasard. */
  const commissionActive = await prisma.commission.findFirst({
    where: { isActive: true },
  });

  if (commissionActive) {
    console.log(
      `  · commission déjà réglée à ${commissionActive.ratePercent} % — inchangée`
    );
  } else {
    await prisma.commission.create({
      data: { ratePercent: TAUX_COMMISSION_DEFAUT, isActive: true },
    });
    console.log(`  ✓ commission à ${TAUX_COMMISSION_DEFAUT} %`);
  }

  /* ── L'administrateur ──
   *
   * Le seul compte créé, et le seul qui doive l'être : sans lui, personne ne
   * peut vérifier un vendeur, trancher un litige ni régler la commission — et
   * on ne peut pas s'en créer un par l'inscription, qui ne propose pas ce rôle.
   *
   * ⚠ Le mot de passe vient de `ADMIN_PASSWORD`. Il n'y a AUCUNE valeur de
   * repli, et c'est délibéré : un mot de passe d'administrateur codé en dur est
   * un mot de passe public, et celui-ci ouvre la totalité de la plateforme.
   * Même règle que `AUTH_SECRET` — voir §8 de CLAUDE.md. */
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminMotDePasse = process.env.ADMIN_PASSWORD;
  const adminTelephone = process.env.ADMIN_PHONE;

  if (!adminEmail || !adminMotDePasse || !adminTelephone) {
    console.log(
      "\n  ! Aucun administrateur créé : ADMIN_EMAIL, ADMIN_PASSWORD et\n" +
        "    ADMIN_PHONE ne sont pas tous renseignés.\n" +
        "    La base est utilisable, mais personne ne pourra vérifier un\n" +
        "    vendeur ni trancher un litige. Renseignez-les et relancez."
    );
  } else if (adminMotDePasse.length < 12) {
    // Refus NET plutôt qu'un avertissement : ce compte peut libérer des fonds,
    // suspendre un vendeur et modifier la commission.
    throw new Error(
      "ADMIN_PASSWORD fait moins de 12 caractères. Ce compte administre la " +
        "plateforme entière — il ne se protège pas avec un mot de passe court."
    );
  } else {
    const existant = await prisma.user.findFirst({
      where: { email: adminEmail.toLowerCase() },
      select: { id: true, role: true },
    });

    if (existant) {
      console.log(`  · administrateur ${adminEmail} déjà présent — inchangé`);
    } else {
      await prisma.user.create({
        data: {
          name: process.env.ADMIN_NAME ?? "Administration KOLI",
          email: adminEmail.toLowerCase(),
          phone: adminTelephone.replace(/\s+/g, ""),
          passwordHash: await bcrypt.hash(adminMotDePasse, 10),
          role: UserRole.ADMIN,
        },
      });
      console.log(`  ✓ administrateur ${adminEmail}`);
    }
  }

  /* ── Le contrôle qui compte ──
   *
   * On AFFIRME que la base ne contient aucun mouvement. Si ce nombre n'est pas
   * nul, c'est que le jeu de démonstration est passé par là — et les tableaux
   * de bord des vrais utilisateurs afficheront des chiffres qui ne sont ceux de
   * personne. Le dire ici est la seule occasion de s'en apercevoir avant eux. */
  const [commandes, transactions, produits] = await Promise.all([
    prisma.order.count(),
    prisma.transaction.count(),
    prisma.product.count(),
  ]);

  console.log("");
  if (commandes === 0 && transactions === 0 && produits === 0) {
    console.log("  ✓ aucune donnée fabriquée : les tableaux de bord partent de zéro");
  } else {
    console.log(
      `  ! ATTENTION — la base contient déjà ${commandes} commande(s), ` +
        `${transactions} transaction(s) et ${produits} produit(s).\n` +
        "    Si cette base est celle du déploiement, ce sont des données de\n" +
        "    DÉMONSTRATION : les premiers vrais utilisateurs verraient des\n" +
        "    chiffres inventés. Voir `npm run base:vider`."
    );
  }

  console.log("\nAmorce terminée.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
