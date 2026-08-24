import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Un fichier `"use server"` ne peut exporter QUE des fonctions async.
 *
 * Y exporter une constante — une table de libellés, par exemple — fait échouer
 * l'action à l'exécution :
 *
 *   Error: A "use server" file can only export async functions, found object.
 *
 * Le piège est qu'absolument rien ne le signale avant le clic. TypeScript
 * passe, le linter passe, la construction passe, la page s'affiche et le
 * bouton est là. C'est l'appel de l'action qui renvoie une erreur 500, et le
 * formulaire échoue en silence côté utilisateur.
 *
 * Ce contrôle statique est donc le seul filet possible.
 */

const RACINES = ["lib", "app", "components"];

function fichiersSources(racine: string): string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string) => {
    for (const entree of fs.readdirSync(dossier, { withFileTypes: true })) {
      const complet = path.join(dossier, entree.name);
      if (entree.isDirectory()) {
        if (entree.name === "node_modules" || entree.name === ".next") continue;
        parcourir(complet);
      } else if (/\.tsx?$/.test(entree.name)) {
        trouves.push(complet);
      }
    }
  };
  if (fs.existsSync(racine)) parcourir(racine);
  return trouves;
}

describe('fichiers "use server"', () => {
  const fichiers = RACINES.flatMap(fichiersSources)
    .map((f) => ({ chemin: f, contenu: fs.readFileSync(f, "utf8") }))
    .filter(({ contenu }) => /^\s*["']use server["']/.test(contenu));

  it("il y en a bien (sinon ce controle ne verifie rien)", () => {
    // Sans cette garde, un changement d'organisation des fichiers rendrait le
    // test suivant vide — donc toujours vert, donc inutile.
    expect(fichiers.length).toBeGreaterThan(3);
  });

  it("n'exportent aucune constante, classe ni objet", () => {
    const fautifs: string[] = [];

    for (const { chemin, contenu } of fichiers) {
      const lignes = contenu.split(/\r?\n/);
      lignes.forEach((ligne, i) => {
        // `export type` et `export interface` sont effaces a la compilation :
        // ils ne produisent aucune valeur exportee et sont donc permis.
        if (/^export\s+(const|let|var|class)\s/.test(ligne)) {
          fautifs.push(`${chemin}:${i + 1} → ${ligne.trim().slice(0, 80)}`);
        }
      });
    }

    expect(fautifs).toEqual([]);
  });
});
