import { describe, it, expect } from "vitest";
import { TENTATIVES_MAX, refusDefinitif } from "@/lib/notifications/reessai";

/**
 * Réessayer, ou renoncer.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Se tromper de sens coûte cher DES DEUX CÔTÉS.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Renoncer trop vite : une coupure réseau d'une minute efface définitivement
 * l'annonce d'une vente, et le vendeur ne l'apprend jamais.
 *
 * Renoncer trop tard : une clef révoquée est réessayée sans fin. La file lit
 * les vingt-cinq plus anciennes lignes — vingt-cinq échecs permanents
 * l'occupent entièrement, et plus aucune vente n'est annoncée. C'est le défaut
 * qui existait jusqu'au 7 septembre 2026, et il était parfaitement muet.
 */

describe("un refus qui ne guérira pas", () => {
  /**
   * Chacun de ces trois est arrivé, ou arrivera.
   *
   * 401 : la clef a été révoquée ou remplacée. 403 : le domaine n'est pas
   * autorisé pour cette clef — exactement ce que rend Resend si l'on essaie
   * d'écrire depuis `premiummarketafrica.com` avec la clef de KOLI. 422 :
   * l'adresse est illisible.
   */
  it("les 4xx sont définitives : le temps n'y change rien", () => {
    expect(refusDefinitif(400), "requête mal formée").toBe(true);
    expect(refusDefinitif(401), "clef révoquée").toBe(true);
    expect(refusDefinitif(403), "domaine non autorisé").toBe(true);
    expect(refusDefinitif(404)).toBe(true);
    expect(refusDefinitif(422), "adresse illisible").toBe(true);
  });

  /**
   * LA seule 4xx qui guérit toute seule.
   *
   * Resend accorde dix requêtes par seconde — mesuré le 7 septembre 2026 sur
   * l'en-tête `ratelimit-policy: 10;w=1`. La boucle en enchaîne jusqu'à
   * vingt-cinq sans pause : depuis l'hébergeur, elle peut les dépasser.
   *
   * La traiter comme définitive jetterait des ventes pour la seule raison
   * qu'elles sont arrivées en même temps que d'autres — c'est-à-dire un jour
   * de forte activité, le pire moment.
   */
  it("429 est l'exception, et elle compte", () => {
    expect(refusDefinitif(429)).toBe(false);
  });

  it("les 5xx sont chez eux : on repasse", () => {
    expect(refusDefinitif(500)).toBe(false);
    expect(refusDefinitif(502)).toBe(false);
    expect(refusDefinitif(503)).toBe(false);
  });

  /**
   * Une réponse à succès n'arrive jamais ici — la boucle ne l'appelle qu'après
   * `!reponse.ok`. Le vérifier quand même coûte une ligne, et une inversion du
   * signe se verrait immédiatement.
   */
  it("un succès n'est pas un refus", () => {
    expect(refusDefinitif(200)).toBe(false);
    expect(refusDefinitif(202)).toBe(false);
  });
});

describe("le plafond de tentatives", () => {
  /**
   * Le compteur monte à chaque TENTATIVE, pas à chaque heure. Une panne chez
   * le prestataire pendant une heure chargée en brûle plusieurs pour rien : un
   * plafond à deux ou trois jetterait des ventes pour un incident passager.
   *
   * Il n'est pas là pour arbitrer un cas réel — `refusDefinitif` s'en charge —
   * mais pour empêcher une boucle infinie sur un échec qu'on n'a pas prévu.
   */
  it("laisse de la place à une panne passagère", () => {
    expect(TENTATIVES_MAX).toBeGreaterThanOrEqual(5);
  });

  it("mais reste fini : la file doit finir par avancer", () => {
    expect(Number.isInteger(TENTATIVES_MAX)).toBe(true);
    expect(TENTATIVES_MAX).toBeLessThanOrEqual(20);
  });
});
