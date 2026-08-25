import Link from "next/link";
import { Icone } from "@/components/ui/Icone";

/**
 * Référence de commande inconnue.
 *
 * Cet écran existait déjà, mais rendu directement par la page : le serveur
 * répondait donc **200 OK** en annonçant « introuvable ». Un code de succès
 * sur une page d'erreur trompe tout ce qui lit les codes plutôt que le texte —
 * la supervision, les moteurs de recherche, un éventuel cache.
 *
 * Il vit désormais dans un `not-found.tsx`, atteint par `notFound()`, ce qui
 * produit un vrai 404. Le message reste propre au paiement plutôt que de
 * retomber sur le 404 générique : « cette page n'existe pas » n'aiderait pas
 * quelqu'un qui vient de recevoir un lien par WhatsApp.
 *
 * La référence elle-même n'est pas répétée : `not-found.tsx` ne reçoit pas les
 * paramètres de la route. C'est sans conséquence — la personne l'a sous les
 * yeux dans sa barre d'adresse, et la faire figurer inviterait surtout à la
 * recopier ailleurs.
 */
export default function CommandeIntrouvable() {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-brand-soft text-brand flex items-center justify-center mx-auto">
          <Icone nom="alerte" className="w-8 h-8" />
        </div>

        <h1 className="text-xl font-bold text-brand">Commande introuvable</h1>

        <p className="text-sm text-ink-muted">
          Cette référence de commande n&apos;existe pas. Vérifiez le lien que
          vous avez reçu — un caractère manquant suffit à le rendre invalide.
        </p>

        <p className="text-xs text-ink-muted">
          Si le lien vient de votre vendeur, demandez-lui de vous le renvoyer.
        </p>

        <Link
          href="/"
          className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-2xl bg-brand hover:bg-brand-strong text-white font-bold text-sm transition-colors"
        >
          Aller sur KOLI
        </Link>
      </div>
    </main>
  );
}
