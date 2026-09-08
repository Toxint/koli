import { prisma } from "@/lib/db/prisma";
import {
  MESSAGES,
  MOTIF_COMMANDE_ABSENTE,
  motifDeNonEnvoi,
  type MontantsDeLaCommande,
} from "@/lib/notifications/textes";
import { TENTATIVES_MAX, refusDefinitif } from "@/lib/notifications/reessai";
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

/**
 * Où atterrit une RÉPONSE, quand il y en a une.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  `notifications@koli.…` est une adresse d'ENVOI. Elle ne reçoit rien.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Un vendeur qui apprend une vente répond — « j'ai une question », « ce n'est
 * pas mon client ». C'est le premier réflexe devant un courriel, et sur un
 * service dont le sujet est la confiance, écrire à quelqu'un sans pouvoir être
 * répondu est un mauvais début.
 *
 * ⚠ **Non renseignée ⇒ AUCUN `reply_to`**, et surtout pas un repli inventé.
 * Une adresse de réponse qui rebondit est pire que pas d'adresse : elle promet
 * une écoute qui n'existe pas, et le rebond abîme la réputation d'envoi du
 * domaine (§8).
 */
const REPONDRE_A = process.env.RESEND_REPLY_TO?.trim() || null;

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
 * Chaque champ vaut `null` quand le registre ne porte pas encore l'écriture :
 * les textes disent alors ce qu'ils disaient avant, sans chiffre. Une phrase
 * sans montant reste vraie ; une phrase avec un mauvais montant, non.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Mais la FONCTION rend `null` quand la commande elle-même est absente,   │
 * │  et ce n'est pas la même chose.                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * « Le registre ne dit rien encore » et « cette commande n'existe pas » se
 * ressemblaient : les deux donnaient quatre `null`, et le courriel partait
 * quand même. Or annoncer « un client vient de payer la commande X » quand X
 * n'est nulle part, c'est exactement le courriel qu'on ne rattrape pas.
 *
 * Le cas est réel. Une notification survit à sa commande : `entityId` est une
 * chaîne, pas une clef étrangère — rien ne la supprime en cascade. Le ménage du
 * registre (`supabase:registre`, §8) efface les ventes FABRIQUÉES et laisse
 * leurs notifications derrière lui. `KOLI-M6BDYA9F` en est une, et son
 * destinataire est une vraie personne.
 */
