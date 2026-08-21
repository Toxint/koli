/**
 * Jeu d'icones du menu lateral.
 *
 * Trace en SVG inline plutot qu'importe d'une bibliotheque : quatre traits
 * suffisent, et une dependance d'icones represente plusieurs centaines de
 * kilo-octets pour un public souvent en 3G.
 */
export type NomIcone =
  | "tableau"
  | "commandes"
  | "nouveau"
  | "catalogue"
  | "solde"
  | "profil"
  | "utilisateurs"
  | "vendeurs"
  | "livraisons";

const CHEMINS: Record<NomIcone, string> = {
  tableau:
    "M4 5.5A1.5 1.5 0 015.5 4h4A1.5 1.5 0 0111 5.5v4A1.5 1.5 0 019.5 11h-4A1.5 1.5 0 014 9.5v-4zm9 0A1.5 1.5 0 0114.5 4h4A1.5 1.5 0 0120 5.5v2A1.5 1.5 0 0118.5 9h-4A1.5 1.5 0 0113 7.5v-2zm0 9a1.5 1.5 0 011.5-1.5h4A1.5 1.5 0 0120 14.5v4a1.5 1.5 0 01-1.5 1.5h-4a1.5 1.5 0 01-1.5-1.5v-4zm-9 2A1.5 1.5 0 015.5 15h4a1.5 1.5 0 011.5 1.5v2A1.5 1.5 0 019.5 20h-4A1.5 1.5 0 014 18.5v-2z",
  commandes:
    "M3.5 7.5A2.5 2.5 0 016 5h3.2c.5 0 .98.2 1.34.55l.9.9c.36.35.84.55 1.34.55H18a2.5 2.5 0 012.5 2.5v7A2.5 2.5 0 0118 19H6a2.5 2.5 0 01-2.5-2.5v-9z",
  nouveau: "M12 5v14M5 12h14",
  catalogue:
    "M4 7.5A2.5 2.5 0 016.5 5h11A2.5 2.5 0 0120 7.5v9a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 16.5v-9zM4 10h16M9 5v14",
  solde:
    "M3.5 8.5A2.5 2.5 0 016 6h12a2.5 2.5 0 012.5 2.5v7A2.5 2.5 0 0118 18H6a2.5 2.5 0 01-2.5-2.5v-7zM3.5 10.5h17M16 14.5h1.5",
  profil:
    "M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0",
  utilisateurs:
    "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 19.5a6.5 6.5 0 0113 0M16 11.5a3 3 0 100-6M17.5 19.5a5.6 5.6 0 00-1.2-3.4",
  vendeurs:
    "M4 9.5L5.5 5h13L20 9.5M4 9.5h16M4 9.5a2.5 2.5 0 005 0 2.5 2.5 0 005 0 2.5 2.5 0 005 0M5.5 12v6.5h13V12",
  livraisons:
    "M3 7.5h9v8H3v-8zM12 10h3.8l2.7 2.7v2.8H12V10zM7 18.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17 18.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
};

export function IconeNav({
  nom,
  className = "w-5 h-5",
}: {
  nom: NomIcone;
  className?: string;
}) {
  return (
    <svg
      className={className}
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={CHEMINS[nom]} />
    </svg>
  );
}
