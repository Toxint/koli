import { describe, it, expect, afterEach, vi } from "vitest";
import { raccourcisDemoActifs } from "../config/demonstration";

/**
 * Les raccourcis « comptes de test » de la page de connexion.
 *
 * Ces boutons remplissent l'identifiant d'un compte de démonstration — dont
 * l'ADMINISTRATEUR — et affichent le mot de passe commun en clair. En ligne,
 * c'est une porte d'entrée : même après changement des mots de passe, ils
 * annoncent publiquement que `admin@koli.ci` existe.
 *
 * Ce qui est verrouillé ici n'est pas qu'on puisse les afficher : c'est qu'ils
 * soient masqués **par défaut**. Une variable oubliée sur l'hébergeur ne peut
 * alors que les masquer — jamais les révéler.
 */
describe("les raccourcis de démonstration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sont masqués quand rien n'est demandé", () => {
    vi.stubEnv("RACCOURCIS_DEMO", undefined);
    expect(raccourcisDemoActifs()).toBe(false);
  });

  it("restent masqués en développement si on ne les demande pas", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RACCOURCIS_DEMO", undefined);
    expect(raccourcisDemoActifs()).toBe(false);
  });

  it("ne s'affichent QUE sur la valeur exacte « 1 »", () => {
    // Une valeur approximative — « true », « oui », une chaîne vide laissée par
    // un fichier d'environnement mal rempli — ne doit pas suffire à découvrir
    // le compte administrateur.
    for (const valeur of ["", "0", "true", "oui", "yes", "non", " 1", "1 "]) {
      vi.stubEnv("RACCOURCIS_DEMO", valeur);
      expect(raccourcisDemoActifs(), JSON.stringify(valeur)).toBe(false);
    }

    vi.stubEnv("RACCOURCIS_DEMO", "1");
    expect(raccourcisDemoActifs()).toBe(true);
  });

  it("s'affichent même en production si on le demande vraiment", () => {
    // Le serveur de développement de ce projet tourne avec `next start`, donc
    // en `NODE_ENV=production`. Se fier à `NODE_ENV` aurait fait disparaître
    // les raccourcis de la machine où ils servent.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RACCOURCIS_DEMO", "1");
    expect(raccourcisDemoActifs()).toBe(true);
  });
});
