# KOLI — MASTER IMPLEMENTATION PLAN — V1

Cahier des charges fonctionnel, UX/UI, architecture et plan d'implémentation

**Version : 1.0**

> Document de référence officiel du projet KOLI. Toute tâche importante sur ce projet doit être vérifiée par rapport à ce document avant d'être exécutée.

---

## 1. Mission de Claude Code

Claude Code est responsable de l'implémentation technique de la plateforme KOLI.

- Construire KOLI progressivement, proprement et de manière modulaire.
- Ne jamais essayer de construire toute la plateforme en une seule fois.
- Respecter strictement l'ordre des phases indiqué dans ce document.

Après chaque phase :
1. implémenter ;
2. tester ;
3. vérifier les erreurs ;
4. corriger ;
5. vérifier la responsivité ;
6. vérifier les permissions ;
7. vérifier que les fonctionnalités existantes continuent de fonctionner ;
8. seulement ensuite passer à la phase suivante.

**IMPORTANT :** KOLI est initialement développé en **MODE TEST**. Aucun argent réel ne doit être traité dans le MVP tant que le partenaire financier, les exigences réglementaires et l'intégration de paiement réelle ne sont pas validés. Le système de paiement du MVP doit donc être **simulé**.

---

## 2. Vision de KOLI

KOLI est une infrastructure de confiance destinée au commerce en ligne africain.

KOLI permet à un vendeur de vendre ses produits sur :
- Facebook ;
- TikTok ;
- WhatsApp ;
- Instagram ;
- son propre site ;
- éventuellement plus tard la marketplace KOLI.

Le vendeur peut utiliser KOLI uniquement comme infrastructure de paiement sécurisé et de gestion de commande.

**Concept central (flux) :**

```
CLIENT
↓
COMMANDE
↓
PAIEMENT
↓
FONDS SÉCURISÉS — MODE TEST
↓
VENDEUR PRÉPARE LE COLIS
↓
LIVREUR
↓
CLIENT REÇOIT
↓
OTP / PREUVE DE LIVRAISON
↓
CLIENT CONFIRME
↓
FONDS LIBÉRÉS — MODE TEST
↓
VENDEUR PAYÉ
```

KOLI doit devenir une infrastructure de confiance entre le client, le vendeur et le livreur.

---

## 3. Slogan et positionnement

- **Nom :** KOLI
- **Positionnement :** La plateforme qui sécurise les achats en ligne.
- **Slogan de travail :** « KOLI — Achetez. Recevez. Validez. »

La marque doit communiquer : confiance, sécurité, simplicité, modernité, rapidité, professionnalisme, accessibilité africaine.

---

## 4. Principes fondamentaux du produit

1. Simplicité.
2. Sécurité.
3. Transparence.
4. Traçabilité.
5. Responsive design.
6. Mobile-first.
7. Interface moderne.
8. Navigation simple.
9. Architecture évolutive.
10. Séparation stricte des rôles.
11. Aucun accès non autorisé.
12. Historique de toutes les opérations importantes.
13. Aucun paiement réel dans le MVP.
14. Les fonctionnalités financières doivent être conçues pour pouvoir être remplacées par une vraie API plus tard.

---

## 5. Utilisateurs de KOLI

KOLI V1 possède quatre rôles principaux.

### 5.1 Client
- consulte une commande ;
- paie en mode test ;
- reçoit une confirmation ;
- suit la commande ;
- consulte sa facture ;
- reçoit le produit ;
- confirme la réception ;
- ouvre un litige ;
- consulte l'historique.

### 5.2 Vendeur
- crée son compte ;
- complète son profil ;
- ajoute ses produits ;
- crée une commande ;
- ajoute les informations du client ;
- génère un lien de paiement KOLI ;
- partage le lien ;
- suit la commande ;
- assigne un livreur ;
- consulte son solde test ;
- consulte ses transactions ;
- consulte ses commissions ;
- gère les litiges.

### 5.3 Livreur
Au début, chaque vendeur peut utiliser son propre livreur.
- se connecte ;
- voit les livraisons qui lui sont assignées ;
- consulte les informations nécessaires ;
- accepte/récupère une livraison ;
- indique que le colis est récupéré ;
- indique que le colis est en livraison ;
- indique son arrivée ;
- demande le code OTP ;
- valide la remise du colis.

