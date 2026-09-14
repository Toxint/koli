import type { Metadata } from "next";
import Link from "next/link";
import { Icone } from "@/components/ui/Icone";
import { isTestMode } from "@/lib/config/mode";
import { tauxCommissionActif } from "@/lib/finance/commission";
import { DELAI_VERSEMENT_HEURES, VERSEMENT_MINIMUM } from "@/lib/finance/versement";
import { MARCHES, ouvertAuxVendeurs } from "@/data/markets";

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
};

/**
 * Relue toutes les heures, et non figée à la construction.
 *
 * Le taux de commission se change depuis l'administration, sans déploiement
 * (§41). Pré-rendue une fois pour toutes, cette page continuerait d'annoncer
 * l'ancien taux jusqu'au déploiement suivant — c'est-à-dire que le document
 * qui engage KOLI dirait un chiffre que KOLI ne prélève plus.
 */
export const revalidate = 3600;

/**
 * Les conditions du service RÉEL — celui qui encaisse de l'argent.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Ce document a longtemps été une page d'attente : « les conditions       │
 * │  définitives seront publiées une fois arrêté le partenaire financier ».  │
 * │  Le partenaire est arrêté, les vendeurs vont arriver, et un service qui  │
 * │  prend l'argent d'un acheteur sans dire à quelles conditions n'est pas   │
 * │  un service de confiance.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Quatre décisions, et chacune se déferait sans être écrite :
 *
 * - **Les chiffres sont LUS, jamais recopiés.** Le taux de commission vient de
 *   la base (c'est celui qu'on prélève vraiment), le minimum de versement et le
 *   délai promis viennent de `lib/finance/versement.ts`, la liste des pays
 *   ouverts de `data/markets.ts`. Un document juridique qui annonce 5 % pendant
 *   que le code en prélève 7 est pire qu'un document absent : il devient la
 *   preuve écrite qu'on a menti. Ici, changer le taux change la page.
 *
 * - **On ne promet que ce que le code TIENT.** « Les fonds sont libérés après
 *   votre confirmation » est vrai (§29) ; « remboursement sous 48 h » ne
 *   l'était pas, donc ce n'est pas écrit. Chaque phrase de ce texte correspond
 *   à un comportement existant.
 *
 * - **KOLI ne se présente jamais comme détenteur des fonds.** C'est le
 *   partenaire agréé qui les encaisse et les conserve ; KOLI dit seulement
 *   quand les libérer. C'est ce qui rend le §84 satisfait plutôt que contourné,
 *   et ce n'est pas une nuance de rédaction.
 *
 * - **La mention de mode test CHANGE, elle ne disparaît pas.** Tant que la
 *   production tourne en `test`, le visiteur doit lire que ce site-là simule —
 *   sinon le document affirme un prélèvement qui n'a pas lieu, ce qui est le
 *   symétrique exact de la faute que `verif:mentions` existe pour empêcher.
 */

/** Une section numérotée, pour que les phrases puissent se citer. */
function Article({
  numero,
  titre,
  children,
}: {
  numero: number;
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold">
        {numero}. {titre}
      </h2>
      <div className="mt-3 space-y-3 text-sm text-ink-muted dark:text-slate-300">
        {children}
      </div>
    </section>
  );
}

