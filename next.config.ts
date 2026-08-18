import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le document de référence du projet vit dans docs/koli-plan.md (voir
  // aussi docs/architecture.md) : on désactive la génération automatique
  // d'AGENTS.md/CLAUDE.md par `next dev` pour éviter un second fichier de
  // règles qui ferait doublon.
  agentRules: false,
};

export default nextConfig;