Plus tard, KOLI pourra créer son propre réseau de livreurs.

### 5.4 Administrateur KOLI
L'administrateur contrôle la plateforme. Il peut :
- consulter les utilisateurs, vendeurs, clients, livreurs ;
- consulter les commandes, paiements ;
- consulter les fonds sécurisés, fonds libérés ;
- consulter les litiges, remboursements ;
- gérer les commissions ;
- consulter les logs ;
- gérer les paramètres ;
- suspendre un compte ;
- vérifier les vendeurs ;
- consulter les preuves de livraison.

---

## 6. Responsive design — obligatoire

KOLI doit fonctionner correctement sur : smartphone, tablette, ordinateur portable, ordinateur de bureau.

Le design doit être responsive dès le début. **NE PAS** créer d'abord la version desktop puis essayer de l'adapter au mobile. La conception doit être **MOBILE-FIRST**.

---

## 7. Breakpoints

- **Mobile :** 320px à 767px
- **Tablette :** 768px à 1023px
- **Desktop :** 1024px et plus

Le système doit aussi fonctionner correctement sur des écrans larges.

---

## 8. Règles responsive

**Sur mobile :**
- navigation simplifiée ;
- menu hamburger ou navigation basse selon l'écran ;
- boutons suffisamment grands ;
- formulaires en une colonne ;
- tableaux transformés en cartes ;
- aucune barre horizontale involontaire ;
- images adaptatives ;
- textes lisibles ;
- actions principales facilement accessibles avec le pouce.

**Sur desktop :**
- sidebar ;
- dashboard large ;
- tableaux ;
- cartes statistiques ;
- navigation complète.

Le contenu ne doit jamais sortir de l'écran.

---

## 9. Structure globale de l'application

**Espace public :** Accueil, Comment ça marche, Connexion, Inscription, Aide, Conditions, Politique de confidentialité.

**Espace client :** Tableau de bord, Commandes, Détails commande, Paiement, Suivi, Factures, Litiges, Profil.

**Espace vendeur :** Dashboard, Commandes, Produits, Clients, Livreurs, Transactions, Solde, Litiges, Profil, Paramètres.

**Espace livreur :** Dashboard, Livraisons, Détails livraison, Historique, Profil.

**Espace admin :** Dashboard, Utilisateurs, Vendeurs, Clients, Livreurs, Commandes, Paiements, Transactions, Fonds sécurisés, Litiges, Remboursements, Commissions, KYC, Logs, Paramètres.

---

## 10. Structure de navigation vendeur

**Sur desktop — SIDEBAR :**
KOLI Logo, Dashboard, Commandes, Produits, Clients, Livreurs, Transactions, Solde, Litiges, Paramètres, Profil, Déconnexion.

**Sur mobile :**
Header KOLI, Menu → Dashboard, Commandes, Produits, Clients, Livreurs, Transactions, Solde, Litiges, Paramètres, Profil.

Les autres éléments doivent être accessibles dans le menu.

---

## 11. Dashboard vendeur

Le dashboard doit afficher des statistiques principales : Ventes totales, Commandes, Fonds sécurisés, Fonds disponibles.

Exemple :
- Ventes : 250 000 FCFA
- Commandes : 18
- Fonds sécurisés : 120 000 FCFA
- Disponible : 130 000 FCFA

**IMPORTANT :** Dans le MVP, ces montants sont fictifs. Afficher clairement un indicateur : **MODE TEST**.

---

## 12. Dashboard vendeur — commandes récentes

Afficher les commandes récentes. Chaque commande doit afficher : numéro, produit, client, montant, date, statut.

Exemple : `KOLI-000124` — Chaussures Nike — Jean — 50 000 FCFA — Fonds sécurisés

---

## 13. Système de statuts des commandes

Créer des statuts strictement définis.

**Statuts principaux :**
`DRAFT` → `PAYMENT_PENDING` → `PAYMENT_CONFIRMED` → `FUNDS_SECURED` → `SELLER_ACCEPTED` → `PACKAGE_PREPARING` → `READY_FOR_PICKUP` → `PICKED_UP` → `IN_TRANSIT` → `ARRIVED` → `DELIVERED` → `CUSTOMER_CONFIRMED` → `FUNDS_RELEASED` → `COMPLETED`