export default async function ConditionsPage() {
  const taux = await tauxCommissionActif();
  const paysOuverts = MARCHES.filter(ouvertAuxVendeurs).map((m) => m.name);
  const minimum = VERSEMENT_MINIMUM.toLocaleString("fr-FR");

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center min-h-[44px] text-sm font-semibold text-brand dark:text-emerald-400"
      >
        ← Retour à l&apos;accueil
      </Link>

      <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight">
        Conditions d&apos;utilisation
      </h1>
      <p className="mt-2 text-sm text-ink-muted dark:text-slate-400">
        Dernière mise à jour : 14 septembre 2026
      </p>

      {/*
        * La phrase CHANGE selon le mode, elle ne disparaît pas.
        *
        * Sur un site qui simule, annoncer un prélèvement réel serait faux ; sur
        * un site qui prélève, taire le prélèvement le serait bien davantage.
        */}
      {isTestMode() ? (
        <div className="mt-6 bg-test-mode-surface dark:bg-amber-950/60 border border-brand-border dark:border-amber-800 rounded-2xl p-6">
          <p className="font-bold text-test-mode dark:text-amber-300">
            <Icone nom="info" className="w-4 h-4" /> Sur cette version du site,
            les paiements sont simulés
          </p>
          <p className="mt-2 text-sm text-brand dark:text-slate-300">
            Aucun montant n&apos;est prélevé et aucun fonds n&apos;est conservé.
            Les règles ci-dessous décrivent le service tel qu&apos;il fonctionne
            lorsqu&apos;il encaisse réellement.
          </p>
        </div>
      ) : (
        <div className="mt-6 bg-brand-soft dark:bg-slate-900 border border-brand-border dark:border-slate-800 rounded-2xl p-6">
          <p className="font-bold text-brand dark:text-emerald-300">
            <Icone nom="bouclier" className="w-4 h-4" /> L&apos;argent ne passe
            jamais par KOLI
          </p>
          <p className="mt-2 text-sm text-brand dark:text-slate-300">
            Votre paiement est encaissé et conservé par notre partenaire
            financier agréé. KOLI ne détient à aucun moment vos fonds : il
            indique seulement quand les libérer, après votre confirmation de
            réception.
          </p>
        </div>
      )}

      <Article numero={1} titre="Qui vous lie ce document">
        <p>
          KOLI est un service de mise sous séquestre pour le commerce en ligne,
          exploité sous le nom « KOLI ». En créant un compte ou en payant par un
          lien KOLI, vous acceptez les présentes conditions.
        </p>
        <p>
          Pour toute question, réclamation ou signalement :{" "}
          <span className="font-semibold text-ink dark:text-slate-100">
            koli@premiummarketafrica.com
          </span>
          . C&apos;est une adresse lue par une personne, et c&apos;est par elle
          que passent les réclamations.
        </p>
      </Article>

      <Article numero={2} titre="Ce que KOLI fait, et ce qu'il ne fait pas">
        <p>
          KOLI met en relation un acheteur et un vendeur, et{" "}
          <strong className="text-ink dark:text-slate-100">
            retient le paiement
          </strong>{" "}
          jusqu&apos;à ce que l&apos;acheteur confirme avoir reçu sa commande.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            KOLI n&apos;est <strong>ni vendeur ni transporteur</strong> : la
            marchandise, son prix et sa livraison relèvent du vendeur.
          </li>
          <li>
            KOLI n&apos;est <strong>pas un établissement de paiement</strong> et
            ne détient jamais votre argent. L&apos;encaissement et la
            conservation des fonds sont assurés par un partenaire financier
            agréé.
          </li>
          <li>
            KOLI ne demande jamais vos identifiants bancaires ni votre code
            Mobile Money : le paiement se déroule chez le partenaire.
          </li>
        </ul>
      </Article>

      <Article numero={3} titre="Comment se déroule une commande">
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Le vendeur crée la commande et vous envoie un lien de paiement.</li>
          <li>
            Vous payez sur ce lien. Les fonds sont alors{" "}
            <strong className="text-ink dark:text-slate-100">sécurisés</strong>{" "}
            chez le partenaire : le vendeur sait que l&apos;argent existe, sans
            pouvoir y toucher.
          </li>
          <li>Le vendeur expédie, et vous suivez la livraison.</li>
          <li>
            À la remise, vous communiquez au livreur votre{" "}
            <strong className="text-ink dark:text-slate-100">
              code de réception
            </strong>
            . Ce code n&apos;est connu que de vous : ni le vendeur ni le livreur
            n&apos;y ont accès.
          </li>
          <li>
            Vous confirmez la réception. Les fonds sont alors libérés au vendeur,
            commission déduite.
          </li>
        </ol>
        <p>
          Tant que vous n&apos;avez pas confirmé, le vendeur n&apos;est pas payé.
          C&apos;est tout l&apos;objet du service.
        </p>
      </Article>

      <Article numero={4} titre="Ce que KOLI prélève">
        <p>
          {taux > 0 ? (
            <>
              KOLI prélève une commission de{" "}
              <strong className="text-ink dark:text-slate-100">{taux} %</strong>{" "}
              sur chaque vente aboutie. Elle est retenue au moment de la
              libération des fonds, sur le montant de la commande, et le détail
              apparaît dans l&apos;espace du vendeur.
            </>
          ) : (
            <>
              La commission applicable à chaque vente est celle affichée dans
              l&apos;espace du vendeur au moment de la libération des fonds.
            </>
          )}
        </p>
        <p>
          Aucun frais d&apos;inscription, aucun abonnement, aucun frais pour
          l&apos;acheteur.
        </p>
        <p>
          Si vous payez depuis un pays dont la monnaie diffère de celle de la
          commande, c&apos;est le partenaire qui convertit, à son propre taux, au
          moment du prélèvement. Le montant équivalent affiché avant paiement est{" "}
          <strong className="text-ink dark:text-slate-100">indicatif</strong> et
          ne nous engage pas.
        </p>
      </Article>

      <Article numero={5} titre="Versement au vendeur">
        <p>
          Les fonds libérés s&apos;accumulent dans le solde du vendeur, qui en
          demande le versement depuis son espace, quand il le souhaite.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Montant minimum d&apos;une demande :{" "}
            <strong className="text-ink dark:text-slate-100">
              {minimum} FCFA
            </strong>
            .
          </li>
          <li>
            La demande est exécutée{" "}
            <strong className="text-ink dark:text-slate-100">
              au plus tard {DELAI_VERSEMENT_HEURES} heures
            </strong>{" "}
            après son envoi. Une fois lancé, le transfert Mobile Money est
            immédiat.
          </li>
          <li>
            Le numéro de réception est saisi à chaque demande.{" "}
            <strong className="text-ink dark:text-slate-100">
              Un numéro erroné envoie l&apos;argent ailleurs, et nous ne pouvons
              pas le récupérer.
            </strong>{" "}
            Relisez-le.
          </li>
          <li>
            Une demande peut être refusée — solde insuffisant, numéro invalide,
            vérification d&apos;identité en attente. Le motif vous est alors
            indiqué, et votre solde reste intact.
          </li>
        </ul>
      </Article>

      <Article numero={6} titre="Litiges, remboursements">
        <p>
          Tant que les fonds ne sont pas libérés, l&apos;acheteur peut ouvrir un
          litige : commande non reçue, article différent de la description,
          article endommagé.
        </p>
        <p>
          KOLI examine les éléments dont il dispose — preuve de livraison, code
          de réception saisi ou non, historique de la commande, échanges des
          parties — puis tranche : libération au vendeur, ou remboursement de
          l&apos;acheteur.
        </p>
        <p>
          Un remboursement est exécuté par le partenaire financier. Nous ne
          pouvons rembourser que ce qui a été effectivement encaissé, et
          uniquement sur un moyen de paiement que vous nous indiquez.
        </p>
      </Article>

      <Article numero={7} titre="Qui peut vendre, qui peut acheter">
        <p>
          Les comptes vendeurs sont ouverts, pour l&apos;instant, aux{" "}
          {paysOuverts.length} pays de la zone franc CFA desservis par notre
          partenaire : {paysOuverts.join(", ")}.
        </p>
        <p>
          Les acheteurs, eux, peuvent payer depuis n&apos;importe quel pays
          couvert par le partenaire : la conversion est faite au moment du
          paiement.
        </p>
      </Article>

      <Article numero={8} titre="Vos engagements">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Donner des informations exactes : nom, numéro de téléphone, adresse
            de livraison. Une adresse fausse rend la livraison impossible et le
            litige indéfendable.
          </li>
          <li>
            Ne vendre que des marchandises licites, que vous détenez, et les
            décrire fidèlement.
          </li>
          <li>
            Ne pas contourner le service : demander à un acheteur de payer hors
            de KOLI après l&apos;avoir attiré par KOLI le prive de toute
            protection, et met fin à votre compte.
          </li>
          <li>
            Ne pas partager votre code de réception avant d&apos;avoir reçu et
            vérifié votre commande. Le donner d&apos;avance revient à payer sans
            avoir reçu.
          </li>
        </ul>
      </Article>

      <Article numero={9} titre="Vérification d'identité">
        <p>
          Pour être payé, un vendeur peut devoir fournir une pièce
          d&apos;identité. Ces pièces ne sont jamais publiques : elles sont
          conservées hors des fichiers servis par le site et ne sont consultables
          que par l&apos;administration, pour cette vérification.
        </p>
        <p>
          Le détail est dans notre{" "}
          {/* `inline-block min-h-[44px]` : un lien posé dans un paragraphe fait
              la hauteur de sa ligne — 38 px, refusé par `verif:responsive`.
              Un doigt ne vise pas une ligne de texte comme une souris. */}
          <Link
            href="/confidentialite"
            className="inline-block min-h-[44px] py-1 font-semibold text-brand dark:text-emerald-400 underline"
          >
            politique de confidentialité
          </Link>
          .
        </p>
      </Article>

      <Article numero={10} titre="Suspension d'un compte">
        <p>
          Nous pouvons suspendre un compte en cas de fraude, d&apos;usurpation
          d&apos;identité, de marchandise illicite ou de contournement répété du
          service.
        </p>
        <p>
          Une suspension ne confisque rien : les commandes en cours suivent la
          procédure de litige, et les sommes dues au terme de cette procédure
          sont versées.
        </p>
      </Article>

      <Article numero={11} titre="Ce dont KOLI répond">
        <p>KOLI s&apos;engage à :</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            ne jamais libérer les fonds avant votre confirmation de réception ou
            une décision de litige ;
          </li>
          <li>
            conserver l&apos;historique de chaque commande et le tenir à votre
            disposition ;
          </li>
          <li>verser au vendeur ce que le registre lui reconnaît.</li>
        </ul>
        <p>
          En revanche, KOLI ne répond pas de la qualité ou de la conformité de la
          marchandise, du retard d&apos;un livreur choisi par le vendeur, ni
          d&apos;une interruption du partenaire financier ou du réseau. Ces
          situations relèvent de la procédure de litige, pas d&apos;une garantie.
        </p>
      </Article>

      <Article numero={12} titre="Modification de ces conditions">
        <p>
          Ces conditions peuvent changer — notamment lorsque le taux de
          commission ou la liste des pays desservis évolue. La date en tête de
          page indique la dernière version, et tout changement important vous
          sera annoncé.
        </p>
        <p>
          En cas de désaccord avec nous, écrivez d&apos;abord à
          koli@premiummarketafrica.com : nous cherchons une solution écrite avant
          toute autre voie.
        </p>
      </Article>
    </main>
  );
}
