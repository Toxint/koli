# KOLI — mémoire du projet

**À lire en entier au début de toute conversation.** Ce fichier existe pour
qu'une IA qui arrive sans rien sache, en une lecture, ce qu'est KOLI, ce qui a
été décidé, ce qui est fait, et comment travailler ici sans casser ce qui
tient.

Il est mis à jour **à la fin de chaque grosse étape** — c'est une consigne
permanente, pas une politesse. Une décision non consignée ici sera reprise à
zéro, et probablement autrement.

> **Pourquoi ce fichier est à la racine et non dans `docs/`**, alors que
> `docs/` est le dépôt de référence du projet : Claude Code charge
> automatiquement `CLAUDE.md` depuis la racine. Le mettre ailleurs reviendrait à
> écrire une consigne que personne ne lit.

---

## 1. Ce qu'est KOLI

Une **infrastructure de confiance pour le commerce en ligne africain**.

Le problème : sur WhatsApp, Facebook, TikTok ou Instagram, l'acheteur doit
payer un inconnu avant d'avoir reçu, et le vendeur doit expédier avant d'être
sûr d'être payé. Chacun peut se faire avoir, et les deux le savent — ce qui
freine tout le commerce.

KOLI s'interpose : l'argent du client est **séquestré**, le vendeur expédie en
sachant que les fonds existent, le client confirme la réception avec un **code
OTP**, et les fonds sont alors **libérés** au vendeur, commission déduite.

Chaîne complète :

```
commande → paiement → séquestre → livraison → OTP → confirmation → libération
```

Quatre rôles : **client**, **vendeur**, **livreur**, **administrateur**.

---

## 2. Contraintes absolues

Elles viennent du document maître et ne se négocient pas.

### Le MVP est en MODE TEST — aucun argent réel ne circule

Paiement, séquestre, libération, commissions, remboursements : **tout est
simulé**. Mais tout est architecturé derrière une abstraction
(`PaymentProvider` → `TestPaymentProvider`) pour qu'un vrai prestataire se
branche un jour sans réécrire la logique métier.

Ne jamais passer `PAYMENT_MODE` à autre chose que `test` sans validation
explicite.

### L'ordre des phases est imposé (§78 du plan)

34 phases, de la documentation (0) à la marketplace (34). **Ne jamais anticiper**
sur : marketplace, application mobile native, réseau de livreurs KOLI propre,
paiement réel, portefeuille réel.

### Une phase à la fois, sur signal explicite

L'utilisateur dit « Phase N ». On implémente **cette phase seulement**, on la
fait vérifier, on s'arrête, on attend le signal suivant. Ne jamais enchaîner de
soi-même sur la phase d'après.

### Mobile d'abord

Le public vise le téléphone. Coupures : mobile 320–767 px, tablette 768–1023 px,
bureau 1024 px et plus.

### La machine à états des commandes est stricte

22 statuts, transitions contrôlées. Aucune transition illégale ne doit être
possible, même par une route d'API.

---

## 3. Documents de référence

| Fichier | Rôle |
|---|---|
| `docs/koli-plan.md` | **Le document maître.** 87 sections. Fait foi sur le périmètre, l'ordre des phases, les règles métier. À consulter avant toute tâche importante. |
| `docs/architecture.md` | Architecture technique, schéma de données, décisions et leurs raisons. |
| `docs/*.pdf` | Le PDF source d'origine. |
| `CLAUDE.md` | Ce fichier. Le résumé opérationnel. |

`docs/` est le seul dépôt de matière de référence : rien de tel à la racine.

---

## 4. État au 26 août 2026

### Fait

**Phases 0 à 29.** Toutes les fonctionnalités du MVP sont implémentées et
vérifiées.

Le **critère de fin du MVP (§80)** est atteint : `npm run verif:parcours` passe
35/35 — vendeur crée un produit, crée une commande, génère un lien ; le client
ouvre le lien, simule le paiement ; les fonds test sont sécurisés ; le vendeur
assigne un livreur ; le livreur livre ; OTP ; le client confirme ; les fonds
sont libérés ; transaction enregistrée, facture émise, notifications envoyées,
audit consigné. Le scénario de litige passe également.

La campagne complète — `npm run verif:tout`, plus de 450 contrôles — passe sans
un seul échec.

### En cours

**Mise en ligne.** Choix retenu : **Vercel + Supabase**. L'adaptateur de
stockage des pièces KYC vers Supabase Storage est écrit et testé ; il reste à
créer le seau (`npm run supabase:stockage`, demande la clef `service_role`) puis
à déployer.

### Ensuite

**Phase 30 — intégration du partenaire financier.** Bloquée sur une décision
métier : le partenaire n'est pas choisi. Trois points restent ouverts et en
dépendent, documentés en fin de `docs/architecture.md` : le versement au
vendeur, le remboursement automatique, le séquestre réglementaire.

---

## 5. Comment travailler ici

### La base de données : LOCALE, jamais Supabase

```bash
npm run base:demarrer    # PostgreSQL 17.6 sur localhost:5433
npm run base:preparer    # démarre + migrations + jeu de données
npm run base:etat
npm run base:arreter
```

