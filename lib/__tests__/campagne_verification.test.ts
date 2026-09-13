import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * La campagne de vérification est-elle réellement complète ?
 *
 * Ce test existe à cause d'un défaut qui a duré des semaines sans se voir.
 * `verif:tout` enchaîne vingt-six étapes avec `&&`. L'une d'elles,
 * `verif:commissions`, avait été inscrite dans la chaîne sans jamais être
 * définie : npm s'arrêtait dessus avec « Missing script », et les sept
 * dernières étapes — dont `verif:parcours`, qui éprouve le parcours complet
 * du §80, le critère de fin du MVP — n'ont jamais tourné.
 *
 * Le pire n'est pas l'oubli : c'est qu'il ne se voyait pas. La campagne
 * affichait des centaines de contrôles verts avant de s'interrompre, et rien
 * dans cette avalanche ne disait qu'un tiers du travail n'avait pas eu lieu.
 *
 * Une chaîne de vérification qui se tait sur ce qu'elle n'a pas fait est pire
 * qu'une chaîne courte : elle inspire une confiance qu'elle ne mérite pas.
 */
describe("la chaîne verif:tout", () => {
  const paquet = JSON.parse(
    fs.readFileSync(path.resolve("package.json"), "utf8")
  ) as { scripts: Record<string, string> };

  /*
   * Les `npm run X` de la campagne vivent dans `verif:chaine` depuis le 13
   * septembre 2026. `verif:tout` lance `scripts/campagne.mjs`, qui lit cette
   * chaîne et reprend une suite tuée par une coupure du VPN — voir le fichier.
   *
   * Ce test lisait `verif:tout` directement. Le jour où la chaîne a changé de
   * place, il est tombé à « 0 étape » : c'est exactement ce qu'il existe pour
   * voir, une campagne qui ne lancerait plus rien sans le dire.
   */
  const etapes = [...paquet.scripts["verif:chaine"].matchAll(/npm run ([\w:-]+)/g)].map(
    (m) => m[1]
  );

  it("verif:tout lance bien le lanceur qui lit verif:chaine", () => {
    /* Sans cette garde, on pourrait remettre une chaîne à la main dans
       `verif:tout` : elle tournerait, et plus rien ne relirait `verif:chaine`
       — qui continuerait d'être « testée » ici sans jamais être lancée. */
    expect(paquet.scripts["verif:tout"]).toBe("node scripts/campagne.mjs");
    const lanceur = fs.readFileSync(path.resolve("scripts/campagne.mjs"), "utf8");
    /* Insensible aux espaces et aux retours à la ligne : un reformatage du
       lanceur ne doit pas faire tomber ce contrôle, seul un changement de la
       clef lue le doit. */
    expect(lanceur).toMatch(/scripts\[\s*["']verif:chaine["']\s*\]/);
  });

  it("enchaîne bien plusieurs étapes", () => {
    expect(etapes.length).toBeGreaterThan(10);
  });

  it("ne référence aucun script inexistant", () => {
    const mortes = etapes.filter((e) => !(e in paquet.scripts));
    expect(
      mortes,
      `${mortes.join(", ")} — npm s'arrêterait là et les étapes suivantes ne tourneraient jamais`
    ).toEqual([]);
  });

  it("comprend le parcours complet, qui est le critère de fin du MVP (§80)", () => {
    expect(etapes).toContain("verif:parcours");
  });

  it("place la latence en tête : au-delà, les verdicts ne veulent rien dire", () => {
    const latence = etapes.indexOf("verif:latence");
    expect(latence).toBeGreaterThanOrEqual(0);
    // Après les contrôles statiques, mais avant tout ce qui touche la base.
    expect(etapes.indexOf("verif:schema")).toBeGreaterThan(latence);
  });

  it("chaque script de vérification pointe un fichier qui existe", () => {
    const introuvables = Object.entries(paquet.scripts)
      .filter(
        ([nom]) => nom.startsWith("verif:") && nom !== "verif:tout" && nom !== "verif:chaine"
      )
      .map(([nom, commande]) => [nom, commande.match(/scripts\/[\w.-]+\.mjs/)?.[0]] as const)
      .filter(([, fichier]) => fichier && !fs.existsSync(path.resolve(fichier)))
      .map(([nom, fichier]) => `${nom} → ${fichier}`);

    expect(introuvables).toEqual([]);
  });
});
