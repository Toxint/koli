import { prisma } from "@/lib/db/prisma";
import {
  MESSAGES,
  SANS_COURRIEL,
  estFictive,
  type MontantsDeLaCommande,
} from "@/lib/notifications/textes";
import { commeDevise } from "@/data/markets";
import { formatMontant } from "@/lib/format";

/**
 * L'ACHEMINEMENT des notifications par courriel.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Les notifications existaient déjà, toutes, en base. Elles n'allaient    │
 * │  nulle part.                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `notifier()` écrit une ligne dans `Notification`, visible dans l'écran des
 * notifications. Un vendeur qui ne rouvre pas KOLI de la journée ne sait donc
 * pas qu'il a vendu — et le §44 dit que c'est LE moment à annoncer. Ce fichier
 * est le pont entre la ligne écrite et la boîte du destinataire.
 *
 * ── Pourquoi HORS de la transaction ─────────────────────────────────────────
 *
 * `notifier()` s'exécute à l'intérieur de la transaction qui sécurise les
 * fonds, et c'est voulu : aucune notification ne peut exister sans l'écriture
 * qu'elle annonce.
 *
 * Un envoi de courriel ne peut pas vivre là. Deux raisons, et la seconde est
 * la vraie :
 *
 *   · un appel réseau au milieu d'une transaction tient des verrous de base
 *     pendant que le prestataire répond ;
 *   · **un courriel parti ne se rappelle pas.** Si la transaction échoue
 *     ensuite, le vendeur a reçu « vous avez été payé » pour une vente qui
 *     n'existe pas.
 *
 * D'où la séparation : la transaction écrit, l'expédition suit, et `sentAt`
 * dit ce qui est déjà parti.
 *
 * ── Pourquoi `fetch` et pas le SDK Resend ───────────────────────────────────
 *
 * Leur API est un seul POST. Le SDK ajoute une dépendance à installer, à
 * mettre à jour et à auditer pour ce que trente lignes font ici — et le public
 * visé est sur réseau mobile lent (§70), où chaque kilo-octet du serveur finit
 * par se payer au démarrage à froid.
 */

const API = "https://api.resend.com/emails";

/**
 * L'expéditeur.
 *
 * Un sous-domaine dédié, et non le domaine racine : la réputation d'envoi se
 * construit par domaine. Si KOLI tombe un jour sur des adresses invalides,
 * c'est `koli.` qui en souffre — pas le domaine principal, ni les autres
 * projets qui l'utilisent.
 */
const EXPEDITEUR =
  process.env.RESEND_FROM?.trim() ||
  "KOLI <notifications@koli.premiummarketafrica.com>";

/** Combien de notifications par passage. Assez pour rattraper, pas pour saturer. */
const PAR_FOURNEE = 25;

/**
 * Les montants d'une commande, lus dans le REGISTRE et non recalculés.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Un courriel qui annonce un montant faux est pire qu'un courriel sans    │
 * │  montant.                                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Chaque chiffre vient de l'écriture qui le porte, jamais d'un calcul refait
 * ici : le séquestre de `Fund`, le règlement de `Payment`, le net libéré de la
 * somme des écritures FUNDS_RELEASED et COMMISSION — qui est signée, donc
 * s'additionne. Refaire le calcul, c'est se donner une seconde chance de se
 * tromper, et l'écart ne se verrait que dans la boîte du vendeur.
 *
 * Tout est `null` quand la commande est introuvable : les textes disent alors
 * ce qu'ils disaient avant, sans chiffre. Une phrase sans montant reste vraie ;
 * une phrase avec un mauvais montant, non.
 */
async function montantsDe(reference: string): Promise<MontantsDeLaCommande> {
  const vide = { paye: null, sequestre: null, libereNet: null, rembourse: null };

  const commande = await prisma.order.findUnique({
    where: { reference },
    select: {
      currency: true,
      payment: { select: { amount: true, status: true } },
      fund: { select: { amount: true } },
      transactions: { select: { type: true, amount: true } },
    },
  });

  if (!commande) return vide;

  const devise = commeDevise(commande.currency);
  const somme = (types: string[]) =>
    commande.transactions
      .filter((t) => types.includes(t.type))
      .reduce((total, t) => total + t.amount, 0);

  // La commission est NÉGATIVE dans le registre : l'addition donne donc le net.
  const net = somme(["FUNDS_RELEASED", "COMMISSION"]);
  const rendu = Math.abs(somme(["REFUND"]));

  return {
    paye:
      commande.payment?.status === "SUCCEEDED"
        ? formatMontant(commande.payment.amount, devise)
        : null,
    sequestre: commande.fund ? formatMontant(commande.fund.amount, devise) : null,
    libereNet: net > 0 ? formatMontant(net, devise) : null,
    rembourse: rendu > 0 ? formatMontant(rendu, devise) : null,
  };
}