---

## 14. Statuts d'erreur

`CANCELLED`, `PAYMENT_FAILED`, `DELIVERY_FAILED`, `DISPUTE_OPEN`, `REFUND_PENDING`, `REFUNDED`, `RETURN_REQUESTED`, `RETURNED`

---

## 15. Règle absolue des statuts

Un utilisateur ne doit pas pouvoir modifier librement un statut. Chaque changement doit respecter les transitions autorisées.

Exemple : `FUNDS_SECURED` peut devenir `SELLER_ACCEPTED`, mais ne doit **pas** directement devenir `FUNDS_RELEASED`.

Le système doit empêcher les transitions illogiques.

---

## 16. Création d'un produit

Le vendeur clique « Ajouter un produit ».

**Formulaire :** photo, nom, description, catégorie, prix, quantité, poids éventuel, statut, informations supplémentaires.

**Boutons :** « Enregistrer » / « Enregistrer et créer une commande »

---

## 17. Page produit

**Afficher :** image, nom, prix, description, vendeur, statut du vendeur, bouton commander.

La page doit être responsive.

---

## 18. Création d'une commande

Le vendeur clique « Nouvelle commande ».

1. **Étape 1 :** Sélectionner le produit.
2. **Étape 2 :** Entrer le client — champs : nom, téléphone, email facultatif, pays, ville, adresse, informations complémentaires.
3. **Étape 3 :** Informations de livraison.
4. **Étape 4 :** Résumé.
5. **Étape 5 :** Créer la commande.

---

## 19. Lien de paiement KOLI

Après création de la commande, KOLI génère automatiquement une URL unique.

Exemple : `koli.app/pay/KOLI-000124`

Le vendeur doit pouvoir cliquer « Copier le lien » / « Partager ». Le lien doit pouvoir être envoyé sur WhatsApp, Messenger, SMS, réseaux sociaux.

---

## 20. Checkout client

Le client ouvre le lien. Il voit : Logo KOLI, Nom du vendeur, Produit, Quantité, Prix, Livraison, Total, Numéro de commande, Informations du client. Puis « Continuer vers le paiement ».

---

## 21. Paiement

Dans le MVP : afficher « Paiement sécurisé KOLI », moyen : Mobile Money. **Mais le paiement est SIMULÉ.**

Créer un environnement **TEST MODE**. Le client doit pouvoir choisir « Simuler un paiement réussi » ou « Simuler un paiement échoué ». Cela permettra de tester tous les scénarios.

---

## 22. Paiement réussi

Après paiement test, afficher : ✓ Paiement confirmé — Commande KOLI-000124 — Montant 50 000 FCFA — Statut : Fonds sécurisés — TEST.

Message : « Votre paiement est sécurisé. Le vendeur sera payé après la validation de la réception selon les règles de KOLI. »

---

## 23. Paiement échoué

Afficher « Le paiement n'a pas abouti. » Bouton « Réessayer ». La commande doit rester dans `PAYMENT_PENDING` ou `PAYMENT_FAILED` selon le scénario.

---

## 24. Espace livreur

Dashboard livreur : Livraisons du jour — En attente / En cours / Terminées.

---

## 25. Détail d'une livraison

**Afficher :** commande, produit, nom client, téléphone, adresse, ville, instructions, statut.

Ne jamais afficher au livreur des informations financières inutiles. Le livreur doit principalement voir les informations nécessaires à la livraison.

---

## 26. Workflow livreur

`ASSIGNÉ` → `COLIS À RÉCUPÉRER` → `COLIS RÉCUPÉRÉ` → `EN LIVRAISON` → `ARRIVÉ` → `LIVRAISON À CONFIRMER`

---

## 27. Système OTP

Lorsqu'une livraison arrive au client, KOLI génère un code OTP (ex. `583921`). Le client reçoit le code, le livreur le demande et le saisit.

- Si correct : ✓ Livraison confirmée
- Si incorrect : ✕ Code incorrect

Prévoir une limitation du nombre de tentatives.

---

## 28. Preuve de livraison

