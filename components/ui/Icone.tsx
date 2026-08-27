/**
 * Jeu d'icônes KOLI — trait fin, sans arrière-plan.
 *
 * Les emoji ont été retirés de l'interface : leur dessin change d'un appareil
 * à l'autre (Android, iOS et Windows n'affichent pas le même 🛵), ils portent
 * une couleur qu'on ne maîtrise pas, et ils donnent un ton familier qui jure
 * avec une application qui manipule l'argent de commerçants.
 *
 * Tracé en SVG inline plutôt qu'importé d'une bibliothèque : une trentaine de
 * chemins suffisent, là où une dépendance d'icônes représente plusieurs
 * centaines de kilo-octets pour un public souvent en 3G.
 *
 * Toutes les icônes partagent la même grille 24×24, la même graisse et
 * `currentColor` : elles héritent donc de la couleur du texte et restent
 * cohérentes partout.
 */
export type NomIcone =
  // Navigation
  | "tableau"
  | "commandes"
  | "nouveau"
  | "catalogue"
  | "solde"
  | "profil"
  | "utilisateurs"
  | "vendeurs"
  | "livraisons"
  | "deconnexion"
  // Domaine
  | "colis"
  | "recu"
  | "etiquette"
  | "boutique"
  | "client"
  | "livreur"
  | "bouclier"
  | "cadenas"
  | "lien"
  | "telephone"
  | "position"
  | "argent"
  | "document"
  | "journal"
  | "pourcentage"
  | "telechargement"
  | "partage"
  | "message"
  | "cloche"
  // États
  | "valide"
  | "alerte"
  | "info"
  | "horloge"
  | "eclair"
  | "etoile"
  | "recherche"
  | "plus"
  | "fleche-droite"
  | "fermer";

