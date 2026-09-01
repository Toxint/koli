import { isTestMode } from "@/lib/config/mode";

/**
 * Ce qui ne doit s'afficher QUE tant que l'argent est simulé.
 *
 * ┌────────────────────────────────────────────────────────────────────────┐
 * │  ANNONCER « aucun paiement réel n'est effectué » PENDANT QU'ON PRÉLÈVE │
 * │  serait la pire phrase que cette application puisse afficher.          │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Ces mentions étaient écrites en dur dans une vingtaine d'écrans, et
 * `isTestMode()` n'était lu NULLE PART dans l'interface. La bascule vers un
 * paiement réel aurait donc laissé le site affirmer le contraire de ce qu'il
 * fait — sur la vitrine, dans les tableaux de bord, et jusque dans les
 * conditions d'utilisation, qui sont un document juridique.
 *
 * ── Pourquoi un composant, et pas la règle CSS ──────────────────────────────
 *
 * `app/globals.css` masque `[data-mention-test]` dès que le mode change. Cette
 * règle existe pour les composants CLIENT, qui ne peuvent pas lire
 * `isTestMode()` — le menu latéral, appelé depuis vingt-sept pages.
 *
 * Mais elle MASQUE, elle ne retire pas. Sur une phrase enchâssée dans un
 * paragraphe — « Suivi des transactions KOLI (mode test) » —, masquer laisse
 * une coquille : une parenthèse ouverte, une phrase amputée, une espace en
 * trop. Ici, le texte n'est pas rendu du tout.
 *
 * Règle simple : composant serveur → ce composant ; composant client →
 * `data-mention-test`.
 */
export function MentionModeTest({ children }: { children: React.ReactNode }) {
  if (!isTestMode()) return null;
  return <>{children}</>;
}
