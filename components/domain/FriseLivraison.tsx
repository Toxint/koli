import { Icone } from "@/components/ui/Icone";
import { JALONS, indiceJalon } from "@/lib/deliveries/jalons";
import type { OrderStatus } from "@prisma/client";

const HEURE_FR = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Frise de suivi (§26).
 *
 * Entre l'expédition et la remise, le client n'avait **aucun moyen de savoir
 * où était son colis**. Il pouvait seulement constater qu'il n'était pas
 * arrivé.
 *
 * Verticale et non horizontale : sur un écran de 320px, six étapes côte à côte
 * réduisent chaque libellé à deux mots illisibles. En colonne, chacune garde
 * sa phrase.
 *
 * L'étape en cours est la seule à porter son explication en clair. Afficher le
 * détail des six ferait un mur de texte où l'information utile — « où en
 * est-on maintenant » — se perdrait.
 */
export function FriseLivraison({
  statut,
  horodatages,
}: {
  statut: OrderStatus;
  /** Dates réelles des jalons franchis, quand elles sont connues. */
  horodatages?: Partial<Record<string, Date | null>>;
}) {
  const courant = indiceJalon(statut);

  // -1 : litige, remboursement, échec. Montrer un colis « en route » à
  // quelqu'un dont la commande est contestée serait faux.
  if (courant === -1) return null;

  return (
    <ol className="space-y-0">
      {JALONS.map((jalon, i) => {
        const franchi = i < courant;
        const actuel = i === courant;
        const quand = horodatages?.[jalon.code];

        return (
          <li key={jalon.code} className="flex gap-3">
            {/* Colonne du repère : pastille + trait de liaison. Le trait est
                dans le flux, pas en position absolue, pour qu'il suive la
                hauteur réelle d'une étape dont le texte passe à la ligne. */}
            <div className="flex flex-col items-center shrink-0">
              <span
                aria-hidden="true"
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 ${
                  franchi
                    ? "bg-brand border-brand text-white"
                    : actuel
                      ? "bg-white border-brand text-brand"
                      : "bg-white border-hairline text-hairline"
                }`}
              >
                {franchi ? (
                  <Icone nom="valide" className="w-4 h-4" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-current" />
                )}
              </span>

              {i < JALONS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`w-0.5 flex-1 min-h-[1.5rem] ${
                    franchi ? "bg-brand" : "bg-hairline"
                  }`}
                />
              )}
            </div>

            <div className={`min-w-0 pb-4 ${i === JALONS.length - 1 ? "pb-0" : ""}`}>
              <p
                className={`text-sm ${
                  actuel
                    ? "font-bold text-brand"
                    : franchi
                      ? "font-medium"
                      : "text-ink-muted"
                }`}
              >
                {jalon.libelleClient}
                {actuel && (
                  <span className="sr-only"> — étape en cours</span>
                )}
              </p>

              {actuel && jalon.detailClient && (
                <p className="text-xs text-ink-muted mt-0.5">
                  {jalon.detailClient}
                </p>
              )}

              {quand && (
                <p className="text-xs text-ink-muted mt-0.5">
                  {HEURE_FR.format(quand)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