**En V1 :** OTP, date, heure, livreur, commande.

Préparer l'architecture pour ajouter plus tard : signature, photo, géolocalisation.

---

## 29. Confirmation client

Après livraison, le client doit voir « Avez-vous reçu votre commande ? » avec deux boutons : « Oui, j'ai reçu ma commande » / « Signaler un problème ».

Si le client confirme : `CUSTOMER_CONFIRMED` → `FUNDS_RELEASED` → `COMPLETED`. Dans le MVP, la libération est virtuelle.

---

## 30. Protection contre la double validation

Le système doit empêcher : deux validations, deux libérations, deux remboursements, deux confirmations de paiement.

Chaque opération financière simulée doit être **idempotente**. Une commande ne doit jamais pouvoir libérer deux fois les mêmes fonds.

---

## 31. Litige

Le client clique « Signaler un problème ». Il choisit : produit non reçu, mauvais produit, produit endommagé, produit incomplet, produit différent de la description, autre.

Il peut ajouter : description, photos, vidéos si supportées.

---

## 32. Workflow litige

```
Commande : DELIVERED
↓
DISPUTE_OPEN
↓
ADMIN_REVIEW
↓
DECISION
↓
SELLER_WINS  ou  CUSTOMER_WINS
```

---

## 33. Règle des fonds en litige

Lorsqu'un litige est ouvert, les fonds ne doivent pas passer à `FUNDS_RELEASED` tant que le litige n'est pas résolu. Dans le MVP, il s'agit d'un solde virtuel.

---

## 34. Administrateur — Dashboard

Afficher : utilisateurs, vendeurs, commandes, paiements test, fonds sécurisés test, fonds libérés test, litiges, remboursements, commissions, activités récentes.

---

## 35. Admin — Utilisateurs

L'admin peut : rechercher, filtrer, voir, suspendre, réactiver.

**Afficher :** nom, téléphone, rôle, statut, date d'inscription.

---

## 36. Admin — Vendeurs

**Afficher :** nom, statut de vérification, commandes, chiffre d'affaires, statut du compte.

**Prévoir :** `VERIFIED`, `PENDING`, `REJECTED`, `SUSPENDED`

---

## 37. KYC

La fonctionnalité KYC doit être préparée mais ne doit pas bloquer tout le MVP.

**Prévoir :** identité, téléphone, documents, statut.

**Statuts :** `PENDING`, `VERIFIED`, `REJECTED`

La liste exacte des documents sera adaptée au pays et au partenaire financier sélectionné.

---

## 38. Factures

Après paiement, générer une facture/reçu contenant : KOLI, Numéro de commande, Date, Vendeur, Client, Produit, Quantité, Prix, Livraison, Total, Statut du paiement, Statut de la commande.

---

## 39. Transactions

Créer une architecture séparée entre : `ORDER`, `PAYMENT`, `TRANSACTION`, `FUNDS`, `REFUND`.

Ne jamais mélanger toutes ces notions dans une seule table.

---

## 40. Ledger / journal financier

Même en mode test, créer un registre des mouvements.

Exemple — Commande KOLI-000124 : Paiement +50 000 FCFA, Commission -2 500 FCFA, Fonds sécurisés 50 000 FCFA, Libération 50 000 FCFA.

Le système doit conserver l'historique.

---

## 41. Commissions

Créer une configuration permettant de définir une commission KOLI (exemple de test : 5 %). Ne pas coder définitivement le taux — il doit être configurable par l'administrateur.

---

## 42. Solde vendeur

Le vendeur doit voir : Fonds sécurisés (argent associé aux commandes encore protégées), Solde disponible (argent virtuellement libéré), Total gagné, Historique. Dans le MVP, tout est simulé.

---

## 43. Retrait

Préparer l'interface « Retirer mes fonds », mais dans le MVP aucun transfert réel. Afficher : « Les retraits réels seront disponibles après activation du système de paiement KOLI. »

---

## 44. Notifications

Créer un système central de notifications. Types : `PAYMENT_CONFIRMED`, `FUNDS_SECURED`, `ORDER_ACCEPTED`, `PACKAGE_READY`, `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`, `CUSTOMER_CONFIRMED`, `FUNDS_RELEASED`, `DISPUTE_OPEN`, `REFUND`

