/**
 * Que devient un courriel APRÈS qu'on l'a confié ?
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Le `200` de Resend veut dire « accepté », pas « arrivé ». Le rebond se  │
 * │  produit ensuite, et n'arrive que par leur rappel.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce contrôle éprouve la porte `/api/courriels/resend` contre la VRAIE base et
 * le VRAI serveur, avec de vraies signatures — parce que la moitié de ce qui
 * compte ici est un refus, et qu'un refus ne se vérifie pas en lisant du code.
 *
 * Ce qu'il protège, dit simplement : **un rappel accepté sans preuve d'origine
 * permettrait à quiconque de fermer l'adresse courriel de n'importe quel
 * compte.** C'est une porte de désabonnement forcé pour toute la plateforme.
 *
 * ⚠ Il pose sa propre fixture et l'efface. La note du ménage se fait AVANT les
 * insertions : notée après, un échec sur la seconde laisserait un compte
 * orphelin que le nettoyage ignorerait — c'est arrivé sur `verif:rappel`.
 *
 * Usage : node scripts/test-rebonds-courriel.mjs
 */

import { createHmac, randomBytes } from "node:crypto";
import { chargerEnv } from "./env.mjs";
import { lire, ecrire, fermer } from "./base-donnees.mjs";

chargerEnv(".env.local", ".env");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.RESEND_WEBHOOK_SECRET?.trim();
const ADRESSE = `${BASE}/api/courriels/resend`;

let echecs = 0;
const verifier = (ok, quoi, detail = "") => {
  if (!ok) echecs++;
  console.log(`  ${ok ? "✓" : "✗"} ${quoi}${detail ? ` — ${detail}` : ""}`);
};

console.log(`\n=== REBONDS ET PLAINTES (${BASE}) ===\n`);

if (!SECRET) {
  console.log("  ✗ RESEND_WEBHOOK_SECRET absent : ce controle ne peut pas s'exercer.");
  console.log("    Il le DIT au lieu de passer au vert en n'eprouvant rien.\n");
  process.exit(1);
}

/** Les en-têtes qu'enverrait Svix pour ce corps. */
function signer(corps, { secret = SECRET, decalageS = 0 } = {}) {
  const id = `msg_${randomBytes(6).toString("hex")}`;
  const horodatage = String(Math.floor(Date.now() / 1000) + decalageS);
  const clef = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = createHmac("sha256", clef)
    .update(`${id}.${horodatage}.${corps}`)
    .digest("base64");
  return {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": horodatage,
    "svix-signature": `v1,${signature}`,
  };
}

const poster = (corps, entetes) =>
  fetch(ADRESSE, { method: "POST", headers: entetes, body: corps });

const evenement = (type, emailId, bounce) =>
  JSON.stringify({ type, created_at: new Date().toISOString(), data: { email_id: emailId, ...(bounce ? { bounce } : {}) } });

// ── La fixture : un compte et ses notifications ────────────────────────────
const marque = randomBytes(5).toString("hex");
const compte = `essai-rebond-${marque}`;
const idsCourriel = {
  dur: `msg-dur-${marque}`,
  passager: `msg-passager-${marque}`,
  remis: `msg-remis-${marque}`,
  plainte: `msg-plainte-${marque}`,
};

// Notee AVANT les insertions.
const aNettoyer = { compte, notifications: Object.values(idsCourriel) };

