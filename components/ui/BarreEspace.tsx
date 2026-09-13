"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icone } from "@/components/ui/Icone";
import { BoutonDeconnexion } from "@/components/ui/BoutonDeconnexion";
import { LogoKoli } from "@/components/ui/LogoKoli";
import type { NavItem } from "@/lib/navigation";

export type { NavItem };

/**
 * La barre HORIZONTALE des espaces connectés.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Elle remplace le menu latéral sombre : l'application vit désormais dans │
 * │  une carte blanche posée sur le fond, comme la maquette de référence.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Trois choses qu'elle doit à l'ancienne, et qui se perdraient sans être
 * écrites :
 *
 *   · le **compteur de notifications** doit être juste au premier rendu — il
 *     est calculé côté serveur par `MenuEspace` et descendu en prop ;
 *   · la **mention « mode test »** porte `data-mention-test`, la garde qui la
 *     fait disparaître dès que le paiement devient réel (§8). Un menu appelé
 *     depuis vingt-sept pages ne peut pas dépendre d'un prop qu'on oublierait ;
 *   · l'entrée **active** est le plus long préfixe correspondant, sans quoi
 *     « Commandes » et « Nouvelle commande » s'allument ensemble.
 */

interface BarreEspaceProps {
  userName: string;
  roleName: string;
  /** Accueil de l'espace : le logo y renvoie, pas vers le site public. */
  homeHref: string;
  navItems?: NavItem[];
  /** Calculé par la page — un composant client ne peut pas lire la base. */
  notificationsNonLues?: number;
}