---

## 45. Notifications par utilisateur

Chaque utilisateur possède : notifications non lues, notifications lues, date, type, lien vers l'objet concerné.

---

## 46. Recherche et filtres

Les dashboards doivent avoir : Recherche, Filtres, Tri, Pagination. Ne pas charger inutilement des milliers de données côté client.

---

## 47. Sécurité

Implémenter : authentification sécurisée, autorisation par rôle, validation serveur, validation frontend, protection des routes, protection API, gestion des erreurs, logs, audit, limitation des tentatives OTP, protection contre les doubles opérations.

**IMPORTANT :** Ne jamais faire confiance uniquement au frontend. Toute opération importante doit être vérifiée côté backend.

---

## 48. Journal d'audit

Créer un système d'audit. Exemple : `USER: Admin` — `ACTION: FUNDS_RELEASE_TEST` — `ORDER: KOLI-000124` — `DATE: …`

L'audit doit permettre de comprendre ce qui s'est passé.

---

## 49. Architecture de la base de données

Prévoir au minimum : `users`, `roles`, `seller_profiles`, `customer_profiles`, `driver_profiles`, `products`, `product_images`, `orders`, `order_items`, `payments`, `transactions`, `funds`, `deliveries`, `delivery_proofs`, `otp_codes`, `disputes`, `dispute_messages`, `refunds`, `invoices`, `commissions`, `notifications`, `audit_logs`, `kyc_documents`, `settings`

---

## 50. Relations principales

- Un USER possède un ROLE.
- Un SELLER possède plusieurs PRODUCTS.
- Un SELLER possède plusieurs ORDERS.
- Un ORDER appartient à un SELLER.
- Un ORDER possède plusieurs ORDER_ITEMS.
- Un ORDER peut avoir un PAYMENT.
- Un ORDER peut avoir une DELIVERY.
- Une DELIVERY peut avoir une DELIVERY_PROOF.
- Une DELIVERY utilise un DRIVER.
- Un ORDER peut avoir un DISPUTE.
- Un ORDER peut avoir un REFUND.
- Un ORDER possède des TRANSACTIONS.

---

## 51. Architecture financière

Créer une abstraction de paiement.

Exemple conceptuel : `PaymentProvider` → `TestPaymentProvider` → (plus tard) `RealPaymentProvider`

Cela permettra de remplacer facilement le paiement test par le véritable partenaire financier. **NE PAS** coder toute la logique KOLI directement dans le fournisseur de paiement — KOLI doit posséder sa propre logique métier.

---

## 52. Future intégration Mobile Money

La plateforme doit être préparée pour intégrer plus tard un partenaire permettant : paiement Mobile Money, vérification du paiement, transfert, remboursement, éventuellement mécanisme de fonds sécurisés selon les capacités et le cadre réglementaire du partenaire.

Aucun fournisseur réel ne doit être inventé dans le code. Utiliser des interfaces et des mocks en attendant le partenaire.

---

## 53. KOLI Connect — futur

Préparer l'architecture pour permettre à un vendeur de créer un lien `koli.app/pay/XXXXX` utilisable partout. KOLI doit progressivement devenir compatible avec : WhatsApp, Facebook, TikTok, Instagram, site web, e-commerce tiers.

---

## 54. Future API KOLI

Préparer une API versionnée, ex. `/api/v1/`. Elle devra éventuellement permettre : création de commande, consultation commande, création lien paiement, consultation paiement, webhook, confirmation livraison.

Ne pas développer toute l'API externe maintenant — préparer une architecture propre.

---

## 55. Marketplace — dernière phase

La marketplace KOLI ne doit **PAS** être le premier produit. Elle viendra après l'infrastructure principale.

Le vendeur pourra choisir : 1) vendre ailleurs et utiliser KOLI ; 2) vendre sur KOLI ; 3) utiliser les deux.

---

## 56. Design UI

**Le design doit être :** moderne, professionnel, minimaliste, rassurant, facile à comprendre, adapté aux utilisateurs africains, rapide, mobile-first.

**Éviter :** interfaces trop chargées, animations excessives, boutons inutiles, textes trop longs, dashboards compliqués.

---

## 57. Design des boutons

