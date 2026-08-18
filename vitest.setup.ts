export {}; // fait de ce fichier un module ESM (requis pour le top-level await)

// Secret de test : les modules d'authentification refusent desormais de
// fonctionner sans AUTH_SECRET (voir lib/auth/session.ts). Valeur factice,
// utilisee uniquement par la suite de tests.
process.env.AUTH_SECRET ??= "secret-de-test-vitest-ne-pas-utiliser-en-prod";
process.env.PAYMENT_MODE ??= "test";

// Pour les tests de composants (fichiers marques `// @vitest-environment jsdom`) :
// jsdom n'implemente pas l'API <dialog> (jsdom#3294), et les matchers DOM de
// jest-dom doivent etre enregistres. Ignore en environnement node.
if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
}

if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
