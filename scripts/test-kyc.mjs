/**
 * Verification KYC (§37), de bout en bout.
 *
 * Ce que ce test protege : le modele `KycDocument` existait en base et
 * n'etait JAMAIS ecrit. Mais surtout, il verifie ce qui, mal fait, transforme
 * un depot de pieces d'identite en faille :
 *
 *  - une piece ne doit JAMAIS etre atteignable sans autorisation ;
 *  - un fichier dangereux presente comme une image doit etre REFUSE ;
 *  - le fichier ne doit pas etre servi d'une facon qui permette son execution.
 *
 * Usage :
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-kyc.mjs
 */

import { chromium } from "playwright";
import Database from "better-sqlite3";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

console.log(`\n=== VERIFICATION KYC depuis ${BASE} ===\n`);

let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const lire = (requete, ...params) => {
  const db = new Database("prisma/dev.db", { readonly: true });
  const r = db.prepare(requete).all(...params);
  db.close();
  return r;
};

const bouton = (p, libelle) =>
  p.getByRole("button", { name: libelle }).filter({ visible: true }).first();

const connecter = async (page, identifiant) => {
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill(identifiant);
  await page.locator("#password").fill(MDP);
  await bouton(page, /^Se connecter$/).click();
  await page
    .waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 25000 })
    .catch(() => {});
};

/** Un JPEG minuscule mais VALIDE : signature reelle, pas un nom de fichier. */
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ...new Array(64).fill(0x20),
  0xff, 0xd9,
]);

/** Du HTML, qu'on presentera comme une image. */
const FAUX = Buffer.from('<html><script>alert(document.cookie)</script></html>');

const navigateur = await chromium.launch();

// ═══════════ 1. Le vendeur depose son identite et une piece
{
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");

  await page.goto(`${BASE}/vendeur/verification`, { waitUntil: "networkidle" });
  verifier(
    new URL(page.url()).pathname === "/vendeur/verification",
    "la page de verification est accessible au vendeur"
  );

  const texte = await page.evaluate(() => document.body.innerText);
  // §37 : « ne doit pas bloquer tout le MVP » — la page doit le dire.
  verifier(
    /vendre dès maintenant|en parallèle/i.test(texte),
    "la page dit que la verification ne bloque pas la vente (§37)"
  );
  verifier(
    /Pièce d'identité/i.test(texte) && /Obligatoire/i.test(texte),
    "les pieces attendues sont listees, manquantes comprises"
  );

  // Nom legal.
  await page.locator("#legalName").fill("Koné Awa Marie");
  await bouton(page, /Enregistrer/i).click();
  await page.waitForTimeout(2500);

  const enBase = lire(
    `SELECT legalName FROM SellerProfile s JOIN User u ON u.id = s.userId WHERE u.email = ?`,
    "vendeur@koli.ci"
  )[0];
  verifier(
    enBase?.legalName === "Koné Awa Marie",
    "le nom legal est enregistre",
    enBase?.legalName ?? "aucun"
  );

  // ═══════════ 2. Un fichier dangereux est REFUSE
  //
  // On ne COMPTE pas les documents : redeposer une piece REMPLACE la
  // precedente, le total ne bouge donc pas. Un controle par comptage passait
  // ici pour une mauvaise raison — il restait vert alors meme que le fichier
  // dangereux avait ete accepte. On regarde donc ce qui change reellement :
  // le nom d'origine du dernier document du vendeur.
  const nomFaux = `piege-${Date.now()}.png`;

  const champ = page.locator('input[type="file"]').first();
  await champ.setInputFiles({
    // Le navigateur ANNONCE une image : c'est exactement la falsification que
    // le serveur doit ignorer, en lisant le fichier lui-meme.
    name: nomFaux,
    mimeType: "image/png",
    buffer: FAUX,
  });
  await page.waitForTimeout(3000);

  const traceFaux = lire(
    `SELECT COUNT(*) n FROM KycDocument d JOIN SellerProfile s ON s.id = d.sellerId
       JOIN User u ON u.id = s.userId WHERE u.email = ? AND d.originalName = ?`,
    "vendeur@koli.ci",
    nomFaux
  )[0].n;

  verifier(
    traceFaux === 0,
    "un fichier HTML annonce comme image est REFUSE",
    `${traceFaux} enregistrement(s) du fichier piege`
  );
  verifier(
    (await page.locator('[role="alert"]').filter({ hasText: /format/i }).count()) > 0,
    "le refus est explique au vendeur"
  );

  // ═══════════ 3. Une vraie image est acceptee
  await champ.setInputFiles({
    name: "ma piece d'identité.jpg",
    mimeType: "image/jpeg",
    buffer: JPEG,
  });
  await page.waitForTimeout(3500);

  const doc = lire(
    `SELECT d.* FROM KycDocument d JOIN SellerProfile s ON s.id = d.sellerId
       JOIN User u ON u.id = s.userId WHERE u.email = ? ORDER BY d.createdAt DESC LIMIT 1`,
    "vendeur@koli.ci"
  )[0];

  verifier(doc !== undefined, "la piece est enregistree");
  verifier(doc?.status === "PENDING", "elle attend un examen", doc?.status);
  verifier(
    doc?.mimeType === "image/jpeg",
    "le type est celui RECONNU, pas celui annonce",
    doc?.mimeType
  );

  // Le nom sur disque ne doit rien reveler.
  verifier(
    doc !== undefined && !doc.fileUrl.includes("identité") && !doc.fileUrl.includes("piece"),
    "le nom du fichier sur disque est tire au sort",
    doc?.fileUrl
  );
  verifier(
    doc?.originalName?.includes("identité"),
    "le nom d'origine est conserve pour l'affichage seulement"
  );

  await ctx.close();
}