Les boutons principaux doivent être clairement identifiables. Exemples : « Créer une commande », « Ajouter un produit », « Copier le lien », « Payer avec KOLI », « Confirmer la réception », « Signaler un problème », « Assigner un livreur », « Confirmer la livraison », « Voir la commande », « Ouvrir un litige »

---

## 58. Boutons dangereux

Les actions sensibles doivent demander confirmation. Exemples : Supprimer produit, Suspendre vendeur, Annuler commande, Rembourser, Résoudre litige, Suspendre compte. Afficher une confirmation avant l'action.

---

## 59. Page d'accueil

**Header :** KOLI, Comment ça marche, Pour les vendeurs, Connexion, Créer un compte

**Hero :** « Achetez. Recevez. Validez. »
**Sous-titre :** « KOLI sécurise vos achats en ligne et facilite les transactions entre clients et vendeurs. »
**CTA :** « Commencer » / **2e CTA :** « Je suis vendeur »

---

## 60. Section comment ça marche

Quatre étapes : 1) Commandez 2) Payez 3) Recevez 4) Validez

Puis expliquer : « Le paiement est sécurisé jusqu'à la confirmation de réception selon les règles applicables. »

---

## 61. Section pour les vendeurs

Message : « Vendez sur WhatsApp, Facebook, TikTok, Instagram ou votre propre site. »
CTA : « Créer mon compte vendeur »

---

## 62. Page de connexion

**Champs :** Téléphone ou email, Mot de passe
**Bouton :** « Se connecter »
**Liens :** « Mot de passe oublié ? » / « Créer un compte »

---

## 63. Page d'inscription

**Choix :** « Je suis client » / « Je suis vendeur » / « Je suis livreur »

Le rôle doit déterminer l'expérience après inscription.

---

## 64. Page de profil

Chaque utilisateur peut gérer : nom, téléphone, email, photo, adresse, mot de passe, paramètres. Les champs sensibles doivent être protégés.

---

## 65. Gestion des erreurs

Toutes les erreurs doivent être compréhensibles. Ne jamais afficher uniquement « Error 500 ». Préférer « Une erreur est survenue. Veuillez réessayer. » Pour les erreurs utilisateur : « Ce numéro de téléphone est déjà utilisé. »

---

## 66. États de chargement

Chaque page ou action nécessitant un traitement doit avoir : loading, success, error, empty state. Ne jamais laisser l'utilisateur devant une page blanche.

---

## 67. Empty states

Exemple : Aucune commande. Afficher « Vous n'avez pas encore de commande. » puis « Créer une commande »

---

## 68. Responsivité du dashboard

**Desktop :** Sidebar + contenu. **Mobile :** Header + menu.

Les cartes statistiques doivent passer : 4 colonnes → 2 colonnes → 1 colonne. Les tableaux doivent devenir des cartes ou listes adaptées.

---

## 69. Accessibilité

Prévoir : contraste suffisant, boutons accessibles, labels de formulaires, navigation clavier, textes lisibles, messages d'erreur compréhensibles.

---

## 70. Performance

**Éviter :** images trop lourdes, appels API inutiles, chargements répétitifs, composants inutilement complexes.

**Utiliser :** pagination, lazy loading lorsque nécessaire, compression des images, cache approprié.

---

## 71. Tests

Chaque module doit être testé.

- **Authentification :** inscription, connexion, déconnexion, mauvais mot de passe, rôle.
- **Commande :** création, modification, annulation, statut.
- **Paiement :** succès test, échec test, double paiement.
- **Livraison :** assignation, récupération, livraison, OTP.
- **Litige :** ouverture, traitement, décision.
- **Permissions :** un client ne doit jamais accéder aux fonctions vendeur ; un vendeur ne doit jamais accéder à l'administration ; un livreur ne doit jamais accéder aux données financières sensibles.

---

## 72. Test de scénario complet

Avant de considérer le MVP terminé, exécuter exactement ce scénario :