**Ce n'est pas une préférence, c'est une nécessité.** L'utilisateur doit garder
un VPN allumé en permanence — sans lui, l'outillage ne fonctionne pas. Ce VPN
coûte 466 ms rien que pour atteindre `1.1.1.1`, porte l'aller-retour vers
Supabase à 700–1100 ms, et **coupe le port 5432**.

Conséquence mesurée : une page du produit enchaîne ~13 requêtes ; la page de
paiement mettait **26 secondes** contre Supabase, et **38 ms** en local. À cette
latence, les scripts de vérification expirent et rapportent des défauts qui
n'existent pas. Cela a coûté une demi-journée de fausses pistes.

`npm run verif:latence` mesure et **arrête la campagne au-delà de 250 ms**.

Supabase reste la base de **déploiement**. Pour la préparer :
`npm run supabase:preparer -- --par-le-pooler` (le `--par-le-pooler` contourne
le port 5432 coupé).

### Le serveur

```bash
npm run build
npx next start -H 0.0.0.0 -p 3000
```

Il tourne en **production** (`next start`), pas en `next dev`.

**Ne jamais lancer `npm run build` pendant qu'il sert** : le processus garde en
mémoire les anciens fragments, la page se remonte en boucle, et les tests
échouent avec « element was detached from the DOM ». Séquence correcte :
arrêter → construire → relancer → vérifier.

L'adresse Wi-Fi change souvent. La relire avec
`Get-NetIPAddress -AddressFamily IPv4` avant de donner un lien, en ignorant
`127.*`, `169.254.*` et l'interface VPN `10.2.*`.

### La vérification

```bash
npm run verif:tout       # la campagne complète
npm run verif:latence    # la base répond-elle assez vite ?
npm run verif:requetes   # chaque requête SQL est-elle valide contre le schéma ?
npm run verif:schema     # intégrité : clefs étrangères, orphelins, migrations
npm run verif:parcours   # le parcours complet — le critère du §80
```

29 commandes `verif:*` au total. Elles pilotent un **vrai navigateur**
(Playwright) contre le **vrai serveur** et lisent la **vraie base**. Un écran
peut mentir sans que la base bouge, et l'inverse.

**281 tests unitaires** par ailleurs (`npm test`, Vitest).

---

## 6. Technologies

| Domaine | Choix |
|---|---|
| Cadre | Next.js 16 (App Router, actions serveur), React 19 |
| Langage | TypeScript strict |
| Base | PostgreSQL 17.6 — Supabase en ligne, embarqué en local |
| ORM | Prisma 7 avec adaptateur `@prisma/adapter-pg` |
| Styles | Tailwind CSS 4 |
| Validation | Zod |
| Sessions | JWT en cookie, signés avec `jose` |
| Mots de passe | bcryptjs |
| Tests unitaires | Vitest |
| Tests de bout en bout | Playwright, scripts maison dans `scripts/` |

---

## 7. Structure des fichiers

```
app/                     Routes Next.js, groupées par rôle
  (public)/              accueil, connexion, inscription, pages légales
  (vendeur)/vendeur/     tableau de bord, produits, commandes, clients,
                         factures, solde, transactions, vérification
  (client)/client/       tableau de bord, factures, profil
  (livreur)/livreur/     tableau de bord, profil
  (admin)/admin/         utilisateurs, vendeurs, litiges, remboursements,
                         transactions, commissions, journal, vérifications
  pay/[reference]        le lien de paiement — la page vue par l'acheteur
  facture/[reference]    la facture
  litige/[reference]     le litige
  api/                   routes d'API (rappel de paiement, pièces KYC, OAuth)

lib/                     La logique métier. C'est ici que tout se décide.
  orders/  payments/  deliveries/  disputes/  refunds/  finance/
  invoices/  notifications/  audit/  kyc/  sellers/  products/
  auth/    db/       admin/       config/     navigation.ts  format.ts
  __tests__/             les tests unitaires

components/
  ui/                    composants génériques
  domain/                composants métier
  driver/                l'espace livreur

prisma/
  schema.prisma          24 modèles
  migrations/            migrations PostgreSQL
  seed.ts                jeu de données de démonstration

scripts/                 40 fichiers — vérification et outillage
  base-locale.mjs        PostgreSQL local
  base-donnees.mjs       accès base partagé par les scripts
  env.mjs                lecture de .env.local puis .env
  preparer-supabase.mjs  mise en route Supabase
  preparer-stockage.mjs  seau des pièces KYC
  verifier-*.mjs         contrôles (schéma, requêtes, latence)
  test-*.mjs             parcours de bout en bout

docs/                    documents de référence
```

---

## 8. Décisions de conception, et pourquoi

Ces raisons comptent autant que les décisions. Sans elles, la décision suivante
les défera.

### Les pièces d'identité ne vivent JAMAIS sous `public/`

