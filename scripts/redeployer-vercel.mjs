/**
 * Relance un deploiement de PRODUCTION depuis GitHub.
 *
 * `vercel deploy` televerse le projet entier depuis le poste — ce que la
 * liaison de cette machine ne supporte pas (« fetch failed »). Cette voie-ci
 * demande a Vercel d aller chercher le code lui-meme dans le depot : rien ne
 * transite par ici.
 */

import { api, projectId } from "./vercel-api.mjs";

const projet = (await api(`/v9/projects/${projectId}`)).corps;
const lien = projet.link;

if (!lien) {
  console.error("Le projet n est relie a aucun depot git.");
  process.exit(1);
}

console.log(`depot   : ${lien.org}/${lien.repo}`);
console.log(`branche : ${lien.productionBranch}`);

const r = await api("/v13/deployments?forceNew=1", {
  method: "POST",
  body: JSON.stringify({
    name: projet.name,
    target: "production",
    gitSource: {
      type: "github",
      org: lien.org,
      repo: lien.repo,
      ref: lien.productionBranch,
      repoId: lien.repoId,
    },
  }),
});

if (!r.ok) {
  console.error(`\nECHEC ${r.statut} : ${JSON.stringify(r.corps).slice(0, 400)}`);
  process.exit(1);
}

console.log(`\ndeploiement lance : ${r.corps.id}`);
console.log(`etat              : ${r.corps.readyState ?? r.corps.status}`);
console.log(`adresse           : https://${r.corps.url}`);