const CHEMINS: Record<NomIcone, string> = {
  // ── Navigation ────────────────────────────────────────
  tableau:
    "M4 5.5A1.5 1.5 0 015.5 4h4A1.5 1.5 0 0111 5.5v4A1.5 1.5 0 019.5 11h-4A1.5 1.5 0 014 9.5v-4zm9 0A1.5 1.5 0 0114.5 4h4A1.5 1.5 0 0120 5.5v2A1.5 1.5 0 0118.5 9h-4A1.5 1.5 0 0113 7.5v-2zm0 9a1.5 1.5 0 011.5-1.5h4A1.5 1.5 0 0120 14.5v4a1.5 1.5 0 01-1.5 1.5h-4a1.5 1.5 0 01-1.5-1.5v-4zm-9 2A1.5 1.5 0 015.5 15h4a1.5 1.5 0 011.5 1.5v2A1.5 1.5 0 019.5 20h-4A1.5 1.5 0 014 18.5v-2z",
  commandes:
    "M3.5 7.5A2.5 2.5 0 016 5h3.2c.5 0 .98.2 1.34.55l.9.9c.36.35.84.55 1.34.55H18a2.5 2.5 0 012.5 2.5v7A2.5 2.5 0 0118 19H6a2.5 2.5 0 01-2.5-2.5v-9z",
  nouveau: "M12 5v14M5 12h14",
  catalogue:
    "M4 7.5A2.5 2.5 0 016.5 5h11A2.5 2.5 0 0120 7.5v9a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 16.5v-9zM4 10h16M9 5v14",
  solde:
    "M3.5 8.5A2.5 2.5 0 016 6h12a2.5 2.5 0 012.5 2.5v7A2.5 2.5 0 0118 18H6a2.5 2.5 0 01-2.5-2.5v-7zM3.5 10.5h17M16 14.5h1.5",
  profil: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0",
  utilisateurs:
    "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 19.5a6.5 6.5 0 0113 0M16 11.5a3 3 0 100-6M17.5 19.5a5.6 5.6 0 00-1.2-3.4",
  vendeurs:
    "M4 9.5L5.5 5h13L20 9.5M4 9.5h16M4 9.5a2.5 2.5 0 005 0 2.5 2.5 0 005 0 2.5 2.5 0 005 0M5.5 12v6.5h13V12",
  livraisons:
    "M3 7.5h9v8H3v-8zM12 10h3.8l2.7 2.7v2.8H12V10zM7 18.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17 18.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  deconnexion: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",

  // ── Domaine ───────────────────────────────────────────
  colis:
    "M12 3.5l8 4.2v8.6l-8 4.2-8-4.2V7.7l8-4.2zM4 7.7l8 4.3 8-4.3M12 12v8.5",
  recu:
    "M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4v-17zM9 8h6M9 12h6M9 16h3",
  etiquette:
    "M11 3.5H5.5A1.5 1.5 0 004 5v5.5a2 2 0 00.6 1.4l7 7a2 2 0 002.8 0l5.5-5.5a2 2 0 000-2.8l-7-7A2 2 0 0011 3.5zM8 8.5h.01",
  boutique:
    "M4 9.5L5.5 5h13L20 9.5M4 9.5h16M4 9.5a2.5 2.5 0 005 0 2.5 2.5 0 005 0 2.5 2.5 0 005 0M5.5 12v6.5h13V12M10 18.5V14h4v4.5",
  client: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0",
  livreur:
    "M6.5 18.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM17.5 18.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM9 16h6M14 6h3l2 5M14 6l-3 10M7 9h5",
  bouclier: "M12 3.5l7 2.6v5.3c0 4-2.9 7.5-7 9.1-4.1-1.6-7-5.1-7-9.1V6.1l7-2.6z",
  cadenas:
    "M6.5 10.5h11a1.5 1.5 0 011.5 1.5v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 015 19v-7a1.5 1.5 0 011.5-1.5zM8 10.5V7.5a4 4 0 018 0v3M12 14.5v2.5",
  lien: "M10 13.5a3.5 3.5 0 005 0l3-3a3.5 3.5 0 00-5-5l-1 1M14 10.5a3.5 3.5 0 00-5 0l-3 3a3.5 3.5 0 005 5l1-1",
  telephone:
    "M6.5 4h3l1.5 3.8-2 1.4a11 11 0 005.8 5.8l1.4-2 3.8 1.5v3a1.7 1.7 0 01-1.9 1.7A15.5 15.5 0 015 6a1.7 1.7 0 011.5-2z",
  position: "M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  argent:
    "M12 3.5v17M15.5 7.5c-.7-1-2-1.6-3.5-1.6-2.2 0-3.6 1.1-3.6 2.7 0 4 7.4 2.2 7.4 6.3 0 1.7-1.6 2.8-3.9 2.8-1.7 0-3.1-.6-3.9-1.7",
  document:
    "M13.5 3.5H7A1.5 1.5 0 005.5 5v14A1.5 1.5 0 007 20.5h10a1.5 1.5 0 001.5-1.5V8.5l-5-5zM13.5 3.5v5h5M9 13h6M9 16.5h4",
  // Registre : un grand livre ouvert, avec ses lignes d'écriture.
  journal:
    "M4 5.5A1.5 1.5 0 015.5 4H10a2 2 0 012 2v13a2 2 0 00-2-2H5.5A1.5 1.5 0 014 15.5v-10zM20 5.5A1.5 1.5 0 0018.5 4H14a2 2 0 00-2 2v13a2 2 0 012-2h4.5a1.5 1.5 0 001.5-1.5v-10z",
  pourcentage:
    "M6.5 6.5h.01M17.5 17.5h.01M18.5 5.5l-13 13M8.5 6.5a2 2 0 11-4 0 2 2 0 014 0zM19.5 17.5a2 2 0 11-4 0 2 2 0 014 0z",
  // Flèche vers un plateau : le geste « enregistrer sur mon appareil ».
  telechargement: "M12 3.5v11m0 0l-4-4m4 4l4-4M4.5 16v2.5A2 2 0 006.5 20.5h11a2 2 0 002-2V16",
  // Trois nœuds reliés, la convention du partage.
  partage:
    "M8.7 13.1l6.6 3.8M15.3 7.1l-6.6 3.8M18 7a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM6 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18 22a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  message:
    "M20 12a8 8 0 01-8 8H4.5l2-3.2A8 8 0 1120 12zM9 11.5h.01M12 11.5h.01M15 11.5h.01",
  // Cloche : la convention universelle des notifications.
  cloche:
    "M18 8.5a6 6 0 10-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5zM13.7 19a2 2 0 01-3.4 0",

  // ── États ─────────────────────────────────────────────
  valide: "M12 21a9 9 0 100-18 9 9 0 000 18zM8.5 12.2l2.4 2.4 4.6-4.9",
  alerte: "M12 9v4.5M12 17h.01M10.3 4.2L2.9 17a2 2 0 001.7 3h14.8a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z",
  info: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01",
  horloge: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7.5V12l3 1.8",
  eclair: "M13.5 3L5 13.5h6L10.5 21 19 10.5h-6L13.5 3z",
  // Etoile pleine a cinq branches, tracee sur la meme grille de 24 que le
  // reste du jeu — une etoile importee d ailleurs aurait une graisse de trait
  // differente et se verrait a cote des autres.
  etoile:
    "M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9L12 3.5z",
  recherche: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4",
  plus: "M12 5v14M5 12h14",
  "fleche-droite": "M5 12h14M13 6l6 6-6 6",
  fermer: "M6 6l12 12M18 6L6 18",
};

export function Icone({
  nom,
  className = "w-5 h-5",
  titre,
  plein = false,
}: {
  nom: NomIcone;
  className?: string;
  /** À renseigner seulement si l'icône porte une information à elle seule. */
  titre?: string;
  /**
   * Pleine plutôt qu'en trait.
   *
   * Le jeu entier est dessiné au trait, et c'est ce qui lui donne son unité.
   * Une NOTE fait exception : cinq étoiles creuses ne se distinguent de cinq
   * étoiles vides que par la couleur, ce qui exclut les daltoniens et se voit
   * mal en plein soleil. Une étoile acquise doit être PLEINE.
   */
  plein?: boolean;
}) {
  return (
    <svg
      data-icone=""
      className={className}
      viewBox="0 0 24 24"
      fill={plein ? "currentColor" : "none"}
      stroke={plein ? "none" : "currentColor"}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={titre ? "img" : undefined}
      aria-label={titre}
      aria-hidden={titre ? undefined : true}
    >
      <path d={CHEMINS[nom]} />
    </svg>
  );
}

/** Ancien nom, conservé pour le menu latéral. */
export const IconeNav = Icone;
