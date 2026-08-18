import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    // Environnement node par defaut : la logique metier (machine a etats,
    // paiements, auth) est pure et n'a pas besoin d'un DOM. jose refuse par
    // ailleurs les Uint8Array produits par jsdom (conflit de realm).
    // Pour un test de composant React, ajouter en tete de fichier :
    //   // @vitest-environment jsdom
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
  resolve: {
    // Aligne l'alias "@/*" sur celui de tsconfig.json.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
