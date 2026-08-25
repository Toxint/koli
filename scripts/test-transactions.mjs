/**
 * Phase 19 — Journal financier (§39-40) et commission KOLI (§41).
 *
 * Ce que ce test protège vraiment :
 *
 *  1. La commission est **prélevée**, pas seulement projetée. Le tableau de
 *     bord annonçait jusqu'ici une recette que la plateforme n'avait jamais
 *     encaissée.
 *  2. Elle est prélevée **à la libération**, jamais au paiement : une commande
 *     encore sous séquestre ne doit générer aucune ligne de commission.
 *  3. Le taux est **configurable** (§41) et **figé sur chaque écriture** :
 *     changer le taux ne réécrit aucune commission passée.
 *  4. Le solde du vendeur est **net**, et l'écran le dit.
 *  5. Un vendeur ne voit **que** son journal.
 *
 * Usage :
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-transactions.mjs
 */

import { chromium } from "playwright";
import { lire, lireUne, ecrire } from "./base-donnees.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MDP = "Password123!";

// Accès direct à la base, comme les autres scripts de vérification : on lit ce
// que l'application a RÉELLEMENT écrit, pas ce qu'elle affiche. Un écran peut
// mentir sans que la base change, et l'inverse est tout aussi possible.
const un = lireUne;
const tous = lire;

// `id` en second critère : deux lignes créées dans la même milliseconde
// rendraient l'ordre indéterminé, et le test deviendrait capricieux.
//
// C'était `rowid` du temps de SQLite. Postgres n'en a pas — la colonne
// n'existe simplement pas, et la requête échouait. `id` ne dit rien de la
// chronologie, mais ce n'est pas ce qu'on lui demande : il départage.
const tauxActif = () =>
  un(
    `SELECT id, "ratePercent" FROM "Commission" WHERE "isActive" = true
      ORDER BY "createdAt" DESC, id DESC LIMIT 1`
  );
const ecrituresDe = (orderId) =>
  tous(
    'SELECT id, type, amount, rate FROM "Transaction" WHERE "orderId" = ?',
    orderId
  );

/**
 * Attend que la BASE reflète le geste, au lieu de dormir un temps fixe.
 *
 * Les délais de ce script étaient calibrés sur un fichier SQLite local, où
 * l'écriture est visible dans la milliseconde. La base est maintenant à
 * Dublin : entre le clic et la lecture, il y a un aller-retour réseau. Les
 * contrôles lisaient donc l'état d'AVANT et annonçaient des régressions qui
 * n'existaient pas — le message d'échec affichait d'ailleurs la bonne valeur,
 * lue quelques dizaines de millisecondes plus tard.
 *
 * La valeur retenue est RENDUE, et non relue : `verifier(lire() === x, …,
 * lire())` faisait deux allers-retours et pouvait juger sur l'un et rapporter
 * l'autre.
 */
const attendreQue = async (mesure, attendu, limiteMs = 20000) => {
  const fin = Date.now() + limiteMs;
  let valeur = await mesure();
  while (Date.now() < fin) {
    if (attendu(valeur)) return valeur;
    await new Promise((r) => setTimeout(r, 250));
    valeur = await mesure();
  }
  return valeur;
};

console.log(`\n=== TRANSACTIONS & COMMISSION depuis ${BASE} ===\n`);

const navigateur = await chromium.launch();
let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ✓ ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const connecter = async (page, identifiant) => {
  await page.goto(`${BASE}/connexion`, { waitUntil: "networkidle" });
  await page.locator("#identifier").fill(identifiant);
  await page.locator("#password").fill(MDP);
  await page
    .getByRole("button", { name: /^Se connecter$/ })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 25000 })
    .catch(() => {});
  await page.waitForTimeout(600);
};

const bouton = (page, libelle) =>
  page.getByRole("button", { name: libelle }).filter({ visible: true }).first();

const texte = (page) => page.evaluate(() => document.body.innerText);

/**
 * La commande créée par ce test, pour pouvoir la retirer ensuite.
 *
 * Ce test passe une vraie commande et la fait payer : le stock du catalogue
 * est donc décompté à chaque exécution (§17). Sans restitution, il finissait
 * par tomber à zéro et faisait échouer `verif:etapes`, qui choisit un produit
 * disponible — un test qui dégrade l'environnement des autres.
 */
