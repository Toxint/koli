import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Origines acceptées par le serveur de développement.
 *
 * Les adresses du réseau local sont **relevées sur la machine** plutôt
 * qu'écrites en dur : la première version listait `172.20.10.7`, l'adresse
 * d'un partage de connexion 4G. Le jour où le poste est repassé en wifi, elle
 * est devenue `192.168.1.101` et la valeur figée ne servait plus à rien —
 * silencieusement, comme toujours avec une adresse codée en dur.
 */
function originesDeveloppement(): string[] {
  const origines = new Set(["localhost", "127.0.0.1"]);

  for (const cartes of Object.values(networkInterfaces())) {
    for (const carte of cartes ?? []) {
      if (carte.family === "IPv4" && !carte.internal) {
        origines.add(carte.address);
      }
    }
  }

  // Permet d'en ajouter une à la main (tunnel, nom de domaine de test).
  for (const extra of (process.env.DEV_ORIGINS ?? "").split(",")) {
    const valeur = extra.trim();
    if (valeur) origines.add(valeur);
  }

  return [...origines];
}

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
  allowedDevOrigins: originesDeveloppement(),
};

export default nextConfig;
