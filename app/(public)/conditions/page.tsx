import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
};

/**
 * Volontairement une page d'attente, et non de fausses conditions.
 *
 * Le §84 du cahier des charges subordonne le cadre contractuel a
 * l'identification du pays, du partenaire financier agree et des services
 * autorises. Rediger ici des conditions inventees serait trompeur — et
 * juridiquement inutile.
 */
export default function ConditionsPage() {
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

      <div className="mt-6 bg-test-mode-surface dark:bg-amber-950/60 border border-brand-border dark:border-amber-800 rounded-2xl p-6">
        <p className="font-bold text-test-mode dark:text-amber-300">
          ⚡ Document en cours de préparation
        </p>
        <p className="mt-2 text-sm text-brand dark:text-slate-300">
          KOLI fonctionne actuellement en mode test : aucun paiement réel
          n&apos;est effectué et aucun fonds n&apos;est détenu.
        </p>
      </div>

      <p className="mt-6 text-sm text-ink-muted dark:text-slate-300">
        Les conditions d&apos;utilisation définitives seront publiées une fois
        arrêtés le pays d&apos;exploitation, le partenaire financier agréé et le
        cadre réglementaire applicable. Elles préciseront notamment les
        modalités de conservation et de libération des paiements, la procédure
        de litige, les remboursements et la répartition des responsabilités
        entre KOLI, les vendeurs, les livreurs et les acheteurs.
      </p>

      <p className="mt-4 text-sm text-ink-muted dark:text-slate-300">
        En attendant, l&apos;utilisation de la plateforme relève de la
        démonstration et ne crée aucun engagement financier.
      </p>
    </main>
  );
}
