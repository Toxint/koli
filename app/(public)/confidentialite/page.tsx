import type { Metadata } from "next";
import Link from "next/link";
import { Icone } from "@/components/ui/Icone";
import { isTestMode } from "@/lib/config/mode";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
};

/**
 * Ce que KOLI collecte VRAIMENT — vérifié contre le code, pas rédigé d'après
 * un modèle.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Une politique de confidentialité recopiée d'un gabarit annonce des      │
 * │  traceurs qu'on n'a pas et tait les prestataires qu'on a. Elle rassure   │
 * │  et n'informe pas — exactement l'inverse de ce qu'on lui demande.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Quatre décisions, et chacune se déferait sans être écrite :
 *
 * - **Chaque ligne correspond à une colonne, un fichier ou un appel réel.** Le
 *   téléphone du versement est demandé à chaque demande (§43) : il est donc
 *   dit. Aucune donnée bancaire n'est collectée : le tunnel appartient au
 *   partenaire — c'est vrai, donc c'est écrit.
 *
 * - **Les SOUS-TRAITANTS sont nommés.** Un service qui dit « nous ne partageons
 *   pas vos données » alors que ses courriels passent chez un tiers et sa base
 *   chez un autre ment par omission. Ceux qui voient des données personnelles
 *   sont nommés, avec ce qu'ils voient.
 *
 * - **La limite du droit d'effacement est DITE.** Une facture et une écriture
 *   comptable ne s'effacent pas à la demande : promettre l'inverse serait une
 *   promesse intenable, et c'est le genre de promesse qu'on ne découvre fausse
 *   qu'au moment où quelqu'un la réclame.
 *
 * - **La mention de mode test CHANGE, elle ne disparaît pas** — même règle que
 *   les conditions d'utilisation, et même raison.
 */

/** Ce que la plateforme enregistre, par famille. Chaque ligne est vérifiable. */
const DONNEES = [
  {
    titre: "Votre compte",
    texte:
      "Nom, numéro de téléphone, adresse e-mail si vous en fournissez une, rôle (client, vendeur, livreur) et mot de passe — stocké sous forme chiffrée, jamais en clair, et illisible même de nous.",
  },
  {
    titre: "Vos commandes",
    texte:
      "Nom, téléphone, pays, ville, adresse de livraison et point de repère de l'acheteur : ce qu'il faut pour livrer. Le montant, la monnaie et le détail des articles.",
  },
  {
    titre: "La livraison",
    texte:
      "Code de réception, date et heure de remise, livreur concerné. C'est la preuve qu'une commande a bien été remise, et c'est ce qui tranche un litige.",
  },
  {
    titre: "Les paiements",
    texte:
      "Le montant, la monnaie, la date et l'état de chaque paiement, ainsi que la référence donnée par notre partenaire financier. Aucune donnée de carte, aucun code Mobile Money : ils ne passent pas par nous.",
  },
  {
    titre: "Les versements aux vendeurs",
    texte:
      "Le numéro Mobile Money saisi à chaque demande de versement, le montant et la date. Ce numéro est demandé à chaque fois plutôt que conservé comme réglage : c'est la seule donnée qui décide d'où part l'argent.",
  },
  {
    titre: "La vérification d'identité (vendeurs)",
    texte:
      "Les pièces déposées pour vérifier l'identité d'un vendeur. Elles sont stockées hors des fichiers publics du site, sous un nom tiré au sort, et ne sont restituées qu'après contrôle du demandeur.",
  },
  {
    titre: "L'historique",
    texte:
      "Chaque changement d'état d'une commande et chaque décision d'administration sont consignés, avec leur date et leur auteur. C'est ce qui permet de reconstituer ce qui s'est passé en cas de désaccord.",
  },
];

