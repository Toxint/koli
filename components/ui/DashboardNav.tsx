"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icone } from "@/components/ui/Icone";
import { BoutonDeconnexion } from "@/components/ui/BoutonDeconnexion";
import type { NavItem } from "@/lib/navigation";
import { LogoKoli } from "@/components/ui/LogoKoli";

export type { NavItem };

interface DashboardNavProps {
  userName: string;
  roleName: string;
  roleBadgeColor?: string;
  /** Accueil de l'espace : le logo y renvoie, pas vers le site public. */
  homeHref: string;
  /** Uniquement des routes existantes — un lien mort est pire que pas de lien. */
  navItems?: NavItem[];
  /**
   * Compteur de notifications non lues (§45).
   *
   * Calculé par la page — un composant client ne peut pas interroger la base,
   * et le compteur doit être juste au premier rendu : affiché à zéro puis
   * corrigé après coup, il ferait manquer ce qui vient d'arriver.
   */
  notificationsNonLues?: number;
}

/** Doit rester identique à la valeur lue par le script anti-scintillement. */
const CLE_REPLI = "koli-menu-replie";
const LARGEUR_OUVERT = "15.5rem";
const LARGEUR_REPLIE = "4.75rem";

/**
 * L'état du repli vit sur `<html>`, pas dans React.
 *
 * C'est le script du `layout` qui le pose avant la première peinture, pour
 * éviter le sursaut de mise en page. React doit donc le *lire* plutôt que
 * l'inventer — d'où `useSyncExternalStore`, qui sait justement s'abonner à un
 * état extérieur sans provoquer de désaccord entre le rendu serveur et le
 * rendu client.
 */
const abonnes = new Set<() => void>();

function sAbonnerAuRepli(rappel: () => void) {
  abonnes.add(rappel);
  return () => {
    abonnes.delete(rappel);
  };
}

function lireRepli(): boolean {
  return document.documentElement.dataset.menuKoliReplie === "1";
}

/** Au rendu serveur, le menu est toujours déployé : il n'y a pas de DOM. */
function lireRepliServeur(): boolean {
  return false;
}

/**
 * Menu latéral des espaces connectés (§10).
 *
 * Fixe à gauche à partir de 1024px, tiroir glissant en dessous.
 *
 * **Largeur pilotée par `--largeur-menu`**, et non par une classe figée : les
 * quinze pages réservent la place avec `lg:pl-[var(--largeur-menu)]`, si bien
 * que replier la barre fait respirer le contenu sans qu'aucune page ait à le
 * savoir. La barre étant `fixed`, elle sort du flux et recouvrirait sinon le
 * contenu.
 */