try {
  await ecrire(
    `INSERT INTO "User" ("id","email","phone","name","passwordHash","role","status","createdAt","updatedAt")
     VALUES ($1,$2,$3,'Essai Rebond','$2a$10$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','SELLER','ACTIVE',now(),now())`,
    compte,
    `${compte}@premiummarketafrica.com`,
    `+22509${marque.slice(0, 6)}`
  );

  for (const [nom, identifiant] of Object.entries(idsCourriel)) {
    await ecrire(
      `INSERT INTO "Notification" ("id","userId","type","entityType","entityId","providerMessageId","sentAt","createdAt")
       VALUES ($1,$2,'FUNDS_SECURED','Order','KOLI-ESSAIREB',$3,now(),now())`,
      `notif-${nom}-${marque}`,
      compte,
      identifiant
    );
  }

  const etatCompte = async () => {
    const r = await lire(
      `SELECT "emailBouncedAt", "emailBounceReason" FROM "User" WHERE "id" = $1`,
      compte
    );
    return r[0] ?? {};
  };
  const etatNotif = async (nom) => {
    const r = await lire(
      `SELECT "sendError", "deliveredAt" FROM "Notification" WHERE "id" = $1`,
      `notif-${nom}-${marque}`
    );
    return r[0] ?? {};
  };

  // ── 1. Un rappel NON SIGNÉ ne peut rien fermer ──────────────────────────
  {
    const corps = evenement("email.bounced", idsCourriel.dur, {
      type: "Permanent",
      message: "forge",
    });
    const r = await poster(corps, { "content-type": "application/json" });
    verifier(r.status === 401, "un rappel sans signature est refuse", `HTTP ${r.status}`);
    verifier(
      (await etatCompte()).emailBouncedAt === null,
      "et il n'a RIEN ferme"
    );
  }

  // ── 2. Une signature forgée non plus ────────────────────────────────────
  {
    const corps = evenement("email.bounced", idsCourriel.dur, { type: "Permanent" });
    const entetes = signer(corps, {
      secret: "whsec_" + Buffer.from("le mauvais secret").toString("base64"),
    });
    const r = await poster(corps, entetes);
    verifier(r.status === 401, "une signature forgee est refusee", `HTTP ${r.status}`);
    verifier((await etatCompte()).emailBouncedAt === null, "et elle non plus n'a rien ferme");
  }

  // ── 3. Un corps MODIFIÉ après signature ─────────────────────────────────
  {
    const corps = evenement("email.bounced", idsCourriel.dur, { type: "Permanent" });
    const entetes = signer(corps);
    const modifie = evenement("email.bounced", idsCourriel.plainte, { type: "Permanent" });
    const r = await poster(modifie, entetes);
    verifier(r.status === 401, "un corps modifie apres signature est refuse", `HTTP ${r.status}`);
  }

  // ── 4. Un rappel REJOUÉ, avec sa vraie signature ────────────────────────
  {
    const corps = evenement("email.bounced", idsCourriel.dur, { type: "Permanent" });
    const entetes = signer(corps, { decalageS: -3600 });
    const r = await poster(corps, entetes);
    verifier(r.status === 401, "un rappel vieux d'une heure est refuse", `HTTP ${r.status}`);
    verifier((await etatCompte()).emailBouncedAt === null, "le rejeu ne ferme rien");
  }

  // ── 5. Un rebond PASSAGER ne ferme PAS l'adresse ────────────────────────
  {
    const corps = evenement("email.bounced", idsCourriel.passager, {
      type: "Transient",
      message: "Mailbox full",
    });
    const r = await poster(corps, signer(corps));
    verifier(r.ok, "un rebond passager est accepte", `HTTP ${r.status}`);
    verifier(
      (await etatCompte()).emailBouncedAt === null,
      "une boite PLEINE ne ferme pas l'adresse — c'est le moment qui ne va pas, pas l'adresse"
    );
    verifier(
      /Transient/i.test((await etatNotif("passager")).sendError ?? ""),
      "mais le registre le note",
      (await etatNotif("passager")).sendError ?? ""
    );
  }

  // ── 6. Une REMISE confirmée ─────────────────────────────────────────────
  {
    const corps = evenement("email.delivered", idsCourriel.remis);
    const r = await poster(corps, signer(corps));
    verifier(r.ok, "une remise confirmee est acceptee", `HTTP ${r.status}`);
    verifier(
      (await etatNotif("remis")).deliveredAt !== null,
      "et la date de remise est consignee"
    );
  }

  // ── 7. Un rebond DÉFINITIF ferme l'adresse ──────────────────────────────
  {
    const corps = evenement("email.bounced", idsCourriel.dur, {
      type: "Permanent",
      message: "Recipient address does not exist",
    });
    const r = await poster(corps, signer(corps));
    verifier(r.ok, "un rebond definitif est accepte", `HTTP ${r.status}`);

    const c = await etatCompte();
    verifier(c.emailBouncedAt !== null, "et il FERME l'adresse");
    verifier(
      /does not exist/i.test(c.emailBounceReason ?? ""),
      "en gardant ce que le serveur d'en face a repondu",
      (c.emailBounceReason ?? "").slice(0, 50)
    );
  }

  // ── 8. Le dispatcher n'ecrit plus a cette adresse ───────────────────────
  {
    await ecrire(
      `INSERT INTO "Notification" ("id","userId","type","entityType","entityId","createdAt")
       VALUES ($1,$2,'FUNDS_SECURED','Order','KOLI-ESSAIREB',now())`,
      `notif-apres-${marque}`,
      compte
    );
    aNettoyer.notifications.push("apres");

    const secretCron = process.env.CRON_SECRET?.trim();
    await fetch(`${BASE}/api/paiements/rapprochement`, {
      headers: { Authorization: `Bearer ${secretCron}` },
    });

    const r = await lire(
      `SELECT "sendError", "sentAt" IS NOT NULL AS traitee FROM "Notification" WHERE "id" = $1`,
      `notif-apres-${marque}`
    );
    const apres = r[0] ?? {};
    verifier(
      apres.sendError === "adresse fermee apres rebond",
      "une notification NEUVE pour cette adresse n'est plus expediee",
      apres.sendError ?? "(rien)"
    );
    verifier(apres.traitee === true, "elle est marquee, pour ne pas bloquer la file");
  }
} finally {
  // ── Ménage ────────────────────────────────────────────────────────────────
  await ecrire(`DELETE FROM "Notification" WHERE "userId" = $1`, aNettoyer.compte);
  await ecrire(`DELETE FROM "User" WHERE "id" = $1`, aNettoyer.compte);
  await fermer();
}

console.log("");
console.log(
  echecs === 0
    ? "Un rebond definitif ferme l'adresse, un rebond passager non, et rien ne passe sans signature.\n"
    : `${echecs} probleme(s).\n`
);
process.exit(echecs > 0 ? 1 : 0);
