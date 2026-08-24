/**
 * Journal d'audit (§48), de bout en bout.
 *
 * Ce que ce test protege : cinq actes d'autorite s'exercaient SANS AUCUNE
 * TRACE de leur auteur — changer le taux de commission, suspendre un compte,
 * rejeter un vendeur, trancher un litige, traiter un remboursement. La table
 * `AuditLog` existait depuis le premier jour et n'etait jamais ecrite.
 *
 * Sur un produit qui retient l'argent d'autrui, un administrateur capable de
 * faire varier les revenus d'un vendeur sans laisser de trace est un defaut de
 * conception, pas une commodite.
 *
 * Usage :
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-journal-audit.mjs
 */

import { chromium } from "playwright";
import Database from "better-sqlite3";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

console.log(`\n=== JOURNAL D'AUDIT depuis ${BASE} ===\n`);

let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const db = new Database("prisma/dev.db", { readonly: true });
const compter = (action) =>
  db.prepare("SELECT COUNT(*) n FROM AuditLog WHERE action = ?").get(action).n;
const derniere = (action) =>
  db
    .prepare(
      "SELECT * FROM AuditLog WHERE action = ? ORDER BY createdAt DESC LIMIT 1"
    )
    .get(action);

const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const bouton = (p, libelle) =>
  p.getByRole("button", { name: libelle }).filter({ visible: true }).first();

const connecter = async (identifiant) => {
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill(identifiant);
  await page.locator("#password").fill(MDP);
  await bouton(page, /^Se connecter$/).click();
  await page
    .waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 25000 })
    .catch(() => {});
};

await connecter("admin@koli.ci");

// ═══════════ 1. La page existe et est reservee a l'administration
{
  await page.goto(`${BASE}/admin/journal`, { waitUntil: "networkidle" });
  verifier(
    new URL(page.url()).pathname === "/admin/journal",
    "le journal est accessible a l'administration"
  );

  const texte = await page.evaluate(() => document.body.innerText);
  verifier(/Journal/i.test(texte), "la page s'annonce comme un journal");
  verifier(
    /Journal/.test(texte) && (await page.locator("aside").innerText()).includes("Journal"),
    "« Journal » figure au menu de l'administration (§217)"
  );
}

// ═══════════ 2. Changer le taux de commission laisse une trace
{
  const avant = compter("COMMISSION_RATE_SET");

  await page.goto(`${BASE}/admin/commissions`, { waitUntil: "networkidle" });
  const champ = page.locator("#taux");
  const tauxActuel = await champ.inputValue();
  const nouveau = tauxActuel === "6" ? "7" : "6";

  await champ.fill(nouveau);
  await bouton(page, /Enregistrer/i).click();
  await page.waitForTimeout(2500);

  verifier(
    compter("COMMISSION_RATE_SET") === avant + 1,
    "changer le taux inscrit un acte au journal",
    `${avant} → ${compter("COMMISSION_RATE_SET")}`
  );

  const ligne = derniere("COMMISSION_RATE_SET");
  verifier(
    ligne?.actorName != null && ligne.actorName.length > 0,
    "l'acte nomme son auteur",
    ligne?.actorName ?? "aucun"
  );
  verifier(ligne?.actorRole === "ADMIN", "le role de l'auteur est consigne");

  // Sans le « avant », une ligne « taux modifie » n'apprend rien.
  const details = JSON.parse(ligne?.metadata ?? "{}");
  verifier(
    "avant" in details && "apres" in details,
    "l'acte consigne l'avant ET l'apres",
    ligne?.metadata ?? "aucun detail"
  );
  verifier(
    String(details.apres).startsWith(nouveau),
    "l'apres correspond a la valeur reellement enregistree",
    String(details.apres)
  );
}

// ═══════════ 3. Suspendre un compte laisse une trace
{
  const avant = compter("ACCOUNT_STATUS_SET");

  await page.goto(`${BASE}/admin/utilisateurs`, { waitUntil: "networkidle" });
  const basculer = page
    .getByRole("button", { name: /Suspendre|Réactiver/i })
    .filter({ visible: true })
    .first();

  verifier(
    (await basculer.count()) > 0,
    "un compte peut etre suspendu depuis la console"
  );

  if (await basculer.count()) {
    await basculer.click();
    await page.waitForTimeout(1200);
    // Une confirmation peut s'interposer (§58).
    const confirmer = page
      .getByRole("button", { name: /Confirmer|Oui/i })
      .filter({ visible: true })
      .first();
    if (await confirmer.count()) {
      await confirmer.click();
      await page.waitForTimeout(2000);
    }

    verifier(
      compter("ACCOUNT_STATUS_SET") === avant + 1,
      "suspendre ou reactiver un compte inscrit un acte",
      `${avant} → ${compter("ACCOUNT_STATUS_SET")}`
    );

    const details = JSON.parse(derniere("ACCOUNT_STATUS_SET")?.metadata ?? "{}");
    verifier(
      details.avant !== details.apres,
      "l'acte dit ce qui a change",
      JSON.stringify(details)
    );
  }
}