// ═══════════ 4. La piece n'est PAS atteignable sans autorisation
{
  const doc = lire(
    `SELECT d.id, d.fileUrl FROM KycDocument d JOIN SellerProfile s ON s.id = d.sellerId
       JOIN User u ON u.id = s.userId WHERE u.email = ? ORDER BY d.createdAt DESC LIMIT 1`,
    "vendeur@koli.ci"
  )[0];

  if (!doc) {
    verifier(false, "une piece existe pour eprouver les acces");
  } else {
    // a) Visiteur anonyme.
    const anonyme = await navigateur.newContext();
    const r1 = await anonyme.request.get(`${BASE}/api/kyc/${doc.id}`);
    verifier(
      r1.status() === 401 || r1.status() === 404,
      "un visiteur anonyme n'obtient pas la piece",
      String(r1.status())
    );
    await anonyme.close();

    // b) Un autre vendeur connecte.
    const autre = await navigateur.newContext();
    const pa = await autre.newPage();
    await connecter(pa, "client@koli.ci");
    const r2 = await pa.request.get(`${BASE}/api/kyc/${doc.id}`);
    verifier(
      r2.status() === 404,
      "un autre compte n'obtient pas la piece — et n'apprend pas qu'elle existe",
      String(r2.status())
    );
    await autre.close();

    // c) Le fichier n'est pas servi depuis public/.
    const anonyme2 = await navigateur.newContext();
    const r3 = await anonyme2.request.get(`${BASE}/${doc.fileUrl}`);
    const r4 = await anonyme2.request.get(`${BASE}/.donnees/kyc/${doc.fileUrl}`);
    verifier(
      r3.status() === 404 && r4.status() === 404,
      "le fichier n'est atteignable par aucune adresse directe",
      `${r3.status()} / ${r4.status()}`
    );
    await anonyme2.close();

    // d) Le proprietaire, lui, l'obtient — avec les bons en-tetes.
    const sien = await navigateur.newContext();
    const ps = await sien.newPage();
    await connecter(ps, "vendeur@koli.ci");
    const r5 = await ps.request.get(`${BASE}/api/kyc/${doc.id}`);

    verifier(r5.status() === 200, "le proprietaire obtient sa piece", String(r5.status()));

    const entetes = r5.headers();
    verifier(
      entetes["content-type"]?.startsWith("image/jpeg"),
      "le type servi est celui reconnu a l'envoi",
      entetes["content-type"]
    );
    verifier(
      entetes["x-content-type-options"] === "nosniff",
      "le navigateur ne peut pas redeviner le type (nosniff)"
    );
    verifier(
      /attachment/.test(entetes["content-disposition"] ?? ""),
      "la piece est proposee en telechargement, jamais affichee",
      entetes["content-disposition"]
    );
    verifier(
      /no-store/.test(entetes["cache-control"] ?? ""),
      "aucun cache partage ne peut la conserver",
      entetes["cache-control"]
    );

    // e) Un identifiant fabrique ne dit rien.
    const r6 = await ps.request.get(`${BASE}/api/kyc/cmt00000000000000000000`);
    verifier(r6.status() === 404, "un identifiant inconnu rend 404, sans indice");

    await sien.close();
  }
}