let aNettoyer = null;

/** Même séparateur de milliers que `formatCFA` : espace fine insécable. */
const enFCFA = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

try {
  // ═══════════ 1. Le taux est configurable depuis la console (§41)
  const ctxAdmin = await navigateur.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const admin = await ctxAdmin.newPage();
  await connecter(admin, "admin@koli.ci");

  await admin.goto(`${BASE}/admin/commissions`, { waitUntil: "networkidle" });
  verifier(
    /Commission KOLI/i.test(await texte(admin)),
    "la page de configuration de la commission existe"
  );

  const champ = admin.locator("#taux");
  verifier((await champ.count()) > 0, "le taux se règle depuis un champ");

  await champ.fill("10");
  await admin.waitForTimeout(400);
  verifier(
    /KOLI retiendrait/i.test(await texte(admin)),
    "un aperçu chiffre ce que le taux donnerait"
  );

  const avantEnregistrement = (await tous(`SELECT id FROM "Commission"`)).length;

  await bouton(admin, /Enregistrer le taux/i).click();

  const taux10 = await attendreQue(tauxActif, (t) => t?.ratePercent === 10);
  verifier(
    taux10?.ratePercent === 10,
    "le nouveau taux est enregistré",
    String(taux10?.ratePercent)
  );

  const actives = (await un(
    `SELECT COUNT(*) AS n FROM "Commission" WHERE "isActive" = true`
  )).n;
  verifier(
    actives === 1,
    "un seul taux reste actif : l'ancien est désactivé, pas écrasé",
    `${actives} ligne(s) active(s)`
  );

  const historique = (await tous(`SELECT id FROM "Commission"`)).length;
  verifier(
    historique === avantEnregistrement + 1,
    "l'ancien taux subsiste dans l'historique",
    `${avantEnregistrement} → ${historique} ligne(s)`
  );

  // Saisies refusées : une commission absurde coûterait cher à réparer.
  for (const [valeur, pourquoi] of [
    ["-5", "un taux négatif"],
    ["80", "un taux supérieur à 50 %"],
    ["abc", "une saisie non numérique"],
  ]) {
    await champ.fill(valeur);
    await bouton(admin, /Enregistrer le taux/i).click();
    await admin.waitForTimeout(1200);
    // Ici on attend qu'il NE se passe rien : il n'y a pas de conséquence à
    // guetter, seulement un état à confirmer. Une seule lecture, servant à la
    // fois au verdict et au message.
    const inchange = await tauxActif();
    verifier(
      inchange?.ratePercent === 10,
      `${pourquoi} est refusé`,
      `taux devenu ${inchange?.ratePercent}`
    );
  }

  // La virgule décimale française doit passer : c'est ce que propose le
  // clavier d'un téléphone.
  await champ.fill("4,5");
  await bouton(admin, /Enregistrer le taux/i).click();
  const taux45 = await attendreQue(tauxActif, (t) => t?.ratePercent === 4.5);
  verifier(
    taux45?.ratePercent === 4.5,
    "la virgule décimale est acceptée (4,5 %)",
    String(taux45?.ratePercent)
  );

  // ═══════════ 2. Une commande payée mais NON libérée ne coûte rien
  const ctxVendeur = await navigateur.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const vendeur = await ctxVendeur.newPage();
  await connecter(vendeur, "vendeur@koli.ci");

  // Le produit vient du catalogue réel, et son prix est lu en base : le
  // montant attendu de la commission est ainsi calculé indépendamment de
  // l'application, au lieu d'être supposé.
  const produit = (await un(
    `SELECT p.id, p.name, p.price
       FROM "Product" p
       JOIN "SellerProfile" s ON s.id = p."sellerId"
       JOIN "User" u ON u.id = s."userId"
      WHERE u.email = 'vendeur@koli.ci'
        AND p.status = 'ACTIVE' AND p.quantity > 0
      ORDER BY p.price DESC
      LIMIT 1`
  ));
  verifier(produit != null, "un produit du catalogue est disponible");
  if (!produit) throw new Error("Catalogue vide : la suite est sans objet.");

  await vendeur.goto(`${BASE}/vendeur/commandes/nouvelle`, {
    waitUntil: "networkidle",
  });

  // On attend l'ETAPE SUIVANTE, pas 700 ms. Ce délai valait pour une base
  // locale ; il expirait avant que l'assistant n'ait affiché le champ suivant,
  // et la saisie partait dans le vide — la commande n'était alors jamais créée.
  const continuer = async (champSuivant) => {
    await bouton(vendeur, /Continuer/i).click();
    await vendeur
      .locator(champSuivant)
      .first()
      .waitFor({ state: "visible", timeout: 30000 })
      .catch(() => {});
  };

  await vendeur.locator("#productId").selectOption(produit.id);
  await vendeur.locator("#quantity").fill("1");
  await continuer("#buyerName");

  await vendeur.locator("#buyerName").fill("Awa Koné");
  await vendeur.locator("#buyerPhone").fill("+2250505050505");
  await vendeur.locator("#buyerCity").fill("Abidjan");
  await vendeur.locator("#buyerAddress").fill("Cocody 2 Plateaux");
  await continuer("#deliveryFee");

  await vendeur.locator("#deliveryFee").fill("1500");
  await continuer('button:has-text("Créer la commande")');

  await bouton(vendeur, /Créer la commande/i).click();

  // La commande est identifiee par SA reference, lue a l'ecran — et non par
  // « la plus recente au nom d'Awa Koné ». Le jeu de donnees en contient une
  // qui porte ce nom : le jour ou la creation echouait, le test se saisissait
  // de celle-la et rapportait un statut inattendu au lieu de dire ce qui
  // s'etait reellement passe — la commande n'avait pas ete creee.
  await vendeur
    .waitForFunction(() => /KOLI-[2-9A-Z]{8}/.test(document.body.innerText), {
      timeout: 30000,
    })
    .catch(() => {});

  const affichee = (await vendeur.evaluate(() => document.body.innerText)).match(
    /KOLI-[2-9A-Z]{8}/
  )?.[0];

  verifier(affichee != null, "la commande de test est creee et sa reference affichee");
  if (!affichee) throw new Error("Aucune reference a l'ecran : la suite est sans objet.");

  const commande = await attendreQue(
    () =>
      un(
        `SELECT o.id, o.reference, o."sellerId", o.status
           FROM "Order" o WHERE o.reference = ?`,
        affichee
      ),
    (o) => o != null
  );
  verifier(
    commande?.status === "PAYMENT_PENDING",
    "elle attend son paiement",
    commande?.status ?? "introuvable en base"
  );

  if (!commande) throw new Error("Commande introuvable en base : la suite est sans objet.");

  // Retenu dès maintenant : si la suite échoue, le nettoyage doit quand même
  // rendre l'article au catalogue.
  aNettoyer = { orderId: commande.id, produitId: produit.id, quantite: 1 };

  const reference = commande.reference;
  // Assiette de la commission : le prix des articles, hors frais de livraison.
  const assiette = produit.price;
  const commissionAttendue = Math.floor((assiette * 4.5) / 100);

  // Paiement.
  const ctxClient = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
  });
  const client = await ctxClient.newPage();
  await connecter(client, "client@koli.ci");
  await client.goto(`${BASE}/pay/${reference}`, { waitUntil: "networkidle" });
  await bouton(client, /Simuler un paiement/i).click();

  const apresPaiement = await attendreQue(
    () => ecrituresDe(commande.id),
    (ecritures) =>
      ecritures.some((t) => t.type === "PAYMENT") &&
      ecritures.some((t) => t.type === "FUNDS_SECURED")
  );
  verifier(
    apresPaiement.some((t) => t.type === "PAYMENT") &&
      apresPaiement.some((t) => t.type === "FUNDS_SECURED"),
    "le paiement inscrit PAYMENT et FUNDS_SECURED au journal (§40)",
    apresPaiement.map((t) => t.type).join(", ")
  );
  verifier(
    !apresPaiement.some((t) => t.type === "COMMISSION"),
    "AUCUNE commission au paiement : l'argent n'a pas encore été versé",
    apresPaiement.map((t) => t.type).join(", ")
  );

  // ═══════════ 3. Livraison puis confirmation : la commission tombe
  // L'OTP est rattaché à la LIVRAISON, pas à la commande (§27) : il faut
  // passer par Delivery. `consumedAt IS NULL` = code non encore utilisé.
  const otp = (await un(
    `SELECT o.code
       FROM "OtpCode" o
       JOIN "Delivery" d ON d.id = o."deliveryId"
      WHERE d."orderId" = ? AND o."consumedAt" IS NULL
      ORDER BY o."createdAt" DESC
      LIMIT 1`,
    commande.id
  ));
  const livreur1 = (await un(`SELECT id FROM "DriverProfile" LIMIT 1`));

  (await ecrire(
    `UPDATE "Delivery" SET "driverId" = ?, status = 'ASSIGNED' WHERE "orderId" = ?`,
    livreur1.id,
    commande.id
  ));

  const ctxLivreur = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
  });
  const livreur = await ctxLivreur.newPage();
  await connecter(livreur, "livreur@koli.ci");
  await livreur.goto(`${BASE}/livreur/dashboard`, { waitUntil: "networkidle" });

  const valider = bouton(livreur, /Valider la remise|Valider|Confirmer/i);
  if (await valider.count()) {
    await valider.click();
    await livreur.waitForTimeout(800);
    const champOtp = livreur.locator('input[name="otp"], #otp').first();
    if ((await champOtp.count()) && otp) {
      await champOtp.fill(otp.code);
      await bouton(livreur, /Valider/i).click();
      await livreur.waitForTimeout(2500);
    }
  }

  // Filet : le sujet de CE test est la commission, pas le parcours livreur —
  // déjà couvert par verif:parcours. Si la remise n'a pas abouti, on pose
  // l'état pour que la vérification du prélèvement reste possible, et on le
  // dit explicitement plutôt que de laisser croire à un parcours complet.
  const avantConfirmation = (await un(
    'SELECT status FROM "Order" WHERE id = ?',
    commande.id
  ));
  if (avantConfirmation.status !== "DELIVERED") {
    await ecrire(
      `UPDATE "Order" SET status = 'DELIVERED' WHERE id = ?`,
      commande.id
    );
    console.log(
      `    (état DELIVERED posé directement — le parcours livreur s'est arrêté à ${avantConfirmation.status})`
    );
  }

  await client.goto(`${BASE}/pay/${reference}`, { waitUntil: "networkidle" });
  const confirmer = bouton(client, /reçu ma commande|Confirmer la réception/i);
  verifier(
    (await confirmer.count()) > 0,
    "le client est invité à confirmer la réception"
  );
  if (await confirmer.count()) {
    await confirmer.click();
  }

  const apresLiberation = await attendreQue(
    () => ecrituresDe(commande.id),
    (ecritures) => ecritures.some((t) => t.type === "FUNDS_RELEASED")
  );
  const ligneCommission = apresLiberation.find((t) => t.type === "COMMISSION");

  verifier(
    apresLiberation.some((t) => t.type === "FUNDS_RELEASED"),
    "les fonds sont libérés",
    apresLiberation.map((t) => t.type).join(", ")
  );
  verifier(
    ligneCommission != null,
    "une commission est PRÉLEVÉE à la libération (§41)"
  );
  verifier(
    ligneCommission?.amount === -commissionAttendue,
    `la commission est un débit de ${commissionAttendue} FCFA (4,5 % de ${assiette})`,
    String(ligneCommission?.amount)
  );
  verifier(
    ligneCommission?.rate === 4.5,
    "le taux appliqué est figé sur l'écriture",
    String(ligneCommission?.rate)
  );

  // ═══════════ 4. Changer le taux ne réécrit pas le passé
  if (ligneCommission) {
    await admin.goto(`${BASE}/admin/commissions`, { waitUntil: "networkidle" });
    await admin.locator("#taux").fill("12");
    await bouton(admin, /Enregistrer le taux/i).click();
    const taux12 = await attendreQue(tauxActif, (t) => t?.ratePercent === 12);

    verifier(
      taux12?.ratePercent === 12,
      "le taux a bien changé pour l'avenir",
      String(taux12?.ratePercent)
    );

    const inchangee = (await un(
      'SELECT amount, rate FROM "Transaction" WHERE id = ?',
      ligneCommission.id
    ));
    verifier(
      inchangee.amount === -commissionAttendue && inchangee.rate === 4.5,
      "changer le taux ne réécrit AUCUNE commission déjà prélevée",
      `${inchangee.amount} FCFA à ${inchangee.rate} %`
    );
  }

  // ═══════════ 5. Le solde du vendeur est net, et l'écran le dit
  await vendeur.goto(`${BASE}/vendeur/solde`, { waitUntil: "networkidle" });
  const pageSolde = await texte(vendeur);
  verifier(
    /commission KOLI/i.test(pageSolde),
    "la page Solde explique la retenue plutôt que d'amputer sans un mot"
  );

  const libere = (await un(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM "Fund" WHERE "sellerId" = ? AND released = true`,
    commande.sellerId
  )).s;
  const retenu = (await un(
    `SELECT COALESCE(SUM(t.amount), 0) AS s
       FROM "Transaction" t
       JOIN "Order" o ON o.id = t."orderId"
      WHERE t.type = 'COMMISSION' AND o."sellerId" = ?`,
    commande.sellerId
  )).s;
  const attendu = libere - Math.abs(retenu);

  verifier(
    pageSolde.includes(enFCFA(attendu)),
    "le solde affiché est net de commission",
    `attendu ${enFCFA(attendu)} (libéré ${libere}, retenu ${Math.abs(retenu)})`
  );

  // ═══════════ 6. Le journal est lisible, et cloisonné
  await vendeur.goto(`${BASE}/vendeur/transactions`, {
    waitUntil: "networkidle",
  });
  const journalVendeur = await texte(vendeur);
  verifier(
    journalVendeur.includes(reference),
    "le journal du vendeur montre ses écritures (§40)"
  );
  verifier(
    /Commission KOLI/i.test(journalVendeur),
    "la commission y figure explicitement"
  );
  // Les montants portent une espace fine insécable (U+202F) comme séparateur
  // de milliers : sans normalisation, « 1 125 » ne correspond jamais à
  // « 1 125 » et le test échouerait pour une raison typographique.
  const normaliser = (t) => t.replace(/\s+/g, " ");
  const montantsSignes =
    normaliser(journalVendeur).match(/[−+] [\d ]+FCFA/g) ?? [];
  verifier(
    montantsSignes.includes(`− ${normaliser(enFCFA(commissionAttendue))} FCFA`),
    "elle est présentée comme un débit, signe compris",
    montantsSignes.join(" | ") || "aucun montant signé"
  );

  const concurrent = (await un(
    `SELECT o.reference
       FROM "Order" o
      WHERE o."sellerId" <> ?
      LIMIT 1`,
    commande.sellerId
  ));
  // Un contrôle qui disparaît en silence se lit comme une réussite : si le jeu
  // de données ne contient qu'un vendeur, on le dit plutôt que de se taire.
  if (concurrent) {
    verifier(
      !journalVendeur.includes(concurrent.reference),
      "un vendeur ne voit PAS les écritures d'un concurrent",
      concurrent.reference
    );
  } else {
    console.log(
      "  ! cloisonnement entre vendeurs NON vérifié : un seul vendeur a des commandes"
    );
  }

  // Le filtre par nature doit vraiment filtrer en base.
  await vendeur.goto(`${BASE}/vendeur/transactions?type=COMMISSION`, {
    waitUntil: "networkidle",
  });
  // On lit la LISTE, pas la page : le menu de filtrage énumère toutes les
  // natures dans ses options, et un contrôle sur `body.innerText` croirait
  // voir des écritures qui n'y sont pas.
  const naturesAffichees = await vendeur
    .locator("ul[data-journal] li")
    .evaluateAll((els) => els.map((e) => e.innerText.split("\n")[0].trim()));
  verifier(
    naturesAffichees.length > 0 &&
      naturesAffichees.every((n) => /Commission KOLI/i.test(n)),
    "le filtre par nature écarte réellement les autres écritures",
    naturesAffichees.join(" | ") || "liste vide"
  );

  // Un type fabriqué ne doit pas faire tomber la page.
  const forge = await vendeur.goto(
    `${BASE}/vendeur/transactions?type=NIMPORTE_QUOI`,
    { waitUntil: "networkidle" }
  );
  verifier(
    forge.status() === 200,
    "un type d'écriture inventé dans l'URL est ignoré, pas fatal",
    String(forge.status())
  );

  // ═══════════ 7. Le tableau de bord admin cesse de projeter
  await admin.goto(`${BASE}/admin/dashboard`, { waitUntil: "networkidle" });
  const tableauAdmin = await texte(admin);
  verifier(
    !/Projection sur les fonds/i.test(tableauAdmin),
    "le tableau de bord n'annonce plus une projection"
  );
  verifier(
    !/Aucun prélèvement n'est effectué/i.test(tableauAdmin),
    "il n'affirme plus qu'aucun prélèvement n'a lieu"
  );
  verifier(
    /Réellement prélevé/i.test(tableauAdmin),
    "il annonce ce qui a réellement été prélevé"
  );

  await admin.goto(`${BASE}/admin/transactions`, { waitUntil: "networkidle" });
  const journalAdmin = await texte(admin);
  verifier(
    journalAdmin.includes(reference),
    "le journal global existe et contient la commande"
  );
  verifier(
    /ne s'additionnent pas/i.test(journalAdmin),
    "il avertit que les totaux ne s'additionnent pas entre eux"
  );

  // ═══════════ 8. Un vendeur n'entre pas dans la console
  await vendeur.goto(`${BASE}/admin/commissions`, { waitUntil: "networkidle" });
  verifier(
    !new URL(vendeur.url()).pathname.startsWith("/admin"),
    "un vendeur ne peut pas régler la commission",
    new URL(vendeur.url()).pathname
  );
} finally {
  // Le taux est remis à 5 % : ce test le modifie, et un test qui laisse
  // l'application dans un autre état pollue les suivants.
  //
  // Les lignes créées par les exécutions précédentes sont SUPPRIMÉES plutôt
  // qu'empilées : sans cela, l'historique des taux se remplissait d'une
  // vingtaine de lignes fantômes à chaque passage.
  await ecrire(`DELETE FROM "Commission" WHERE id LIKE 'cm-verif-%'`);
  await ecrire(`UPDATE "Commission" SET "isActive" = false WHERE "isActive" = true`);

  // Le taux actif est retrouvé par `createdAt desc` : la ligne réactivée ici
  // doit donc porter une date que Postgres classe comme l'application le
  // ferait. Un horodatage ISO convient — le pilote le convertit en
  // `timestamp`, là où SQLite conservait du texte et rangeait tout entier
  // avant tout texte, ce qui avait déjà fait passer ces lignes en fin de tri.
  await ecrire(
    `INSERT INTO "Commission" (id, "ratePercent", "isActive", "createdAt")
     VALUES (?, 5, true, ?)`,
    `cm-verif-${Date.now()}`,
    new Date().toISOString()
  );

  // La commande de test est retirée et le stock rendu au catalogue.
  //
  // Sans cela, chaque exécution consommait un article (§17 : le stock est
  // décompté au paiement) et le catalogue finissait vide : `verif:etapes`,
  // qui choisit un produit disponible, échouait alors pour une raison
  // totalement étrangère à ce qu'il vérifie.
  //
  // La suppression de la commande emporte en cascade son paiement, sa facture,
  // ses écritures et son séquestre. C'est précisément le cas que la
  // numérotation des factures doit encaisser sans collision — elle part
  // désormais du plus grand numéro, plus du nombre de factures.
  if (aNettoyer) {
    (await ecrire('DELETE FROM "Order" WHERE id = ?', aNettoyer.orderId));
    (await ecrire(
      `UPDATE "Product" SET quantity = quantity + ? WHERE id = ?`,
      aNettoyer.quantite,
      aNettoyer.produitId
    ));
  }


  await navigateur.close();
}

console.log("");
console.log(
  echecs === 0
    ? "La commission est prélevée, configurable, figée sur ses écritures, et le journal est lisible."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
