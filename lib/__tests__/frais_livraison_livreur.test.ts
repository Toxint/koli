import { describe, it, expect, vi } from "vitest";

// `journal.ts` importe le client Prisma, qui refuse de se construire sans
// DATABASE_URL — a raison : un repli silencieux ferait travailler
// l'application sur les mauvaises donnees. Ce test ne lit que des libelles, il
// n'a besoin d'aucune base.
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { LIBELLES_TYPE, EXPLICATIONS } from "../finance/journal";

/**
 * Les frais de livraison reviennent au livreur.
 *
 * Décision de modèle économique prise le 26/08/2026 : ils étaient encaissés du
 * client — `Payment.amount` les comprend — mais crédités à personne. Le
 * séquestre ne porte que la marchandise, et rien d'autre ne les recevait : le
 * livreur travaillait gratuitement dans le modèle.
 *
 * Deux invariants sont verrouillés ici, parce qu'ils se déferaient en silence.
 */
describe("les frais de livraison acquis au livreur", () => {
  it("ont un libellé et une explication dans le journal financier", () => {
    // Le typage impose déjà de couvrir chaque valeur de l'enum ; ce contrôle
    // vérifie que la couverture n'est pas une chaîne vide posée pour compiler.
    expect(LIBELLES_TYPE.DRIVER_PAYOUT).toMatch(/livreur/i);
    expect(EXPLICATIONS.DRIVER_PAYOUT).toMatch(/livraison/i);
  });

  it("dit dans le journal que l'écriture se fait à la validation du code", () => {
    // Ce n'est pas un détail rédactionnel : c'est LE point qui distingue cette
    // règle de la libération des fonds au vendeur. Un lecteur du journal doit
    // pouvoir comprendre pourquoi une ligne existe avant la confirmation du
    // client.
    expect(EXPLICATIONS.DRIVER_PAYOUT).toMatch(/code de réception|validation/i);
  });
});

/**
 * La commission KOLI ne touche pas les frais de livraison.
 *
 * Ce n'est pas une intention : c'est une conséquence de l'assiette. La
 * commission porte sur `Fund.amount`, et le séquestre ne contient que la
 * marchandise — `totalItemAmount`, jamais `grandTotal`.
 *
 * Le contrôle porte donc sur le CODE qui crée la commande : si quelqu'un
 * séquestrait un jour le total frais compris, la commission mordrait sur la
 * paie du livreur sans qu'aucun écran ne le montre, et le livreur toucherait
 * moins que le montant annoncé.
 */
describe("l'assiette de la commission", () => {
  it("est la marchandise seule, pas le total payé par le client", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync("lib/orders/actions.ts", "utf8");

    // Le séquestre est créé avec le total des articles…
    // Pas de drapeau `s` : `[^}]` traverse deja les retours a la ligne, et ce
    // drapeau exige une cible ES2018 que la construction ne vise pas.
    expect(source).toMatch(/fund:\s*{\s*create:\s*{[^}]*amount:\s*totalItemAmount/);

    // …et le paiement, lui, avec le total frais compris. Les deux doivent
    // rester distincts.
    expect(source).toMatch(/grandTotal\s*=\s*totalItemAmount\s*\+\s*data\.deliveryFee/);
  });
});