1. Créer un vendeur.
2. Créer un client.
3. Créer un livreur.
4. Créer un produit.
5. Créer une commande.
6. Générer le lien KOLI.
7. Ouvrir le lien en tant que client.
8. Effectuer un paiement TEST réussi.
9. Vérifier que les fonds deviennent sécurisés.
10. Vérifier que le vendeur voit la commande.
11. Assigner le livreur.
12. Le livreur récupère le colis.
13. Le livreur passe en livraison.
14. Le livreur arrive.
15. Générer OTP.
16. Entrer OTP.
17. Confirmer la livraison.
18. Client confirme réception.
19. Vérifier la libération TEST.
20. Vérifier le solde vendeur.
21. Vérifier la transaction.
22. Vérifier l'audit.
23. Vérifier la facture.
24. Vérifier les notifications.

---

## 73. Test de litige

Deuxième scénario obligatoire :

1. Créer commande.
2. Paiement test.
3. Fonds sécurisés.
4. Livraison.
5. Client ouvre litige.
6. Vérifier que les fonds ne sont pas libérés.
7. Ajouter preuve.
8. Admin consulte.
9. Admin prend une décision.
10. Vérifier le résultat.
11. Vérifier l'audit.
12. Vérifier les notifications.

---

## 74. Test responsive

Tester chaque écran sur : petit smartphone, grand smartphone, tablette, laptop, desktop.

**Vérifier :** aucun débordement, aucun texte coupé, aucun bouton inaccessible, aucune table cassée, aucun formulaire trop large, aucune navigation cassée.

---

## 75. Mode test

Toutes les fonctionnalités financières du MVP doivent afficher clairement **TEST MODE**.

Exemple : « KOLI fonctionne actuellement en mode test. Aucun paiement réel n'est effectué. »

Ne jamais présenter un paiement simulé comme un véritable paiement.

---

## 76. Architecture évolutive

Le code doit être organisé de façon modulaire. Éviter un fichier gigantesque contenant toute la logique.

**Séparer :** UI, composants, pages, API, services, logique métier, base de données, authentification, paiements, commandes, livraisons, litiges, notifications.

---

## 77. Règle pour Claude Code

Claude Code doit :
1. inspecter le projet avant de modifier ;
2. comprendre l'architecture existante ;
3. ne pas supprimer une fonctionnalité existante sans raison ;
4. ne pas créer de doublons ;
5. réutiliser les composants ;
6. garder le code propre ;
7. tester chaque changement ;
8. expliquer les changements importants ;
9. corriger les erreurs avant de continuer ;
10. respecter ce document.

---

## 78. Ordre exact d'implémentation

Claude Code doit suivre cet ordre :

- **PHASE 0** — Documentation et architecture.
- **PHASE 1** — Initialisation du projet.
- **PHASE 2** — Base de données.
- **PHASE 3** — Authentification.
- **PHASE 4** — Rôles et permissions.
- **PHASE 5** — Dashboard vendeur.
- **PHASE 6** — Produits.
- **PHASE 7** — Clients.
- **PHASE 8** — Création de commandes.
- **PHASE 9** — Lien de paiement.
- **PHASE 10** — Checkout.
- **PHASE 11** — Paiement simulé.
- **PHASE 12** — Fonds sécurisés simulés.
- **PHASE 13** — Dashboard client.
- **PHASE 14** — Dashboard livreur.
- **PHASE 15** — Gestion de livraison.
- **PHASE 16** — OTP.
- **PHASE 17** — Confirmation client.
- **PHASE 18** — Libération simulée.
- **PHASE 19** — Transactions.
- **PHASE 20** — Factures.
- **PHASE 21** — Litiges.
- **PHASE 22** — Remboursements simulés.
- **PHASE 23** — Dashboard admin.
- **PHASE 24** — KYC.
- **PHASE 25** — Notifications.
- **PHASE 26** — Audit et sécurité.
- **PHASE 27** — Tests complets.
- **PHASE 28** — Optimisation responsive.
- **PHASE 29** — Préparation intégration financière.
- **PHASE 30** — Intégration du partenaire financier lorsque celui-ci sera sélectionné.
- **PHASE 31** — Mobile Money réel.
- **PHASE 32** — KOLI Connect.
- **PHASE 33** — Réseau de livraison KOLI.
- **PHASE 34** — Marketplace KOLI.

---

## 79. Phase 0 — condition de départ

