import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { rapprocherPaiements } from "@/lib/payments/rapprochement";

/**
 * Le rattrapage des paiements restés en suspens (§29, §52).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  `rapprocherPaiements()` existait, éprouvée, et N'ÉTAIT APPELÉE PAR      │
 * │  RIEN. Ni route, ni tâche planifiée. Elle attendait ce jour-ci.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * En mode test, l'absence était sans conséquence : le paiement simulé répond
 * immédiatement, rien ne reste jamais en attente. Avec un vrai agrégateur,
 * c'est le filet de sécurité — et il est nécessaire pour deux raisons
 * distinctes :
 *
 * **1. Les rappels se perdent.** Réseau coupé, redéploiement au mauvais
 * instant, panne chez eux. Sans rattrapage, le client est débité pendant que
 * sa commande reste « en attente de paiement » chez nous. Indéfiniment, et
 * sans que personne le sache.
 *
 * **2. Les paiements abandonnés ne se ferment jamais.** Quelqu'un ouvre le
 * tunnel, ne valide pas, ferme l'onglet. Sa commande resterait en attente pour
 * toujours, et le stock avec elle.
 *
 * ⚠ **Avec iKeePay, seule la seconde raison est servie.** Ils n'exposent aucun
 * point d'entrée pour relire l'état d'une transaction : `consulter()` renvoie
 * `null`, et le rattrapage ne peut que faire expirer ce qui a dépassé son
 * échéance. C'est déjà beaucoup, et ce n'est pas assez — voir
 * `lib/payments/IkeePayProvider.ts`.
 *
 * ── L'accès ─────────────────────────────────────────────────────────────────
 *
 * Cette route écrit en base. Elle exige donc `CRON_SECRET`, **sans valeur de
 * repli** : un point d'entrée qui modifie des paiements et s'ouvre à qui le
 * devine n'est pas une tâche planifiée, c'est une porte. Vercel envoie ce
 * secret en `Authorization: Bearer …` sur les tâches qu'il déclenche.
 *
 * `GET` et non `POST` : c'est ce que Vercel Cron appelle. La méthode est ici
 * un détail de protocole, pas une promesse d'innocuité — cette route agit.
 */

/** Vercel Cron n'attend pas : au-delà, il coupe et réessaiera au tour suivant. */
export const maxDuration = 60;

/**
 * Jamais mise en cache.
 *
 * Sans cette ligne, Next pourrait servir la réponse d'un appel précédent — et
 * le rattrapage ne s'exécuterait plus du tout, en répondant toujours « tout va
 * bien ». Une tâche planifiée qui ne fait rien mais dit l'avoir fait est pire
 * que pas de tâche du tout.
 */
export const dynamic = "force-dynamic";

function memeSecret(recu: string, attendu: string): boolean {
  const a = Buffer.from(recu);
  const b = Buffer.from(attendu);
  if (a.length !== b.length) {
    // Comparaison factice : répondre plus vite sur une longueur différente
    // révélerait déjà celle du secret.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function GET(requete: Request) {
  const attendu = process.env.CRON_SECRET?.trim();

  if (!attendu) {
    // On refuse plutôt que d'ouvrir. Même règle qu'`AUTH_SECRET` : un secret
    // absent ne se remplace pas par « tant pis ».
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const entete = requete.headers.get("authorization") ?? "";
  const jeton = entete.startsWith("Bearer ") ? entete.slice(7) : "";

  if (!jeton || !memeSecret(jeton, attendu)) {
    // La réponse ne dit pas ce qui manque : inutile d'aider qui cherche.
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const resultat = await rapprocherPaiements();

  return NextResponse.json({ ok: true, ...resultat });
}
