import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le document de référence du projet vit dans docs/koli-plan.md (voir
  // aussi docs/architecture.md) : on désactive la génération automatique
  // d'AGENTS.md/CLAUDE.md par `next dev` pour éviter un second fichier de
  // règles qui ferait doublon.
  agentRules: false,

  /**
   * Origines acceptées par le serveur de développement.
   *
   * `next dev` refuse par défaut les ressources internes (`/_next/…`) et les
   * actions serveur demandées depuis une origine qu'il ne considère pas comme
   * canonique — il répond 403. Or l'application se teste depuis
   * `127.0.0.1` et depuis l'adresse réseau, pour vérifier le rendu sur
   * téléphone : sans cette liste, les formulaires échouaient silencieusement
   * en développement, sans le moindre message.
   *
   * Sans effet sur la production, qui ne passe pas par le serveur de dev.
   */
  allowedDevOrigins: ["localhost", "127.0.0.1", "172.20.10.7"],
};

export default nextConfig;
