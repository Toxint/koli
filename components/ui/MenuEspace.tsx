import { DashboardNav } from "@/components/ui/DashboardNav";
import { compterNonLues } from "@/lib/notifications/lecture";
import {
  navigationDuRole,
  accueilDuRole,
  libelleRole,
  type NavItem,
} from "@/lib/navigation";

/**
 * Menu latéral, avec son compteur de notifications.
 *
 * `DashboardNav` est un composant client : il ne peut pas interroger la base.
 * Le nombre de notifications non lues doit pourtant être juste **dès le
 * premier rendu** — affiché à zéro puis corrigé après coup, il ferait manquer
 * ce qui vient d'arriver, précisément sur la page où l'on se trouve.
 *
 * Ce composant serveur s'intercale donc pour le calculer. Il déduit aussi la
 * navigation, l'accueil et le libellé du rôle : c'était recopié sur vingt-cinq
 * pages, et une page qui oubliait le compteur affichait une pastille vide en
 * permanence — un mensonge silencieux, jamais signalé.
 */
export async function MenuEspace({
  user,
  nomAffiche,
  navItems,
}: {
  user: { id: string; name: string; role: string };
  /** Le vendeur s'affiche sous son enseigne, pas sous son nom civil. */
  nomAffiche?: string | null;
  /** Rare : n'à passer que pour un menu qui s'écarte de celui du rôle. */
  navItems?: NavItem[];
}) {
  const nonLues = await compterNonLues(user.id);

  return (
    <DashboardNav
      userName={nomAffiche || user.name}
      roleName={libelleRole(user.role)}
      homeHref={accueilDuRole(user.role)}
      navItems={navItems ?? navigationDuRole(user.role)}
      notificationsNonLues={nonLues}
    />
  );
}
