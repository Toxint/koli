/**
 * Connexion Google, parcours COMPLET, dans un vrai navigateur.
 *
 * Les identifiants Google ne peuvent etre crees que depuis un compte Google.
 * Pour autant, tout ce que KOLI ecrit doit pouvoir etre eprouve : ce test
 * branche l'application sur un fournisseur OpenID local
 * (`scripts/faux-google.mjs`) qui parle le vrai protocole et refuse ce que
 * Google refuserait — PKCE verifie, code a usage unique, redirect_uri
 * comparee a l'aller.
 *
 * Ce qui est prouve ici : le depart, la poignee de main, l'echange du code, la
 * lecture du jeton d'identite, la creation du compte, le rattachement d'un
 * compte existant, le refus d'un compte suspendu, et la session ouverte au
 * bout. Ce qui ne l'est pas : les serveurs de Google eux-memes.
 *
 * Usage (le serveur doit tourner en mode developpement, voir la garde
 * NODE_ENV dans lib/auth/google.ts) :
 *   BASE_URL=http://127.0.0.1:3000 node scripts/test-google-bout-en-bout.mjs
 */

import { chromium } from "playwright";
import { lireUne, ecrire } from "./base-donnees.mjs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const marque = Date.now().toString().slice(-7);

/**
 * Lit ou fixe l'etat du compte vendeur de demonstration.
 *
 * Ecriture directe en base plutot que passage par la console
 * d'administration : ce test porte sur la connexion Google, et le faire
 * dependre d'un ecran sans rapport le rendait fragile.
 */
async function etatDuVendeur(nouveau) {
  if (nouveau) {
    await ecrire(
      'UPDATE "User" SET status = ? WHERE email = ?',
      nouveau,
      "vendeur@koli.ci"
    );
  }
  return (
    await lireUne('SELECT status FROM "User" WHERE email = ?', "vendeur@koli.ci")
  )?.status;
}

console.log(`\n=== CONNEXION GOOGLE, BOUT EN BOUT depuis ${BASE} ===\n`);

