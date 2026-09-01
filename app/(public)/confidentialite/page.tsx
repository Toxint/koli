import type { Metadata } from "next";
import Link from "next/link";
import { Icone } from "@/components/ui/Icone";
import { isTestMode } from "@/lib/config/mode";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
};

/**
 * Comme pour les conditions, page d'attente honnete plutot qu'un texte
 * juridique invente. On y decrit en revanche fidelement les donnees
 * effectivement collectees par le code aujourd'hui — cela, c'est verifiable.
 */
const donnees = [
  {
    titre: "Compte",
    texte:
      "Nom, numéro de téléphone, adresse e-mail si vous en fournissez une, et mot de passe (stocké sous forme chiffrée, jamais en clair).",
  },
  {
    titre: "Commandes",
    texte:
      "Nom, téléphone, pays, ville, adresse de livraison et point de repère de l'acheteur — nécessaires à la livraison.",
  },
  {
    titre: "Livraison",
    texte:
      "Code de réception, date et heure de remise, livreur concerné. Ces éléments constituent la preuve de livraison.",
  },
  {
    titre: "Historique",
    texte:
      "Les changements de statut de chaque commande sont conservés, afin de pouvoir reconstituer ce qui s'est passé en cas de désaccord.",
  },
];

export default function ConfidentialitePage() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center min-h-[44px] text-sm font-semibold text-brand dark:text-emerald-400"
      >
        ← Retour à l&apos;accueil
      </Link>

      <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
        Politique de confidentialité
      </h1>

      <div className="mt-6 bg-test-mode-surface dark:bg-amber-950/60 border border-brand-border dark:border-amber-800 rounded-2xl p-6">
        <p className="font-bold text-test-mode dark:text-amber-300">
          <Icone nom="info" className="w-4 h-4" /> Document en cours de préparation
        </p>
        <p className="mt-2 text-sm text-brand dark:text-slate-300">
          La politique définitive sera publiée avec le cadre réglementaire
          applicable. Voici, en attendant, ce que la plateforme collecte
          réellement aujourd&apos;hui.
        </p>
      </div>

      <h2 className="mt-10 text-xl font-bold">Données collectées</h2>
      <dl className="mt-4 space-y-4">
        {donnees.map((d) => (
          <div
            key={d.titre}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-hairline dark:border-slate-800 p-6"
          >
            <dt className="font-bold">{d.titre}</dt>
            <dd className="mt-1.5 text-sm text-ink-muted dark:text-slate-300">
              {d.texte}
            </dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 text-xl font-bold">Ce que KOLI ne fait pas</h2>
      <ul className="mt-4 space-y-2 text-sm text-ink-muted dark:text-slate-300 list-disc pl-5">
        {/*
          * Le FAIT reste vrai dans les deux modes, la RAISON change.
          *
          * En mode reel, aucune donnee bancaire ne transite par KOLI non plus :
          * le tunnel de paiement appartient au partenaire, et c'est lui qui
          * demande le numero et l'operateur. Dire « parce qu'on est en mode
          * test » serait alors faux, et affaiblirait une garantie qui tient.
          */}
        <li>
          {isTestMode()
            ? "Aucune donnée bancaire n'est collectée : la plateforme est en mode test et ne traite aucun paiement réel."
            : "Aucune donnée bancaire n'est collectée : le paiement se déroule chez notre partenaire, et ni votre numéro de compte ni vos identifiants ne transitent par KOLI."}
        </li>
        <li>Aucune donnée n&apos;est revendue à des tiers.</li>
        <li>
          Le code de réception n&apos;est visible que de l&apos;acheteur — ni le
          vendeur ni le livreur n&apos;y ont accès.
        </li>
      </ul>
    </main>
  );
}