/** Qui d'autre voit quoi. Nommés, parce que taire un sous-traitant est mentir. */
const SOUS_TRAITANTS = [
  {
    nom: "Notre partenaire financier",
    role: "Encaisse les paiements, conserve les fonds jusqu'à leur libération et exécute les versements. Il voit le montant, la monnaie, la référence de la commande et — puisque c'est lui qui l'interroge — le numéro du payeur.",
  },
  {
    nom: "Resend",
    role: "Achemine nos courriels de notification. Il voit l'adresse du destinataire et le contenu du message envoyé.",
  },
  {
    nom: "Vercel et Supabase",
    role: "Hébergent le site et la base de données. Les données décrites plus haut y sont stockées.",
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
      <p className="mt-2 text-sm text-ink-muted dark:text-slate-400">
        Dernière mise à jour : 14 septembre 2026
      </p>

      <div className="mt-6 bg-brand-soft dark:bg-slate-900 border border-brand-border dark:border-slate-800 rounded-2xl p-6">
        <p className="font-bold text-brand dark:text-emerald-300">
          <Icone nom="cadenas" className="w-4 h-4" /> Ce texte décrit ce que le
          code fait, pas ce qui se fait d&apos;habitude
        </p>
        <p className="mt-2 text-sm text-brand dark:text-slate-300">
          KOLI ne pose aucun traceur publicitaire, n&apos;installe aucun cookie
          de mesure d&apos;audience et ne revend aucune donnée. Le seul cookie du
          site maintient votre session ouverte.
          {isTestMode()
            ? " Sur cette version du site, les paiements sont simulés : aucune donnée de paiement réel n'est traitée."
            : ""}
        </p>
      </div>

      <h2 className="mt-10 text-xl font-bold">Ce que nous collectons</h2>
      <p className="mt-3 text-sm text-ink-muted dark:text-slate-300">
        Uniquement ce qui sert à faire fonctionner une commande, à payer le
        vendeur et à trancher un litige. Rien n&apos;est collecté « au cas où ».
      </p>
      <dl className="mt-4 space-y-4">
        {DONNEES.map((d) => (
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

      <h2 className="mt-10 text-xl font-bold">Qui voit vos données</h2>
      <ul className="mt-4 space-y-3 text-sm text-ink-muted dark:text-slate-300">
        <li>
          <strong className="text-ink dark:text-slate-100">
            Le vendeur d&apos;une commande
          </strong>{" "}
          voit le nom, le téléphone et l&apos;adresse de son acheteur — il doit
          livrer.
        </li>
        <li>
          <strong className="text-ink dark:text-slate-100">Le livreur</strong>{" "}
          voit l&apos;adresse et le téléphone du destinataire, jamais la valeur
          de ce qu&apos;il transporte.
        </li>
        <li>
          <strong className="text-ink dark:text-slate-100">
            L&apos;administration de KOLI
          </strong>{" "}
          accède aux commandes, aux paiements et aux pièces de vérification, pour
          trancher les litiges et exécuter les versements.
        </li>
        <li>
          <strong className="text-ink dark:text-slate-100">
            Personne d&apos;autre
          </strong>{" "}
          — hors les prestataires techniques ci-dessous, et une autorité qui en
          ferait la demande légale.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-bold">Nos prestataires</h2>
      <dl className="mt-4 space-y-4">
        {SOUS_TRAITANTS.map((s) => (
          <div
            key={s.nom}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-hairline dark:border-slate-800 p-6"
          >
            <dt className="font-bold">{s.nom}</dt>
            <dd className="mt-1.5 text-sm text-ink-muted dark:text-slate-300">
              {s.role}
            </dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 text-xl font-bold">Ce que KOLI ne fait pas</h2>
      <ul className="mt-4 space-y-2 text-sm text-ink-muted dark:text-slate-300 list-disc pl-5">
        {/*
          * Le FAIT reste vrai dans les deux modes, la RAISON change.
          *
          * En mode réel, aucune donnée bancaire ne transite par KOLI non plus :
          * le tunnel de paiement appartient au partenaire, et c'est lui qui
          * demande le numéro et l'opérateur. Dire « parce qu'on est en mode
          * test » serait alors faux, et affaiblirait une garantie qui tient.
          */}
        <li>
          {isTestMode()
            ? "Aucune donnée bancaire n'est collectée : la plateforme est en mode test et ne traite aucun paiement réel."
            : "Aucune donnée bancaire n'est collectée : le paiement se déroule chez notre partenaire, et ni votre numéro de compte ni vos identifiants ne transitent par KOLI."}
        </li>
        <li>Aucune donnée n&apos;est revendue ni louée à des tiers.</li>
        <li>
          Aucune publicité, aucun profilage : nous ne construisons pas de profil
          de vos habitudes d&apos;achat.
        </li>
        <li>
          Le code de réception n&apos;est visible que de l&apos;acheteur — ni le
          vendeur ni le livreur n&apos;y ont accès.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-bold">Combien de temps nous gardons</h2>
      <div className="mt-3 space-y-3 text-sm text-ink-muted dark:text-slate-300">
        <p>
          Les commandes, paiements, factures et écritures comptables sont
          conservés : ce sont des pièces financières, et elles doivent pouvoir
          être relues bien après la vente.
        </p>
        <p>
          Les pièces de vérification d&apos;identité sont conservées le temps que
          le compte vendeur reste actif, puis supprimées à sa fermeture.
        </p>
      </div>

      <h2 className="mt-10 text-xl font-bold">Vos droits</h2>
      <div className="mt-3 space-y-3 text-sm text-ink-muted dark:text-slate-300">
        <p>
          Vous pouvez demander à consulter les données qui vous concernent, à les
          corriger, ou à fermer votre compte. Écrivez à{" "}
          <span className="font-semibold text-ink dark:text-slate-100">
            koli@premiummarketafrica.com
          </span>{" "}
          depuis l&apos;adresse de votre compte, ou depuis votre numéro si vous
          n&apos;en avez pas.
        </p>
        <p>
          <strong className="text-ink dark:text-slate-100">
            Une limite, et nous préférons l&apos;écrire :
          </strong>{" "}
          fermer un compte n&apos;efface pas les factures ni les écritures des
          ventes déjà réalisées. Elles engagent deux parties et servent de preuve
          à l&apos;autre ; les supprimer à la demande de l&apos;une reviendrait à
          effacer le reçu de l&apos;autre.
        </p>
      </div>

      <h2 className="mt-10 text-xl font-bold">Comment vos données sont protégées</h2>
      <ul className="mt-4 space-y-2 text-sm text-ink-muted dark:text-slate-300 list-disc pl-5">
        <li>
          Les mots de passe sont chiffrés à sens unique : même nous ne pouvons
          pas les lire.
        </li>
        <li>
          Les pièces d&apos;identité vivent hors des fichiers servis par le site,
          sous un nom tiré au sort, et ne sont restituées qu&apos;après contrôle
          du demandeur.
        </li>
        <li>
          Les échanges avec le site sont chiffrés, et la session est portée par
          un cookie signé.
        </li>
      </ul>

      <p className="mt-10 text-sm text-ink-muted dark:text-slate-300">
        Cette politique complète nos{" "}
        {/* Même raison que sur la page des conditions : 38 px de haut sinon. */}
        <Link
          href="/conditions"
          className="inline-block min-h-[44px] py-1 font-semibold text-brand dark:text-emerald-400 underline"
        >
          conditions d&apos;utilisation
        </Link>
        . Elle peut évoluer : la date en tête de page indique la dernière
        version.
      </p>
    </main>
  );
}
