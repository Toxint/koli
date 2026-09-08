import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifierSignatureResend } from "@/lib/notifications/signature-resend";

/**
 * Ce que devient un courriel APRÈS qu'on l'a confié.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Le `200` de Resend veut dire « accepté », pas « arrivé ». Le rebond se  │
 * │  produit ensuite, chez le serveur d'en face, et n'arrive que par ici.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Sans cette route, `sentAt` était le dernier mot : une adresse morte
 * recevait un courriel à chaque vente, indéfiniment, et chaque rebond abîmait
 * la réputation du domaine — celle qui décide si les VRAIS vendeurs trouvent
 * le message dans leur boîte plutôt que dans les indésirables.
 *
 * Un expéditeur neuf n'a droit qu'à peu d'erreurs. Les dépenser en écrivant à
 * quelqu'un qui n'existe plus serait dommage.
 *
 * ── La différence avec le rappel d'iKeePay ─────────────────────────────────
 *
 * **Resend SIGNE.** Là où l'agrégateur de paiement n'offre rien et nous oblige
 * à un jeton dans l'URL — qui prouve seulement que l'appelant connaît un
 * secret —, ici la signature prouve que le corps vient d'eux et n'a pas été
 * modifié. Le raisonnement complet est dans `signature-resend.ts`.
 *
 * ── Ce qu'on répond, et pourquoi ───────────────────────────────────────────
 *
 * **200 dès que la signature est bonne**, même si la ligne est introuvable ou
 * si l'événement ne nous intéresse pas. Un 4xx ferait rejouer Svix pendant des
 * jours pour un message qu'on ne veut de toute façon pas traiter.
 *
 * **401 si la signature est mauvaise**, et là c'est net : ce n'est pas un
 * rappel, c'est quelqu'un d'autre. Rien n'est lu, rien n'est écrit.
 *
 * ⚠ Contrairement au rappel de paiement, la réponse n'a pas à être opaque. Là
 * bas, dire « cette référence est inconnue » apprendrait à qui sonde l'adresse
 * quelles commandes existent. Ici l'appelant est déjà authentifié par sa
 * signature : il ne peut rien apprendre qu'il ne sache déjà.
 */

/** Le corps doit être lu BRUT : la signature porte sur les octets reçus. */
export const dynamic = "force-dynamic";

/**
 * Un rebond DÉFINITIF ferme l'adresse ; un rebond passager ne ferme rien.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Confondre les deux coûterait l'adresse d'un vrai vendeur pour une       │
 * │  boîte momentanément pleine.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Resend reprend le vocabulaire de SES : `Permanent` (l'adresse n'existe pas,
 * le domaine non plus, la boîte est fermée), `Transient` (pleine, serveur
 * indisponible, message trop gros), `Undetermined`.
 *
 * Seul `Permanent` ferme. `Undetermined` ne ferme pas : le défaut penche du
 * côté qui n'empêche personne d'être prévenu de sa vente.
 */
function estDefinitif(type: unknown): boolean {
  return String(type ?? "").toLowerCase() === "permanent";
}

interface EvenementResend {
  type?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { type?: string; subType?: string; message?: string };
  };
}

export async function POST(requete: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();

  /*
   * Sans secret, on REFUSE — on ne fait pas confiance « en attendant ».
   *
   * Accepter un corps non vérifié laisserait n'importe qui fermer l'adresse
   * courriel de n'importe quel compte : il suffirait de poster un faux rebond.
   * C'est une porte de désabonnement forcé pour toute la plateforme.
   */
  if (!secret) {
    return NextResponse.json({ recu: false }, { status: 401 });
  }

  // BRUT, avant tout JSON.parse : re-sérialiser invaliderait une signature
  // pourtant correcte.
  const corps = await requete.text();

  const verdict = verifierSignatureResend(corps, {
    id: requete.headers.get("svix-id"),
    horodatage: requete.headers.get("svix-timestamp"),
    signature: requete.headers.get("svix-signature"),
  }, secret);

  if (!verdict.valide) {
    return NextResponse.json({ recu: false }, { status: 401 });
  }

  let evenement: EvenementResend;
  try {
    evenement = JSON.parse(corps) as EvenementResend;
  } catch {
    // Signé mais illisible : on ne le redemande pas, il ne s'améliorera pas.
    return NextResponse.json({ recu: true, traite: false });
  }

  const identifiant = evenement.data?.email_id?.trim();
  if (!identifiant) return NextResponse.json({ recu: true, traite: false });

  /*
   * On retrouve la notification par l'identifiant que Resend nous avait rendu
   * à l'envoi. Sans lui — c'est-à-dire pour tout courriel parti avant que
   * cette route existe — on ne peut rattacher le rebond à rien.
   */
  const notification = await prisma.notification.findUnique({
    where: { providerMessageId: identifiant },
    select: { id: true, userId: true },
  });

  const type = evenement.type ?? "";

  try {
    if (type === "email.delivered" && notification) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: { deliveredAt: new Date(), sendError: null },
      });
      return NextResponse.json({ recu: true, traite: true });
    }

    if (type === "email.bounced" || type === "email.complained") {
      const rebond = evenement.data?.bounce;
      /*
       * Une PLAINTE ferme toujours.
       *
       * Quelqu'un a marqué le message comme indésirable. Continuer à écrire
       * après cela n'est pas seulement inutile : c'est ce qui fait classer un
       * domaine entier comme indésirable.
       */
      const ferme = type === "email.complained" || estDefinitif(rebond?.type);

      const motif =
        type === "email.complained"
          ? "signale comme indesirable"
          : `rebond ${rebond?.type ?? "?"} — ${(rebond?.message ?? "sans detail").slice(0, 140)}`;

      if (notification) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { sendError: motif.slice(0, 200) },
        });
      }

      if (ferme) {
        /*
         * On ferme le COMPTE destinataire, pas l'adresse du message.
         *
         * `data.to` vient du corps ; le compte, lui, vient de notre propre
         * registre. Se fier au corps permettrait de fermer l'adresse d'un
         * tiers en la glissant dans un rappel — signé, mais forgé quant à son
         * contenu si Resend acceptait un jour un envoi vers n'importe qui.
         */
        const destinataire = notification?.userId;
        if (destinataire) {
          await prisma.user.update({
            where: { id: destinataire },
            data: {
              emailBouncedAt: new Date(),
              emailBounceReason: motif.slice(0, 200),
            },
          });
        }
      }

      return NextResponse.json({ recu: true, traite: true, ferme });
    }
  } catch {
    /*
     * Une panne d'écriture ne change pas la réponse.
     *
     * Rejouer ne réparerait pas une base indisponible, et Svix insisterait
     * pendant des jours. Le courriel, lui, est déjà parti ou déjà rebondi :
     * rien de ce qui suit ne dépend de cette écriture.
     */
    return NextResponse.json({ recu: true, traite: false });
  }

  // `email.sent`, `email.opened`, `email.clicked`, `email.delivery_delayed` :
  // reçus poliment, sans rien faire. Les ouvertures et les clics ne nous
  // regardent pas — KOLI n'a pas à savoir qui a lu quoi.
  return NextResponse.json({ recu: true, traite: false });
}