const navigateur = await chromium.launch();
let echecs = 0;
const verifier = (ok, libelle, detail = "") => {
  if (ok) console.log(`  ${ok ? "✓" : "✗"} ${libelle}`);
  else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ""}`);
  }
};

const bouton = (page, libelle) =>
  page.getByRole("button", { name: libelle }).filter({ visible: true }).first();

const FOURNISSEUR = process.env.FAUX_GOOGLE ?? "http://127.0.0.1:4545";

/**
 * Parcourt la connexion Google du clic jusqu'au retour.
 *
 * Le compte Google que l'utilisateur choisirait a l'ecran est annonce a
 * l'avance au faux fournisseur : c'est ce qui permet de rejouer plusieurs cas
 * sans intervention humaine. Le reste — depart, PKCE, retour, echange — suit
 * exactement le chemin reel.
 */
async function passerParGoogle(page, compte) {
  await page.request.post(`${FOURNISSEUR}/_scenario`, { data: compte });

  await page.goto(`${BASE}/connexion`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("link", { name: /avec Google/i })
    .filter({ visible: true })
    .first()
    .click();

  // Le fournisseur accorde puis renvoie aussitot : la navigation traverse
  // l'autorisation sans s'y arreter, comme un compte Google deja consenti.
  await page.waitForTimeout(4000);
}

// ═══════════════════════ 1. Nouveau venu : compte cree de bout en bout
{
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 160)));

  console.log("1. Un compte Google inconnu de KOLI");

  await passerParGoogle(page, {
    sub: `sub-nouveau-${marque}`,
    email: `nouveau${marque}@exemple.ci`,
    nom: "Awa Nouvelle",
  });

  const chemin = new URL(page.url()).pathname;
  verifier(
    chemin === "/inscription/google",
    "il est envoye completer son profil (§18 : KOLI exige un telephone)",
    chemin
  );

  const texte = await page.evaluate(() => document.body.innerText);
  verifier(
    texte.includes("Awa Nouvelle") && texte.includes(`nouveau${marque}@exemple.ci`),
    "son identite Google est reprise a l'ecran"
  );

  // Le telephone et le role, que Google ne fournit pas.
  await page.getByRole("radio", { name: /Vendeur/i }).first().check({ force: true });
  await page.waitForTimeout(400);
  await page.locator("#phone").fill(`+22507${marque}`);
  const boutique = page.locator("#businessName");
  if (await boutique.count()) await boutique.fill("Boutique Awa");
  await bouton(page, /Créer mon compte KOLI/i).click();
  await page.waitForTimeout(4500);

  verifier(
    new URL(page.url()).pathname === "/vendeur/dashboard",
    "le compte est cree et la session ouverte",
    new URL(page.url()).pathname
  );

  const cookies = await ctx.cookies();
  verifier(
    cookies.some((c) => c.name === "koli_session"),
    "le cookie de session est bien pose"
  );

  const tableau = await page.evaluate(() => document.body.innerText);
  verifier(tableau.length > 200, "le tableau de bord s'affiche", `${tableau.length} car.`);

  // 2e passage : le meme compte Google doit maintenant se connecter direct.
  const ctx2 = await navigateur.newContext({ viewport: { width: 390, height: 844 } });
  const page2 = await ctx2.newPage();
  await passerParGoogle(page2, {
    sub: `sub-nouveau-${marque}`,
    email: `nouveau${marque}@exemple.ci`,
    nom: "Awa Nouvelle",
  });
  verifier(
    new URL(page2.url()).pathname === "/vendeur/dashboard",
    "au retour suivant, il entre directement, sans repasser par l'inscription",
    new URL(page2.url()).pathname
  );
  await ctx2.close();

  verifier(erreurs.length === 0, "aucune erreur JavaScript", erreurs[0] ?? "");
  await ctx.close();
}

// ═══════════════════════ 2. Rattachement a un compte existant
{
  console.log("\n2. Un compte Google dont l'e-mail est deja celui d'un vendeur KOLI");
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  await passerParGoogle(page, {
    sub: `sub-rattache-${marque}`,
    email: "vendeur@koli.ci",
    nom: "Boutique Chic",
  });

  verifier(
    new URL(page.url()).pathname === "/vendeur/dashboard",
    "l'e-mail VERIFIE rattache le compte Google au compte KOLI existant",
    new URL(page.url()).pathname
  );

  const texte = await page.evaluate(() => document.body.innerText);
  verifier(
    /Boutique Chic/i.test(texte),
    "c'est bien le compte du vendeur de demonstration, pas un doublon"
  );
  await ctx.close();
}

// ═══════════════════════ 3. E-mail NON verifie : aucun rattachement
{
  console.log("\n3. Un compte Google portant l'e-mail d'un vendeur, mais NON verifie");
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // Sans cette protection, creer un compte Google a l'adresse d'un vendeur
  // suffirait a prendre sa boutique.
  await passerParGoogle(page, {
    sub: `sub-usurpateur-${marque}`,
    email: "client@koli.ci",
    verifie: false,
    nom: "Usurpateur",
  });

  const chemin = new URL(page.url()).pathname;
  verifier(
    chemin === "/inscription/google",
    "aucun rattachement : il doit creer son propre compte",
    chemin
  );

  // Et il ne peut pas non plus prendre le telephone du compte vise.
  await page.getByRole("radio", { name: /Client/i }).first().check({ force: true });
  await page.waitForTimeout(400);
  await page.locator("#phone").fill("+2250505050505"); // celui du client de demo
  await bouton(page, /Créer mon compte KOLI/i).click();
  await page.waitForTimeout(3500);

  const alerte = await page.locator('[role="alert"]').first().count();
  verifier(
    alerte > 0 && new URL(page.url()).pathname === "/inscription/google",
    "un telephone deja pris est refuse avec un message"
  );
  await ctx.close();
}

// ═══════════════════════ 4. Compte suspendu : entree refusee
{
  console.log("\n4. Un compte KOLI suspendu");
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // Suspension ecrite DIRECTEMENT en base, et non par la console
  // d'administration : ce test porte sur le refus cote Google, pas sur
  // l'interface admin — qui a son propre test. Passer par elle rendait ce cas
  // dependant d'un ecran sans rapport, et donc fragile.
  (await etatDuVendeur("SUSPENDED"));

  await passerParGoogle(page, {
    sub: `sub-rattache-${marque}`,
    email: "vendeur@koli.ci",
    nom: "Boutique Chic",
  });

  const chemin = new URL(page.url()).pathname;
  const texte = await page.evaluate(() => document.body.innerText);
  verifier(
    chemin === "/connexion" && /suspendu/i.test(texte),
    "un compte suspendu est refuse, avec le motif",
    chemin
  );
  const cookies = await ctx.cookies();
  verifier(
    !cookies.some((c) => c.name === "koli_session"),
    "aucune session n'est ouverte pour un compte suspendu"
  );

  // On le reactive, pour ne pas laisser la base de demonstration degradee.
  (await etatDuVendeur("ACTIVE"));
  verifier(
    (await etatDuVendeur()) === "ACTIVE",
    "le compte de demonstration est bien reactive apres le test"
  );
  await ctx.close();
}

await navigateur.close();

console.log("");
console.log(
  echecs === 0
    ? "La connexion Google fonctionne de bout en bout."
    : `${echecs} probleme(s).`
);
process.exit(echecs > 0 ? 1 : 0);