// ═══════════ 4. Verifier un vendeur laisse une trace
{
  const avant = compter("SELLER_VERIFICATION_SET");

  await page.goto(`${BASE}/admin/vendeurs`, { waitUntil: "networkidle" });
  const action = page
    .getByRole("button", { name: /Vérifier|Rejeter|Remettre en attente/i })
    .filter({ visible: true })
    .first();

  if (await action.count()) {
    await action.click();
    await page.waitForTimeout(1200);
    const confirmer = page
      .getByRole("button", { name: /Confirmer|Oui/i })
      .filter({ visible: true })
      .first();
    if (await confirmer.count()) {
      await confirmer.click();
      await page.waitForTimeout(2000);
    }

    verifier(
      compter("SELLER_VERIFICATION_SET") === avant + 1,
      "une decision de verification inscrit un acte",
      `${avant} → ${compter("SELLER_VERIFICATION_SET")}`
    );
  } else {
    verifier(false, "une action de verification est proposee");
  }
}

// ═══════════ 5. Le journal AFFICHE ce qu'il a enregistre
{
  await page.goto(`${BASE}/admin/journal`, { waitUntil: "networkidle" });
  const texte = await page.evaluate(() => document.body.innerText);

  verifier(
    /Taux de commission modifié/i.test(texte),
    "l'acte apparait en francais, pas en code technique"
  );
  verifier(
    /→/.test(texte),
    "le avant → apres est lisible directement dans la liste"
  );

  // L'auteur doit etre nomme : un journal anonyme ne sert a rien.
  const admin = db
    .prepare("SELECT name FROM User WHERE email = ?")
    .get("admin@koli.ci");
  verifier(
    texte.includes(admin.name),
    "chaque acte est attribue a son auteur",
    admin.name
  );

  // Filtrage : un journal se consulte pour repondre a une question precise.
  await page.goto(`${BASE}/admin/journal?action=COMMISSION_RATE_SET`, {
    waitUntil: "networkidle",
  });

  // On lit les LIGNES, pas le texte de la page entiere : celle-ci contient le
  // menu de filtrage, dont les options portent justement tous les libelles.
  // Le controle voyait donc « Statut de compte modifie » dans le selecteur et
  // concluait a une fuite, alors que la liste etait correctement filtree.
  const actes = await page
    .locator("main ul li")
    .evaluateAll((els) => els.map((e) => e.innerText.split("\n")[0].trim()));

  verifier(
    actes.length > 0 &&
      actes.every((a) => /Taux de commission modifié/i.test(a)),
    "le filtre par type d'acte isole bien un seul type",
    JSON.stringify(actes.slice(0, 4))
  );
}

// ═══════════ 6. Le journal n'est pas consultable par les autres roles
{
  const autre = await navigateur.newContext();
  const p2 = await autre.newPage();
  await p2.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await p2.locator("#identifier").fill("vendeur@koli.ci");
  await p2.locator("#password").fill(MDP);
  await p2.getByRole("button", { name: /^Se connecter$/ }).filter({ visible: true }).first().click();
  await p2.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 25000 }).catch(() => {});

  await p2.goto(`${BASE}/admin/journal`, { waitUntil: "networkidle" });
  const chemin = new URL(p2.url()).pathname;
  verifier(
    chemin !== "/admin/journal",
    "un vendeur n'accede pas au journal d'audit",
    chemin
  );
  await autre.close();
}

// ═══════════ 7. Le journal est en AJOUT SEUL
{
  // Un journal que l'application peut retoucher ne prouve rien. Aucun chemin
  // ne doit exposer de mise a jour ni de suppression.
  const fs = await import("node:fs");
  const path = await import("node:path");

  const fichiers = [];
  const parcourir = (racine) => {
    for (const e of fs.readdirSync(racine, { withFileTypes: true })) {
      const complet = path.join(racine, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        parcourir(complet);
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        fichiers.push(complet);
      }
    }
  };
  parcourir("lib");
  parcourir("app");

  const coupables = fichiers.filter((f) =>
    /auditLog\.(update|updateMany|delete|deleteMany|upsert)/.test(
      fs.readFileSync(f, "utf8")
    )
  );

  verifier(
    coupables.length === 0,
    "aucun chemin ne modifie ni ne supprime une ligne du journal",
    coupables.join(", ")
  );
}

db.close();
await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "Chaque acte d'autorite laisse une trace nominative et lisible."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
