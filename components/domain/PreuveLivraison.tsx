import type { PreuveLivraison as Preuve } from "@/lib/deliveries/preuve";

const DATE_FR = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
});

/**
 * Preuve de livraison (§28) — code de réception, date et heure, livreur.
 *
 * Le code affiché est celui qui a été **consommé** au moment de la remise :
 * c'est précisément ce qui fait la preuve, puisque seul le client le
 * détenait (§27). Un code consommé n'ouvre plus rien, le montrer ne donne
 * donc aucun pouvoir.
 */
export function PreuveLivraison({
  preuve,
  compact = false,
}: {
  preuve: Preuve;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <p className="text-xs text-ink-muted">
        Remis le {DATE_FR.format(preuve.date)}
        {preuve.livreur ? ` par ${preuve.livreur}` : ""} · code{" "}
        <span className="font-mono font-semibold">{preuve.code}</span>
      </p>
    );
  }

  return (
    <section
      aria-labelledby="titre-preuve"
      className="carte-koli bg-white rounded-2xl p-5 sm:p-6"
    >
      <div className="flex items-center gap-2 mb-3">
        <span aria-hidden="true" className="text-xl">
          🧾
        </span>
        <h2 id="titre-preuve" className="text-base font-semibold">
          Preuve de livraison
        </h2>
      </div>

      <dl className="divide-y divide-hairline">
        <div className="flex justify-between gap-4 py-2">
          <dt className="text-xs text-ink-muted shrink-0">Remis le</dt>
          <dd className="text-sm font-medium text-right">
            <time dateTime={preuve.date.toISOString()}>
              {DATE_FR.format(preuve.date)}
            </time>
          </dd>
        </div>

        <div className="flex justify-between gap-4 py-2">
          <dt className="text-xs text-ink-muted shrink-0">Livreur</dt>
          <dd className="text-sm font-medium text-right break-words min-w-0">
            {preuve.livreur ?? "Non renseigné"}
            {preuve.vehicule && (
              <span className="block text-xs text-ink-muted font-normal">
                {preuve.vehicule}
              </span>
            )}
          </dd>
        </div>

        <div className="flex justify-between gap-4 py-2">
          <dt className="text-xs text-ink-muted shrink-0">
            Code de réception
          </dt>
          <dd className="text-sm font-mono font-semibold text-right">
            {preuve.code}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-ink-muted">
        Ce code n&apos;était connu que du client. Sa saisie par le livreur
        atteste que le colis a bien été remis en main propre.
      </p>

      {/* §28 : signature, photo et géolocalisation sont prévues. Tant qu'elles
          ne sont pas collectées, on le dit plutôt que de laisser croire à une
          preuve plus complète qu'elle ne l'est. */}
      {!preuve.signatureUrl && !preuve.photoUrl && !preuve.latitude && (
        <p className="mt-1 text-xs text-ink-muted">
          Signature, photo et position ne sont pas encore collectées.
        </p>
      )}
    </section>
  );
}