export function DashboardNav({
  userName,
  roleName,
  homeHref,
  navItems = [],
  notificationsNonLues = 0,
}: DashboardNavProps) {
  const [tiroirOuvert, setTiroirOuvert] = useState(false);
  const chemin = usePathname();

  const replie = useSyncExternalStore(
    sAbonnerAuRepli,
    lireRepli,
    lireRepliServeur
  );

  const basculerRepli = useCallback(() => {
    const racine = document.documentElement;
    const apres = racine.dataset.menuKoliReplie !== "1";

    racine.style.setProperty(
      "--largeur-menu",
      apres ? LARGEUR_REPLIE : LARGEUR_OUVERT
    );
    racine.dataset.menuKoliReplie = apres ? "1" : "0";

    try {
      localStorage.setItem(CLE_REPLI, apres ? "1" : "0");
    } catch {
      // Navigation privée, stockage refusé : le repli vaut pour cette page,
      // il ne sera simplement pas mémorisé.
    }

    for (const rappel of abonnes) rappel();
  }, []);

  /**
   * Entrée active = le plus long préfixe correspondant.
   *
   * Une simple comparaison `startsWith` allumerait « Commandes » ET
   * « Nouvelle commande » sur /vendeur/commandes/nouvelle ; l'égalité stricte,
   * elle, n'allumerait rien sur /vendeur/produits/<id>.
   */
  const hrefActif = navItems
    .filter((i) => chemin === i.href || chemin.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  // Fermeture au clavier (§69) : un tiroir qui ne se ferme qu'à la souris
  // piège l'utilisateur au clavier.
  useEffect(() => {
    if (!tiroirOuvert) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTiroirOuvert(false);
    };
    document.addEventListener("keydown", surTouche);
    // Le fond ne doit pas défiler sous le tiroir.
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = avant;
    };
  }, [tiroirOuvert]);

  const initiales = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? "")
    .join("");

  const hrefProfil =
    navItems.find((i) => i.icone === "profil")?.href ?? homeHref;

  /**
   * `compact` : rendu réduit aux icônes. Le tiroir mobile reste toujours
   * complet — replier n'a de sens que pour gagner de la place sur un grand
   * écran, pas sur un panneau qui recouvre déjà tout.
   */
  const contenu = (compact: boolean) => (
    <div
      data-menu-koli=""
      className="flex h-full flex-col gap-3 bg-menu bg-gradient-to-b from-menu to-menu-deep px-3 py-3 lg:rounded-3xl"
    >
      {/* Replié, le logo et le bouton s'empilent : à 4,75rem de large, les
          poser côte à côte les écraserait l'un contre l'autre. */}
      <div
        className={`flex shrink-0 ${
          compact
            ? "flex-col items-center gap-1"
            : "items-center justify-between gap-2"
        }`}
      >
        <Link
          href={homeHref}
          aria-label="Accueil de mon espace KOLI"
          onClick={() => setTiroirOuvert(false)}
          className="flex items-center gap-2.5 min-h-[44px] group"
        >
          {/* Variante CLAIRE : le menu est en violet profond, une marque
              violette y disparaitrait. */}
          <LogoKoli
            taille={36}
            variante="claire"
            className="shrink-0 transition-transform group-hover:scale-105"
          />
          {!compact && (
            <span className="font-bold text-xl tracking-tight text-white">
              KOLI
            </span>
          )}
        </Link>

        {/* Le repli n'existe qu'à partir du laptop : sous 1024px, le menu est
            un tiroir qui se ferme déjà entièrement. */}
        <button
          type="button"
          onClick={basculerRepli}
          aria-expanded={!compact}
          aria-label={compact ? "Déployer le menu" : "Replier le menu"}
          title={compact ? "Déployer le menu" : "Replier le menu"}
          className="hidden lg:flex items-center justify-center min-h-[36px] min-w-[36px] rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Icone
            nom="fleche-droite"
            className={`w-4 h-4 transition-transform ${compact ? "" : "rotate-180"}`}
          />
        </button>
      </div>

      {/* Carte d'identité : rappelle en permanence sous quel compte on agit —
          un vendeur et un administrateur ne voient pas les mêmes montants. */}
      <Link
        href={hrefProfil}
        onClick={() => setTiroirOuvert(false)}
        title={compact ? `${userName} — ${roleName}` : undefined}
        className={`flex items-center gap-3 shrink-0 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 min-h-[44px] transition-colors ${
          compact ? "justify-center p-2" : "px-3 py-2.5"
        }`}
      >
        <span
          aria-hidden="true"
          className="w-9 h-9 shrink-0 rounded-full bg-gold text-menu-deep flex items-center justify-center font-bold text-sm"
        >
          {initiales || "K"}
        </span>
        {!compact && (
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white truncate">
              {userName}
            </span>
            <span className="block text-[11px] text-white/70 truncate">
              {roleName} · Voir mon profil
            </span>
          </span>
        )}
      </Link>

      {/*
       * `min-h-0` + `overflow-y-auto` : SANS eux, le panneau débordait et le
       * bloc du bas — dont la DÉCONNEXION — sortait de l'écran sans aucun
       * moyen d'y accéder. Le défaut est apparu en ajoutant une septième
       * entrée au menu vendeur : sous ~670px de hauteur de fenêtre, le bouton
       * devenait purement et simplement inatteignable.
       */}
      {/*
       * `pr-1` en mode deploye : la barre de defilement se pose ainsi A
       * L'INTERIEUR du panneau, ecartee de son bord arrondi, au lieu de venir
       * s'y ecraser. Replie, la colonne ne fait que 4,75rem et les icones sont
       * centrees — la moindre marge a droite les decalerait visiblement.
       *
       * `pb-1` evite que la derniere rubrique touche le bas une fois la liste
       * defilee jusqu'au bout.
       */}
      <nav
        aria-label="Navigation de l'espace"
        className={`defilement-menu min-w-0 flex-1 min-h-0 overflow-y-auto pb-1 ${
          compact ? "" : "pr-1"
        }`}
      >
        {!compact && (
          <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
            Espace {roleName.toLowerCase()}
          </p>
        )}
        <ul className="space-y-1">
          {navItems.map((item) => {
            const actif = item.href === hrefActif;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setTiroirOuvert(false)}
                  aria-current={actif ? "page" : undefined}
                  title={compact ? item.label : undefined}
                  className={`flex items-center gap-3 rounded-2xl min-h-[44px] text-sm font-semibold transition-colors ${
                    compact ? "justify-center px-2" : "px-3"
                  } ${
                    actif
                      ? "bg-white text-ink shadow-sm"
                      : "text-white/75 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icone nom={item.icone} className="w-5 h-5 shrink-0" />
                  {compact ? (
                    <span className="sr-only">{item.label}</span>
                  ) : (
                    <span className="truncate">{item.label}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-2 shrink-0">
        {/* Notifications (§45) — au-dessus du bloc du bas, donc visible depuis
            toutes les pages de l'espace sans avoir à défiler la liste des
            rubriques. */}
        <Link
          href="/notifications"
          onClick={() => setTiroirOuvert(false)}
          aria-current={chemin === "/notifications" ? "page" : undefined}
          title={
            compact
              ? notificationsNonLues > 0
                ? `Notifications — ${notificationsNonLues} non lue(s)`
                : "Notifications"
              : undefined
          }
          className={`relative flex items-center gap-3 rounded-2xl min-h-[44px] text-sm font-semibold transition-colors ${
            compact ? "justify-center px-2" : "px-3"
          } ${
            chemin === "/notifications"
              ? "bg-white text-ink shadow-sm"
              : "text-white/75 hover:bg-white/10 hover:text-white"
          }`}
        >
          <Icone nom="cloche" className="w-5 h-5 shrink-0" />

          {compact ? (
            <span className="sr-only">
              Notifications
              {notificationsNonLues > 0
                ? ` — ${notificationsNonLues} non lue(s)`
                : ""}
            </span>
          ) : (
            <span className="truncate">Notifications</span>
          )}

          {notificationsNonLues > 0 && (
            /* Pastille : en mode replié elle se pose sur l'icône, sinon elle
               s'aligne à droite. Le nombre est plafonné à « 9+ » — au-delà,
               le chiffre exact n'aide plus et déborde de la pastille. */
            <span
              aria-hidden="true"
              className={`min-w-[20px] h-5 px-1.5 rounded-full bg-gold text-menu-deep text-[11px] font-bold flex items-center justify-center ${
                compact ? "absolute top-1 right-1" : "ml-auto"
              }`}
            >
              {notificationsNonLues > 9 ? "9+" : notificationsNonLues}
            </span>
          )}
        </Link>

        {/*
          * §75 : l'indicateur de mode test reste visible à toutes les tailles.
          *
          * `data-mention-test` le fait DISPARAITRE des que le paiement devient
          * reel — voir la regle dans `app/globals.css`. Ce composant est appele
          * depuis vingt-sept pages : lui passer un prop, c'etait vingt-sept
          * occasions d'en oublier une, et la page oubliee aurait annonce
          * « aucun paiement reel » pendant qu'on preleve.
          */}
        <div
          data-mention-test=""
          title={compact ? "Mode test — aucun paiement réel" : undefined}
          className={`rounded-2xl bg-white/10 border border-gold/30 ${
            compact ? "flex justify-center p-2" : "px-3 py-2"
          }`}
        >
          {compact ? (
            <>
              <Icone nom="eclair" className="w-4 h-4 text-gold" />
              <span className="sr-only">Mode test — aucun paiement réel</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gold">
                <Icone nom="eclair" className="w-3.5 h-3.5" /> Mode test
              </span>
              <span className="block text-[11px] text-white/70 leading-tight">
                Aucun paiement réel
              </span>
            </>
          )}
        </div>

        <BoutonDeconnexion nomCompte={userName} compact={compact} />
      </div>
    </div>
  );

  return (
    <>
      {/* Barre latérale permanente à partir du laptop. Sa largeur suit
          `--largeur-menu`, que le bouton de repli modifie. */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-[var(--largeur-menu)] z-40 p-2 transition-[width] duration-200">
        {contenu(replie)}
      </aside>

      {/* En-tête compact sur mobile et tablette. */}
      <header className="lg:hidden sticky top-0 z-30 bg-menu bg-gradient-to-r from-menu to-menu-deep">
        <div className="px-4 h-16 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setTiroirOuvert(true)}
            aria-expanded={tiroirOuvert}
            aria-controls="tiroir-menu"
            aria-label="Ouvrir le menu"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 text-white"
          >
            <svg
              className="w-5 h-5"
              aria-hidden="true"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link
            href={homeHref}
            aria-label="Accueil de mon espace KOLI"
            className="flex items-center gap-2 min-h-[44px]"
          >
            <LogoKoli taille={32} variante="claire" className="shrink-0" />
            <span className="font-bold text-lg tracking-tight text-white">
              KOLI
            </span>
          </Link>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* La cloche aussi dans l'en-tête : sur téléphone la barre latérale
                est cachée, et il faudrait sinon ouvrir le tiroir pour découvrir
                qu'une commande a été payée. */}
            <Link
              href="/notifications"
              aria-label={
                notificationsNonLues > 0
                  ? `Notifications — ${notificationsNonLues} non lue(s)`
                  : "Notifications"
              }
              className="relative min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 text-white"
            >
              <Icone nom="cloche" className="w-5 h-5" />
              {notificationsNonLues > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-menu-deep text-[10px] font-bold flex items-center justify-center"
                >
                  {notificationsNonLues > 9 ? "9+" : notificationsNonLues}
                </span>
              )}
            </Link>

            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 text-gold text-[11px] font-semibold border border-gold/30 whitespace-nowrap">
              <Icone nom="eclair" className="w-3.5 h-3.5" /> Test
            </span>
          </div>
        </div>
      </header>

      {tiroirOuvert && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Voile cliquable : fermer en touchant à côté est le geste attendu. */}
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setTiroirOuvert(false)}
            className="absolute inset-0 bg-menu-deep/60"
          />
          <div
            id="tiroir-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de l'espace"
            className="relative w-[15.5rem] max-w-[85vw] h-full animate-tiroir"
          >
            {/* Le tiroir reste toujours complet : replier n'a de sens que pour
                gagner de la place sur un grand écran. */}
            {contenu(false)}
          </div>
        </div>
      )}
    </>
  );
}