export function BarreEspace({
  userName,
  roleName,
  homeHref,
  navItems = [],
  notificationsNonLues = 0,
}: BarreEspaceProps) {
  const chemin = usePathname();
  const compte = useRef<HTMLDetailsElement>(null);


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

  const initiales = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? "")
    .join("");

  const hrefProfil =
    navItems.find((i) => i.icone === "profil")?.href ?? homeHref;

  /*
   * Trois familles, et le partage n'est pas cosmétique.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │  Une colonne verticale accepte onze entrées ; un ruban horizontal,   │
   * │  non. Mesuré à 1280 px : 1351 px de contenu pour 776 disponibles.    │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * Le ruban garde ce qu'on ouvre chaque jour ; « Plus » recueille le reste ;
   * et l'ACTION — « Nouvelle commande » — devient un bouton, parce qu'elle ne
   * décrit pas un endroit où l'on va mais quelque chose que l'on fait.
   */
  const rubans = navItems.filter((i) => !i.secondaire && !i.action);
  const secondaires = navItems.filter((i) => i.secondaire);
  const action = navItems.find((i) => i.action);

  const classeEntree = (actif: boolean) =>
    `flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-sm font-medium transition-colors ${
      actif
        ? "bg-brand-soft text-brand font-semibold"
        : "text-ink-muted hover:bg-brand-soft/50 hover:text-brand"
    }`;

  /*
   * Le menu du compte est un `<details>`, pas un état React.
   *
   * ┌────────────────────────────────────────────────────────────────────┐
   * │  Il porte la DÉCONNEXION. Un menu qui n'existe qu'après            │
   * │  l'hydratation enfermerait quelqu'un dans son compte le temps que  │
   * │  le JavaScript arrive — sur un réseau lent, cela dure (§70).       │
   * └────────────────────────────────────────────────────────────────────┘
   *
   * `<details>` s'ouvre nativement, au clic comme au clavier, sans une ligne
   * de script. React ne sert qu'à le refermer quand on clique ailleurs ou
   * qu'on appuie sur Échap — un confort, jamais une condition.
   */
  useEffect(() => {
    const fermer = (e: Event) => {
      const d = compte.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") d.open = false;
        return;
      }
      if (e.target instanceof Node && !d.contains(e.target)) d.open = false;
    };
    document.addEventListener("click", fermer);
    document.addEventListener("keydown", fermer);
    return () => {
      document.removeEventListener("click", fermer);
      document.removeEventListener("keydown", fermer);
    };
  }, []);

  // La barre se referme d'elle-même quand on change de page.
  useEffect(() => {
    if (compte.current) compte.current.open = false;
  }, [chemin]);

  return (
    <header data-menu-koli="" className="px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="mx-auto max-w-[86rem] rounded-2xl border border-hairline/70 bg-white shadow-sm">
        {/*
          * ⚠ Le ruban passe SUR SA PROPRE LIGNE sous 1024 px.
          *
          * ┌──────────────────────────────────────────────────────────────────┐
          * │  Mesuré à 320 px, tout sur une ligne : logo 86 + « Plus » 69 +   │
          * │  commandes 160 = 363 px pour une fenêtre de 320. Le ruban, seul  │
          * │  élément `flex-1 min-w-0`, absorbait tout le manque et tombait à │
          * │  **0 px de large** — invisible — et la page débordait quand même.│
          * └──────────────────────────────────────────────────────────────────┘
          *
          * `flex-wrap` + `order-last w-full` le renvoient à la ligne, où il a
          * toute la largeur pour défiler. À partir de `lg:` il redevient
          * `flex-1` sur la même ligne, comme la maquette de référence.
          *
          * Il n'est rendu QU'UNE FOIS : deux rendus des mêmes entrées — un
          * pour le téléphone, un pour le bureau — finissent toujours par
          * diverger, et c'est celui qu'on regarde le moins qui ment en
          * premier.
          */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 sm:gap-x-4 sm:px-4">
          <Link
            href={homeHref}
            aria-label="Accueil de mon espace KOLI"
            /* `min-h-[44px]` : c'est un lien, donc une cible tactile. Sans
               lui il faisait 38 px — `verif:responsive` l'a refusé sur les
               vingt-deux pages d'un coup, ce qui est exactement son rôle. */
            className="order-1 flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl px-1"
          >
            <LogoKoli variante="sombre" className="h-7 w-7" />
            <span className="font-titre text-lg font-extrabold tracking-tight text-brand">
              KOLI
            </span>
          </Link>

          {/*
            * Le SAUT DE LIGNE du téléphone — un élément vide, et c'est voulu.
            *
            * ┌──────────────────────────────────────────────────────────────┐
            * │  Sous 1024 px :  [logo] ··········· [+] [cloche] [compte]    │
            * │                  [ruban qui défile ···········] [Plus ▾]     │
            * │  À partir de lg : [logo] [ruban ······] [Plus ▾] [+] [🔔] [●] │
            * └──────────────────────────────────────────────────────────────┘
            *
            * Une première version renvoyait le ruban seul à la ligne (`w-full`)
            * et laissait « Plus » en haut. Mesuré à 360 px, deux défauts :
            * la grappe de droite ne tenait plus à côté du logo et passait
            * elle-même à la ligne — trois lignes d'en-tête —, et le menu de
            * « Plus », ancré à droite d'un bouton désormais à GAUCHE, sortait
            * de l'écran par la gauche. « es livreurs », « ansactions ».
            *
            * « Plus » doit être au BORD DROIT pour s'ouvrir vers la gauche
            * sans sortir de l'écran : il termine donc la ligne du ruban.
            * Un `basis-full` de hauteur nulle force le passage à la ligne
            * sans dupliquer une seule entrée dans le DOM.
            */}
          <div aria-hidden="true" className="order-3 h-0 basis-full lg:hidden" />

          {/*
            * Le ruban défile DANS son conteneur, jamais la page.
            *
            * Le vendeur a onze entrées ; à 320 px elles ne tiennent pas, et le
            * §8 interdit le défilement horizontal de la page. `overflow-x-auto`
            * enferme le débordement ici — c'est la même règle que pour les
            * bandeaux et les tableaux larges.
            */}
          <nav
            aria-label="Navigation de l'espace"
            className="order-4 min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] lg:order-2 [&::-webkit-scrollbar]:hidden"
          >
            <ul className="flex items-center gap-1">
              {rubans.map((item) => {
                const actif = item.href === hrefActif;
                return (
                  <li key={item.href} className="shrink-0">
                    <Link
                      href={item.href}
                      aria-current={actif ? "page" : undefined}
                      className={classeEntree(actif)}
                    >
                      <Icone nom={item.icone} className="h-4 w-4 shrink-0" />
                      {item.court ?? item.label}
                    </Link>
                  </li>
                );
              })}

            </ul>
          </nav>

          {/*
            * ⚠ « Plus » vit HORS du ruban, et ce n'est pas un détail de mise
            * en page — c'est la seule position où il fonctionne.
            *
            * ┌──────────────────────────────────────────────────────────────┐
            * │  Le ruban porte `overflow-x-auto`. Or dès qu'un axe cesse    │
            * │  d'être `visible`, l'autre passe de `visible` à `auto` : le  │
            * │  ruban découpe donc AUSSI verticalement.                     │
            * └──────────────────────────────────────────────────────────────┘
            *
            * Placé dedans, le menu déroulant descendait 202 px sous un
            * conteneur haut de 44 : il était **entièrement invisible**, et
            * quatre entrées — Mes livreurs, Transactions, Vérification,
            * Profil — devenaient inatteignables.
            *
            * ⚠ Aucun contrôle ne l'a vu. `isVisible()` de Playwright répond
            * « oui » : l'élément a une boîte, des styles calculés corrects,
            * aucun ancêtre en `display:none`. Il ne dit RIEN du rognage par
            * l'`overflow` d'un ancêtre. Une capture d'écran l'a montré en une
            * seconde ; `verif:menu` compare désormais les rectangles.
            *
            * Il reste un `<details>` natif : il s'ouvre sans une ligne de
            * JavaScript, comme le menu du compte (§70).
            */}
          {secondaires.length > 0 && (
            <details className="relative order-5 shrink-0 lg:order-3">
              <summary
                className={`${classeEntree(
                  secondaires.some((i) => i.href === hrefActif)
                )} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
              >
                Plus
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 shrink-0"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </summary>
              {/* Ancré à DROITE, et cela ne tient que parce que le bouton est
                  au bord droit, à toutes les tailles — voir le saut de ligne
                  plus haut. Déplacer « Plus » sans revoir cet ancrage le
                  ferait sortir de l'écran, sans que rien ne casse. */}
              <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-hairline bg-white p-2 shadow-lg">
                {secondaires.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={item.href === hrefActif ? "page" : undefined}
                    className={classeEntree(item.href === hrefActif)}
                  >
                    <Icone nom={item.icone} className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </details>
          )}

          {/*
            * Les commandes du compte, calées à droite de la PREMIÈRE ligne.
            *
            * `ml-auto` les pousse au bord sur téléphone, où le ruban est parti
            * à la ligne. À `lg:`, le ruban est `flex-1` et absorbe déjà
            * l'espace : la marge automatique n'a plus rien à distribuer.
            */}
          <div className="order-2 ml-auto flex shrink-0 items-center gap-1 sm:gap-2 lg:order-4 lg:ml-0">
            {/*
              * L'action principale, en bouton plein.
              *
              * C'est le « + Add New Item » de la maquette : ce que le vendeur
              * vient faire le plus souvent ne se cherche pas dans une liste de
              * sections, il se voit.
              *
              * Son libellé se réduit sous 1024 px : à cette largeur, « Nouvelle
              * commande » mange la place du ruban, et le « + » suffit à dire ce
              * qu'il fait.
              */}
            {action && (
              <Link
                href={action.href}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong 2xl:px-4"
                title={action.label}
              >
                <Icone nom={action.icone} className="h-4 w-4 shrink-0" />
                <span className="hidden 2xl:inline">{action.label}</span>
                <span className="sr-only 2xl:hidden">{action.label}</span>
              </Link>
            )}

            {/*
              * La mention du mode test, sous sa garde.
              *
              * `data-mention-test` la fait disparaître dès que `PAYMENT_MODE`
              * cesse d'être `test` (§8). Elle est ici et non passée en prop :
              * cette barre est appelée depuis vingt-sept pages, et c'étaient
              * vingt-sept occasions d'en oublier une.
              */}
            {/*
              * ⚠ Sous 1280 px, le libellé disparaît mais PAS la mention.
              *
              * L'éclair reste, avec son nom accessible : « mode test — aucun
              * paiement réel ». Le §75 exige que le site ne laisse jamais
              * croire qu'il prélève quand il simule ; masquer six caractères
              * pour gagner de la place est admissible, masquer le signal ne
              * l'est pas.
              */}
            <span
              data-mention-test=""
              title="Mode test — aucun paiement réel"
              className="hidden items-center gap-1 rounded-full bg-gold-soft px-2 py-1 text-[11px] font-bold text-gold-deep sm:inline-flex xl:px-2.5"
            >
              <Icone nom="eclair" className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Mode test</span>
              <span className="sr-only xl:hidden">
                Mode test — aucun paiement réel
              </span>
            </span>

            <Link
              href="/notifications"
              aria-current={chemin === "/notifications" ? "page" : undefined}
              aria-label={
                notificationsNonLues > 0
                  ? `Notifications — ${notificationsNonLues} non lue(s)`
                  : "Notifications"
              }
              className="relative flex h-11 w-11 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-brand-soft/60 hover:text-brand"
            >
              <Icone nom="cloche" className="h-5 w-5" />
              {notificationsNonLues > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white"
                >
                  {notificationsNonLues > 9 ? "9+" : notificationsNonLues}
                </span>
              )}
            </Link>

            <details ref={compte} className="relative">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-brand-soft/60 [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white"
                >
                  {initiales || "?"}
                </span>
                {/* Le nom n'apparaît qu'à partir de 1280 px : en dessous, ces
                    130 pixels sont ceux qui manquent au ruban pour montrer
                    « Solde » sans qu'on ait à le chercher. Il reste dans le
                    menu déroulant, où il a toute la place. */}
                <span className="hidden min-w-0 max-w-[9rem] text-left 2xl:block">
                  <span className="block truncate text-sm font-semibold text-brand">
                    {userName}
                  </span>
                  <span className="block truncate text-[11px] text-ink-muted">
                    {roleName}
                  </span>
                </span>
                {/* Le chevron est dessiné ici : une seule flèche, dans un seul
                    endroit, ne justifie pas une entrée de plus au jeu d'icônes.
                    `group-open` le retourne quand le menu s'ouvre. */}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 shrink-0 text-ink-muted transition-transform"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </summary>

              <div className="absolute right-0 z-50 mt-2 w-56 rounded-2xl border border-hairline bg-white p-2 shadow-lg">
                {/* Le nom est répété ici : sous 1280 px, l'en-tête ne le montre
                    pas, et un menu de compte qui ne dit pas DE QUEL compte il
                    s'agit est une invitation à se tromper de session. */}
                <div className="px-3 pb-2 pt-1 2xl:hidden">
                  <p className="truncate text-sm font-semibold text-brand">
                    {userName}
                  </p>
                  <p className="truncate text-[11px] text-ink-muted">{roleName}</p>
                </div>
                <Link
                  href={hrefProfil}
                  className="flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-sm text-ink-muted transition-colors hover:bg-brand-soft/60 hover:text-brand"
                >
                  <Icone nom="profil" className="h-4 w-4" /> Mon profil
                </Link>
                <div className="my-1 border-t border-hairline" />
                <BoutonDeconnexion nomCompte={userName} />
              </div>
            </details>
          </div>
        </div>
      </div>
    </header>
  );
}