// ═══════════ 5. L'administration examine, et doit motiver un refus
{
  const ctx = await navigateur.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await connecter(page, "admin@koli.ci");

  await page.goto(`${BASE}/admin/verifications`, { waitUntil: "networkidle" });
  verifier(
    new URL(page.url()).pathname === "/admin/verifications",
    "la file d'attente est accessible a l'administration"
  );

  const examiner = page.getByRole("link", { name: /Examiner/i }).filter({ visible: true }).first();
  verifier((await examiner.count()) > 0, "un dossier attend un examen");

  if (await examiner.count()) {
    await examiner.click();
    await page.waitForTimeout(1500);

    const texte = await page.evaluate(() => document.body.innerText);
    verifier(
      /Koné Awa Marie/.test(texte),
      "le dossier montre le nom legal declare"
    );

    // Refus sans motif : doit etre bloque.
    await bouton(page, /^Refuser$/).click();
    await page.waitForTimeout(600);
    const motif = page.locator('textarea[name="motif"]').first();
    verifier(
      (await motif.count()) > 0,
      "refuser demande un motif : sans lui, le vendeur n'a rien a corriger"
    );

    await motif.fill("La photo est floue, le numéro n'est pas lisible.");
    await bouton(page, /Confirmer le refus/i).click();
    await page.waitForTimeout(3000);

    const doc = lire(
      `SELECT d.status, d.rejectionReason, d.reviewedById FROM KycDocument d
         JOIN SellerProfile s ON s.id = d.sellerId JOIN User u ON u.id = s.userId
        WHERE u.email = ? ORDER BY d.createdAt DESC LIMIT 1`,
      "vendeur@koli.ci"
    )[0];

    verifier(doc?.status === "REJECTED", "la piece est refusee", doc?.status);
    verifier(
      (doc?.rejectionReason ?? "").includes("floue"),
      "le motif est conserve"
    );
    verifier(doc?.reviewedById != null, "l'examinateur est identifie");

    // §48 : la decision figure au journal d'audit.
    const trace = lire(
      "SELECT * FROM AuditLog WHERE action = ? ORDER BY createdAt DESC LIMIT 1",
      "KYC_DOCUMENT_REVIEWED"
    )[0];
    verifier(trace !== undefined, "la decision est consignee au journal (§48)");
    verifier(
      trace?.actorName != null,
      "le journal nomme l'auteur de la decision"
    );
  }

  await ctx.close();
}

// ═══════════ 6. Le vendeur voit le motif, a l'endroit ou il sert
{
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");
  await page.goto(`${BASE}/vendeur/verification`, { waitUntil: "networkidle" });

  const texte = await page.evaluate(() => document.body.innerText);
  verifier(/floue/i.test(texte), "le vendeur lit le motif du refus");
  verifier(
    /Remplacer le fichier/i.test(texte),
    "il peut renvoyer une piece corrigee"
  );

  await ctx.close();
}

// ═══════════ 7. Un vendeur n'accede pas a la console d'examen
{
  const ctx = await navigateur.newContext();
  const page = await ctx.newPage();
  await connecter(page, "vendeur@koli.ci");
  await page.goto(`${BASE}/admin/verifications`, { waitUntil: "networkidle" });
  verifier(
    new URL(page.url()).pathname !== "/admin/verifications",
    "un vendeur n'accede pas a la console d'examen",
    new URL(page.url()).pathname
  );
  await ctx.close();
}

await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "Les pieces se deposent, s'examinent, et ne fuient pas."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
