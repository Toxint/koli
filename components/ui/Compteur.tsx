/**
 * Un compteur de tableau de bord : un libellé, un chiffre, une note.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Il existe parce que ces cartes étaient recopiées sur quatre tableaux de │
 * │  bord — vendeur, client, livreur, administration — et qu'elles avaient   │
 * │  divergé : deux arrondis, trois graisses, deux couleurs de libellé, et   │
 * │  un `hover:border-amber-400` orphelin sur une seule d'entre elles.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Trois décisions, et chacune se déferait sans être écrite :
 *
 * - **`min-w-0` est indispensable, pas décoratif.** Un montant assemblé par
 *   `formatMontant` est un bloc INSÉCABLE — espaces insécables entre les
 *   groupes de chiffres et avant le symbole. Dans une grille, un élément
 *   refuse par défaut de descendre sous la largeur de son contenu
 *   (`min-width: auto`) : sans lui, la carte pousse la grille, qui pousse la
 *   page, et c'est le document qui défile (§8).
 *
 * - **`[overflow-wrap:anywhere]` sur la valeur, en dernier recours.** Il ne
 *   s'exerce que si le texte ne rentre toujours pas. Un montant énorme casse
 *   alors au lieu de déborder — laid, mais borné ; le défilement horizontal,
 *   lui, ne l'est pas.
 *
 * - **L'animation porte sur le CHIFFRE, jamais sur la carte.** C'est la valeur
 *   qu'on vient chercher en ouvrant la page ; animer le cadre autour d'elle
 *   attirerait l'œil sur le cadre. Le libellé, lui, ne bouge pas — il doit
 *   être lisible avant que le chiffre se pose.
 */
export function Compteur({
  libelle,
  valeur,
  note,
  accent = false,
}: {
  libelle: string;
  /** Déjà mis en forme — le composant ne sait rien des devises. */
  valeur: string;
  note?: string;
  /**
   * `accent` réserve le violet de la marque aux mesures d'ARGENT. Tout mettre
   * en violet reviendrait à ne rien distinguer ; un nombre de commandes n'a
   * pas à crier aussi fort qu'un solde.
   */
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-hairline bg-white p-4 shadow-sm sm:p-5">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted">
        {libelle}
      </span>
      <div
        className={`animate-compteur mt-1 text-2xl font-extrabold [overflow-wrap:anywhere] ${
          accent ? "text-brand" : "text-heading"
        }`}
      >
        {valeur}
      </div>
      {note && <p className="mt-1 text-[11px] text-ink-muted">{note}</p>}
    </div>
  );
}