async function montantsDe(reference: string): Promise<MontantsDeLaCommande | null> {

  const commande = await prisma.order.findUnique({
    where: { reference },
    select: {
      currency: true,
      payment: { select: { amount: true, status: true } },
      fund: { select: { amount: true } },
      transactions: { select: { type: true, amount: true } },
    },
  });

  // La commande n'est pas au registre : on n'annonce rien à son sujet.
  if (!commande) return null;

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
    /*
     * Les tentatives d'abord, la date ensuite.
     *
     * Une ligne qui a deja echoue passe APRES celles qu'on n'a jamais
     * essayees. Sinon une panne passagere retarde l'annonce des ventes qui
     * arrivent pendant qu'elle dure — et ce sont justement les plus urgentes.
     */
    orderBy: [{ sendAttempts: "asc" }, { createdAt: "asc" }],
    take: PAR_FOURNEE,
    select: {
      id: true,
      type: true,
      entityId: true,
      sendAttempts: true,
      user: { select: { email: true, name: true, emailBouncedAt: true } },
    },
  });

  let envoyees = 0;
  let echouees = 0;
  let ignorees = 0;

  for (const n of enAttente) {
    const message = MESSAGES[n.type];

    /*
     * Marque COMME TRAITEE, avec son motif.
     *
     * Sans cela, la meme ligne reviendrait a chaque passage et bloquerait la
     * file derriere elle.
     */
    const motif = motifDeNonEnvoi({
      adresse: n.user.email,
      type: n.type,
      reference: n.entityId,
      rebond: n.user.emailBouncedAt,
    });

    if (motif || !message) {
      await prisma.notification.update({
        where: { id: n.id },
        data: { sentAt: new Date(), sendError: motif ?? "aucun texte pour ce type" },
      });
      ignorees++;
      continue;
    }

    // Non nuls : `motifDeNonEnvoi` a ecarte les lignes sans adresse ni reference.
    const adresse = n.user.email!.trim();
    const reference = n.entityId!.trim();

    /*
     * La commande est-elle encore au registre ?
     *
     * Lu AVANT l envoi, et non au moment de composer le texte : le verdict
     * decide s il faut ecrire, pas seulement quoi ecrire. Une notification
     * orpheline est marquee avec son motif — sinon elle reviendrait a chaque
     * passage et bloquerait la file derriere elle.
     */
    const montants = await montantsDe(reference);

    if (!montants) {
      await prisma.notification.update({
        where: { id: n.id },
        data: { sentAt: new Date(), sendError: MOTIF_COMMANDE_ABSENTE },
      });
      ignorees++;
      continue;
    }

    try {
      const reponse = await fetch(API, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${clef}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: EXPEDITEUR,
          ...(REPONDRE_A ? { reply_to: REPONDRE_A } : {}),
          to: [adresse],
          subject: `${message.objet} — ${reference}`,
          text: [
            `Bonjour ${n.user.name},`,
            "",
            message.corps(reference, montants),
            "",
            "— KOLI",
          ].join("\n"),
        }),
        // Un envoi qui traîne ne doit pas retenir la file. Il repassera.
        signal: AbortSignal.timeout(8000),
      });

      if (!reponse.ok) {
        const detail = (await reponse.text()).slice(0, 200);
        const tentatives = n.sendAttempts + 1;
        const renonce = refusDefinitif(reponse.status) || tentatives >= TENTATIVES_MAX;

        await prisma.notification.update({
          where: { id: n.id },
          data: {
            sendAttempts: tentatives,
            sendError: `HTTP ${reponse.status} — ${detail}`,
            // Marquee : la file avance. La ligne reste visible dans
            // l'application, ou elle porte son contexte.
            ...(renonce ? { sentAt: new Date() } : {}),
          },
        });
        echouees++;
        continue;
      }

      /*
       * On GARDE l'identifiant que Resend vient de rendre.
       *
       * ┌──────────────────────────────────────────────────────────────────┐
       * │  Il était jeté : la réponse n'était même pas lue.                │
       * └──────────────────────────────────────────────────────────────────┘
       *
       * C'est le seul lien entre ce courriel et le rappel de rebond qui
       * arrivera peut-être demain. Sans lui, on apprend qu'UN message a
       * rebondi sans savoir lequel, pour quelle vente, ni chez qui.
       *
       * Illisible ⇒ `null`, et l'envoi reste un succès : le courriel est
       * parti, c'est le fait qui compte. Perdre la trace du rebond est
       * regrettable ; refuser un envoi abouti serait pire.
       */
      let identifiant: string | null = null;
      try {
        identifiant = ((await reponse.json()) as { id?: string }).id ?? null;
      } catch {
        identifiant = null;
      }

      await prisma.notification.update({
        where: { id: n.id },
        data: {
          sentAt: new Date(),
          sendError: null,
          sendAttempts: n.sendAttempts + 1,
          providerMessageId: identifiant,
        },
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
      const tentatives = n.sendAttempts + 1;

      await prisma.notification.update({
        where: { id: n.id },
        data: {
          sendAttempts: tentatives,
          sendError: String(e).slice(0, 200),
          // Le plafond vaut aussi ici : une adresse dont le serveur ne repond
          // jamais bloquerait la file exactement comme un refus.
          ...(tentatives >= TENTATIVES_MAX
            ? { sentAt: new Date() }
            : {}),
        },
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