/** Vrai si la configuration permet d'envoyer quoi que ce soit. */
export function courrielConfigure(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

interface Resultat {
  envoyees: number;
  echouees: number;
  ignorees: number;
}

/**
 * Expédie les notifications qui ne l'ont pas encore été.
 *
 * Idempotente par construction : `sentAt` est posé dès qu'un envoi aboutit, et
 * la requête ne lit que les lignes où il est nul. Deux appels simultanés
 * peuvent au pire écrire deux fois le même courriel — le prestataire dédoublonne
 * mal, mais un courriel en double est un désagrément, alors qu'un courriel
 * manquant est une vente qu'on n'apprend pas.
 */
export async function expedierNotificationsEnAttente(): Promise<Resultat> {
  const clef = process.env.RESEND_API_KEY?.trim();

  // Sans clef, on ne fait RIEN et on ne marque rien. Poser `sentAt` ici ferait
  // disparaître à jamais des notifications que personne n'a reçues.
  if (!clef) return { envoyees: 0, echouees: 0, ignorees: 0 };

  const enAttente = await prisma.notification.findMany({
    where: { sentAt: null },
    orderBy: { createdAt: "asc" },
    take: PAR_FOURNEE,
    select: {
      id: true,
      type: true,
      entityId: true,
      user: { select: { email: true, name: true } },
    },
  });

  let envoyees = 0;
  let echouees = 0;
  let ignorees = 0;

  for (const n of enAttente) {
    const message = MESSAGES[n.type];
    const adresse = n.user.email?.trim();

    /*
     * Pas d'adresse, ou pas de texte pour ce type : on marque COMME TRAITÉE.
     *
     * Sans cela, la même ligne reviendrait à chaque passage et bloquerait la
     * file derrière elle. Le motif est noté — « aucune adresse » n'est pas une
     * panne, c'est une information : la plupart des acheteurs de KOLI n'ont
     * donné qu'un téléphone.
     */
    /*
     * SANS REFERENCE, on n envoie pas.
     *
     * `entityId` est nullable en base. Le repli sur une chaine vide produisait
     * « Vous avez une vente — » et « la commande . » : un courriel visiblement
     * casse, adresse a un vrai vendeur, sur une application dont le sujet est
     * la confiance.
     *
     * En pratique `notifier()` passe toujours la reference de la commande. Mais
     * « en pratique » n est pas « toujours », et le cout de se tromper ici est
     * bien plus eleve que celui de ne rien envoyer : la notification reste
     * visible dans l application, ou elle porte son contexte.
     */
    if (!adresse || !message || !n.entityId?.trim() || estFictive(adresse)) {
      await prisma.notification.update({
        where: { id: n.id },
        data: {
          sentAt: new Date(),
          sendError: !adresse
            ? "aucune adresse"
            : !message
              ? SANS_COURRIEL.includes(n.type)
                ? "pas de courriel pour ce type (choix)"
                : "aucun texte pour ce type"
              : !n.entityId?.trim()
                ? "aucune reference de commande"
                : "adresse de demonstration",
        },
      });
      ignorees++;
      continue;
    }

    // Non nulle : la garde ci-dessus a ecarte les lignes sans reference.
    const reference = n.entityId.trim();

    try {
      const reponse = await fetch(API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clef}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: EXPEDITEUR,
          to: [adresse],
          subject: `${message.objet} — ${reference}`,
          text: [
            `Bonjour ${n.user.name},`,
            "",
            message.corps(reference, await montantsDe(reference)),
            "",
            "— KOLI",
          ].join("\n"),
        }),
        // Un envoi qui traîne ne doit pas retenir la file. Il repassera.
        signal: AbortSignal.timeout(8000),
      });

      if (!reponse.ok) {
        const detail = (await reponse.text()).slice(0, 200);
        await prisma.notification.update({
          where: { id: n.id },
          data: { sendError: `HTTP ${reponse.status} — ${detail}` },
        });
        echouees++;
        continue;
      }

      await prisma.notification.update({
        where: { id: n.id },
        data: { sentAt: new Date(), sendError: null },
      });
      envoyees++;
    } catch (e) {
      /*
       * `sentAt` reste NUL : la notification repassera.
       *
       * C'est le bon défaut. Une coupure réseau ne doit pas faire disparaître
       * l'annonce d'une vente — mieux vaut un courriel en retard, ou en double,
       * qu'un vendeur qui n'apprend jamais qu'il a été payé.
       */
      await prisma.notification.update({
        where: { id: n.id },
        data: { sendError: String(e).slice(0, 200) },
      });
      echouees++;
    }
  }

  return { envoyees, echouees, ignorees };
}

/**
 * Déclenche l'expédition APRÈS que la réponse soit partie.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Jamais dans la transaction, jamais avant la réponse.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `after()` de Next exécute le travail une fois la réponse envoyée. Deux
 * conséquences, et les deux comptent :
 *
 *   · **l'acheteur n'attend pas Resend.** Sa page se referme sur « paiement
 *     confirmé » sans dépendre d'un service tiers ;
 *   · **la transaction est déjà close.** Un courriel parti ne se rappelle pas ;
 *     s'il était envoyé depuis l'intérieur, un échec ultérieur laisserait un
 *     vendeur prévenu d'une vente annulée.
 *
 * Elle n'échoue JAMAIS bruyamment. Hors contexte de requête — un script, un
 * test — `after()` lève ; on l'attrape et on ne fait rien. Une notification non
 * expédiée reste en attente et repartira au passage suivant, alors qu'une
 * exception ici annulerait le paiement qui vient d'aboutir.
 */
export async function declencherExpedition(): Promise<void> {
  if (!courrielConfigure()) return;

  try {
    const { after } = await import("next/server");
    after(async () => {
      try {
        await expedierNotificationsEnAttente();
      } catch {
        // Les lignes restent en attente : le prochain passage les reprendra.
      }
    });
  } catch {
    // Pas de contexte de requête. Rien à faire, et surtout rien à casser.
  }
}