Un dossier de `public/` est servi tel quel, sans contrôle : une carte
d'identité y serait lisible par quiconque devine son adresse, et rien ne le
signalerait. Elles vivent hors de l'arborescence servie, et `/api/kyc/<id>` est
le seul chemin qui les restitue, après vérification du demandeur.

Le nom du fichier est **tiré au sort**, jamais dérivé de celui fourni : un nom
venu du navigateur peut contenir `../` ou simplement le nom de son
propriétaire.

En production, `lib/kyc/stockage.ts` **refuse** de se rabattre sur le disque
local : sur un hébergement sans serveur, les pièces disparaîtraient au
déploiement suivant, sans erreur et sans trace.

### Le type d'un fichier est déterminé en le LISANT

Jamais d'après ce que le navigateur annonce : `Content-Type` vient du client et
se falsifie en une ligne. Un fichier HTML présenté comme `image/png` et servi
comme tel deviendrait une page exécutée dans notre propre domaine. SVG est
délibérément refusé — c'est du XML, il peut porter du script.

### Le rappel du prestataire de paiement est signé

`/api/paiements/rappel` est la porte d'entrée la plus dangereuse du système :
un rappel accepté sans preuve d'origine permettrait à quiconque connaît une
référence de marquer une commande payée, donc de faire expédier un colis sans
jamais payer. La signature HMAC est vérifiée avant tout.

La réponse ne révèle pas si une référence existe : sinon le point d'entrée
devient un oracle.

### Aucune valeur de repli sur les secrets

`AUTH_SECRET` absent ⇒ l'application refuse de démarrer. Un secret codé en dur
est un secret public. De même, `DATABASE_URL` absent ⇒ échec net : un repli
ferait travailler l'application sur les mauvaises données, sans le dire.

### Les vérifications interrogent la VRAIE base

Un contrôle d'intégrité qui inspecte une autre base que celle qui sert est pire
que pas de contrôle : il inspire une confiance qu'il ne mérite pas. C'est
arrivé — `verif:schema` a longtemps lu un fichier SQLite local après la
migration vers PostgreSQL, et restait vert quoi qu'il arrive.

### Un contrôle qui ne peut pas échouer ne protège rien

Corollaire du précédent. Quand un contrôle ne peut pas s'exercer (donnée
absente), il le **dit** au lieu de se taire. Et quand on écrit un contrôle, on
le falsifie : on fabrique le défaut qu'il cherche et on vérifie qu'il le voit.

### Les tests attendent une CONSÉQUENCE, jamais un délai

`waitForTimeout(600)` est un pari sur la vitesse de la machine et du réseau.
Ces délais, calibrés sur une base locale, ont produit neuf faux diagnostics
d'un coup lorsque la base est passée à distance. On attend que la base porte
l'écriture, que l'étape suivante s'affiche, que la navigation ait eu lieu.

### Les identifiants SQL sont guillemetés

PostgreSQL replie en minuscules tout identifiant non guillemeté : `FROM User`
y cherche une table `user`. `npm run verif:requetes` fait **préparer** chaque
requête par PostgreSQL — sans l'exécuter — et refuse ce qui ne tient pas.

### `.env.local` prime sur `.env`

`.env.local` désigne la base locale de développement, `.env` la base Supabase.
`scripts/env.mjs` reproduit l'ordre de Next. **Exception délibérée** :
`preparer-supabase.mjs` lit `.env` seul — il prépare Supabase, et son option
`--ecraser` supprime le schéma public. Une confusion entre les deux bases ne
serait pas une gêne, ce serait une destruction.

---

## 9. Règles pour l'IA qui reprend

1. **Lire `docs/koli-plan.md` avant toute tâche importante.** Il fait foi.
2. **Une phase à la fois**, sur signal explicite de l'utilisateur. Ne jamais
   enchaîner de soi-même.
3. **Vérifier avant d'affirmer.** Ne jamais annoncer qu'une chose fonctionne
   sans l'avoir fait tourner. Ne jamais donner un lien `localhost` sans avoir
   vérifié que le serveur répond.
4. **Proposer.** L'utilisateur construit son premier produit et compte sur
   l'IA pour signaler ce qu'il ne penserait pas à demander : une contradiction
   dans la spécification, un risque, un meilleur choix par défaut. Le dire même
   sans y être invité.
5. **Rendre compte honnêtement.** Si un test échoue, le dire avec sa sortie. Si
   une étape a été sautée, le dire. Ne pas noyer un échec dans une liste de
   succès.
6. **Ne jamais faire tourner la campagne de bout en bout contre Supabase depuis
   cette machine.** Les résultats seraient faux — voir §5.
7. **Mettre ce fichier à jour à la fin de chaque grosse étape.** C'est la
   consigne qui garde toutes les autres vivantes.

---

## 10. Comptes de démonstration

Mot de passe commun : `Password123!`

| Rôle | Adresse |
|---|---|
| Administrateur | `admin@koli.ci` |
| Vendeur | `vendeur@koli.ci` |
| Vendeur (concurrent, pour les contrôles de cloisonnement) | `vendeur2@koli.ci` |
| Client | `client@koli.ci` |
| Livreur | `livreur@koli.ci` |