Avant de commencer à coder, Claude Code doit produire un document technique comprenant : architecture, structure des dossiers, schéma de base de données, rôles, permissions, workflow des commandes, workflow des paiements, workflow des livraisons, workflow des litiges, routes, composants principaux.

Il doit ensuite vérifier que cette architecture respecte le présent document.

**NE PAS** commencer par coder les paiements réels.

---

## 80. Critère de fin du MVP

KOLI V1 sera considéré comme fonctionnel lorsque ce scénario fonctionne entièrement en environnement TEST :

```
VENDEUR → CRÉE PRODUIT → CRÉE COMMANDE → GÉNÈRE LIEN
→ CLIENT OUVRE LIEN → CLIENT SIMULE PAIEMENT → FONDS TEST SÉCURISÉS
→ VENDEUR ASSIGNE LIVREUR → LIVREUR LIVRE → OTP → CLIENT CONFIRME
→ FONDS TEST LIBÉRÉS → TRANSACTION ENREGISTRÉE → FACTURE GÉNÉRÉE
→ NOTIFICATIONS ENVOYÉES → AUDIT ENREGISTRÉ
```

Le scénario de litige doit également fonctionner.

---

## 81. Ce qui ne doit pas être développé au début

**Ne pas commencer par :** marketplace, application mobile native, réseau de livreurs KOLI, paiement réel, wallet réel, système financier propriétaire, intégrations complexes, dizaines de fonctionnalités secondaires.

**Le premier objectif est : CONSTRUIRE ET TESTER LE MOTEUR DE CONFIANCE DE KOLI.**

---

## 82. Priorité absolue

Les trois éléments les plus importants de KOLI sont :
1. Commande
2. Livraison vérifiable
3. Paiement sécurisé avec libération conditionnelle

Tout le reste vient autour.

---

## 83. Future intégration financière

Lorsque KOLI aura trouvé un partenaire financier agréé, ne pas réécrire toute la plateforme. Le système doit permettre de remplacer `TEST PAYMENT` par `REAL PAYMENT PROVIDER` sans modifier le fonctionnement général des commandes.

La logique métier doit rester dans KOLI. Le fournisseur financier doit être une couche externe.

---

## 84. Règle juridique et financière

KOLI ne doit pas prétendre détenir légalement les fonds des clients avant validation du cadre applicable. Dans le MVP, les fonds sont fictifs.

**Avant les paiements réels :** identifier le pays, identifier le partenaire financier, vérifier son agrément, vérifier les services autorisés, définir juridiquement le mécanisme de conservation/libération, définir KYC/AML, définir remboursements, définir responsabilités, valider les contrats nécessaires.

---

## 85. Objectif final

KOLI doit évoluer progressivement vers :
- **KOLI PAY** — Paiement sécurisé.
- **KOLI SECURE** — Protection de la transaction.
- **KOLI DELIVERY** — Gestion de livraison.
- **KOLI PROTECT** — Gestion des litiges.
- **KOLI CONNECT** — Infrastructure utilisable depuis n'importe quelle plateforme.
- **KOLI MARKET** — Marketplace éventuelle.

---

## 86. Règle finale pour Claude Code

**NE PAS** essayer d'impressionner avec une quantité énorme de fonctionnalités.

Construire quelque chose de : stable, simple, sécurisé, responsive, maintenable, évolutif.

Chaque phase doit être terminée et testée avant de passer à la suivante. Le résultat final doit être une plateforme professionnelle capable d'évoluer vers une véritable infrastructure de commerce et de paiement sécurisé en Afrique.

---

## 87. Première action à exécuter

**NE PAS CODER IMMÉDIATEMENT.**

Commencer par :
1. **Étape 1** — Analyser ce document.
2. **Étape 2** — Créer l'architecture technique proposée.
3. **Étape 3** — Créer le schéma de base de données.
4. **Étape 4** — Créer l'arborescence du projet.
5. **Étape 5** — Présenter ces trois éléments pour validation.
6. **Étape 6** — Après validation seulement, commencer l'implémentation de la PHASE 1.

---

*FIN DU MASTER IMPLEMENTATION PLAN*

**KOLI — « Achetez. Recevez. Validez. »**

Version MVP : **MODE TEST**. Aucun paiement réel avant validation du partenaire financier et du cadre réglementaire applicable.
