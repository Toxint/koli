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
| `docs/deploiement.md` | Liste de contrôle pour la mise en ligne : variables, région, pièges. |
| `docs/*.pdf` | Le PDF source d'origine. |
| `CLAUDE.md` | Ce fichier. Le résumé opérationnel. |

`docs/` est le seul dépôt de matière de référence : rien de tel à la racine.

---

## 4. État au 31 août 2026

### Fait

**Phases 0 à 29.** Toutes les fonctionnalités du MVP sont implémentées et
vérifiées.

Depuis, du travail de finition hors phases : la vitrine publique (section
« Pourquoi choisir KOLI », témoignages d'exemple visibles nulle part ailleurs
qu'en démonstration, pied de page à quatre colonnes) et les **courbes
de performance** des tableaux de bord vendeur et livreur — quatorze jours, une
mesure, `npm run verif:courbes`.

Le 29 août 2026, deux choses de plus.

**L'unification des couleurs.** L'application mélangeait les teintes là où elle
n'aurait pas dû : quatre pastilles de quatre couleurs sur « Comment ça marche »,
trois sur la mention du mode test, une courbe verte sous une grille verte dans
une page violette. Tout ce qui *encadre un pictogramme ou trace une courbe* est
désormais du **violet de la marque**, une seule valeur. L'or reste l'accent, et
seulement l'accent. Le raisonnement complet est en tête de `app/globals.css`.

**Les vignettes d'activité** (`components/domain/AnnoncesActivite.tsx`), reprises
de `app.saspay.me` : une carte qui monte du coin bas-gauche de l'accueil, dit
qu'une personne vient de s'inscrire ou qu'un vendeur vient d'être payé, et
repart. Elles sont **soumises à la même garde que les témoignages d'exemple** —
voir plus bas pourquoi ce n'est pas un excès de prudence.
`npm run verif:annonces`.

Le 30 août 2026, deux chantiers de plus.

**Les équipes de livraison (§5.3).** Le plan dit « au début, chaque vendeur peut
utiliser son propre livreur » ; le code faisait le contraire —
`listAvailableDriversAction` renvoyait **tous** les livreurs actifs de la
plateforme, et l'assignation ne vérifiait que l'existence du compte. Un vendeur
pouvait donc faire porter ses colis par le livreur d'un concurrent. Un vendeur
n'a désormais que **son** équipe, remplie par un **lien d'invitation**.
`npm run verif:livreurs`.

**Le jeu de démonstration ne part plus en production.**
`preparer-supabase.mjs` lançait `prisma/seed.ts` contre Supabase : le premier
vrai vendeur y aurait lu des encaissements qui ne sont ceux de personne, et
`admin@koli.ci` / `Password123!` ouvrait l'administration. Deux fichiers
séparent maintenant les deux besoins — voir plus bas.

**Trois visages remplacent trois pictogrammes** dans la pastille d'accueil
(`components/ui/VisagesRoles.tsx`) — de **vraies photographies**, sous licence
Pexels, provenance notée dans le fichier. Et les pastilles des
« Fonctionnalités » sont passées du rose très pâle au violet plein : deux
teintes claires l'une sur l'autre, la pastille ne se voyait plus.

**Les vignettes d'activité ne sont plus inventées.** Elles lisent le registre
(`lib/notifications/activite.ts`) : une inscription affichée est une
inscription qui a eu lieu. La garde `exemplesTemoignagesAutorises` et la
mention « exemple » ont disparu — non par décision, mais parce que ce qu'elles
protégeaient n'existe plus. S'il ne s'est rien passé, rien ne s'affiche.

**Les anneaux de l'accueil se voient enfin.** Ils tournaient en 90 et 140
secondes à 17 % d'opacité — assez lents pour rester sous le seuil de
l'attention, ce qui était l'intention et ratait l'effet : on ne voyait pas que
la page était vivante, on ne voyait rien. 42 et 66 secondes, 30 % d'opacité,
traits épaissis et repères à 9 px. Accélérer ne coûte rien de plus : le prix
d'une animation se paie par image affichée, pas par tour effectué.

**La marque a un dessin** (`components/ui/LogoKoli.tsx`). Sept carrés recopiés
à la main — trois couleurs, trois rayons, cinq tailles — sont devenus un
composant : un anneau ouvert avec un comma dedans, sans contenant, repris du
langage d'une icône donnée en référence. Et un **favicon**, qui n'existait pas
du tout. Voir §8.

Règle du pied de page : **chaque lien pointe une page qui existe.** La rubrique
légale n'en compte que deux parce que le site n'a que deux pages légales — un
« Mentions légales » ajouté pour équilibrer la colonne serait un lien mort, et
personne ne clique un pied de page assez souvent pour le signaler.

Le **critère de fin du MVP (§80)** est atteint : `npm run verif:parcours` passe
35/35 — vendeur crée un produit, crée une commande, génère un lien ; le client
ouvre le lien, simule le paiement ; les fonds test sont sécurisés ; le vendeur
assigne un livreur ; le livreur livre ; OTP ; le client confirme ; les fonds
sont libérés ; transaction enregistrée, facture émise, notifications envoyées,
audit consigné. Le scénario de litige passe également.

La campagne complète — `npm run verif:tout`, plus de 450 contrôles — passe sans
un seul échec.

### En cours

**Mise en ligne.** Choix retenu : **Vercel + Supabase**. Voir
`docs/deploiement.md` pour la liste de contrôle complète.

Prêt : schéma Supabase appliqué ; seau de stockage KYC créé, privé, aller-retour
vérifié ; adaptateur `magasin-supabase` éprouvé contre le vrai seau ;
`npm run build` régénère le client Prisma (sans quoi la construction échouerait
sur Vercel, le client n'étant pas versionné).

**La base Supabase est propre depuis le 31 août 2026.** Elle a porté le jeu de
démonstration pendant six jours — 15 commandes, 36 transactions, et
`admin@koli.ci` / `Password123!`, publié dans ce dépôt, qui ouvrait
l'administration. Tout est retiré :

- migration des équipes de livraison appliquée (`npm run supabase:migrer -- --appliquer`) ;
- mouvements et cinq comptes de démonstration supprimés en une transaction
  (`npm run supabase:nettoyer`) ;
- administrateur recréé avec un mot de passe tiré au sort (`prisma/amorce.ts`).

Il reste **4 comptes** : les trois inscrits depuis le site, et l'administrateur.
Zéro commande, zéro transaction, commission à 5 % conservée.

⚠ **Ne jamais relancer `prisma/seed.ts` contre Supabase.** C'est ce qui a mis la
démonstration en ligne. `supabase:preparer` pose désormais l'amorce, et la
démonstration exige `--avec-demonstration`.

Le dépôt distant existe : `github.com/Toxint/koli`, branche `master`. Le projet
Vercel existe aussi et le poste y est lié (`.vercel/`, projet `koli`) —
`npm run vercel:variables` et `npm run vercel:redeployer`.

⚠ **Une migration appliquée à Supabase ne suffit pas** : le code déployé doit
suivre, sinon il tourne contre un schéma qu'il ne connaît pas. Après
`supabase:migrer`, redéployer.

⚠ `NEXT_PUBLIC_APP_URL` vaut encore `http://localhost:3000` dans `.env`. Cette
valeur sert aux **liens de paiement partagés** : telle quelle, un lien envoyé à
un client pointerait vers sa propre machine. À renseigner côté Vercel avec
l'adresse réelle du site.

⚠ `AUTH_SECRET` vaut `koli-dev-…` : ce n'est pas un tirage aléatoire. Il signe
les jetons de session — en production, une valeur devinable permettrait de
forger la session de n'importe quel compte, administrateur compris. **À
régénérer avant la mise en ligne.**

### Ensuite

**Phase 30 — intégration du partenaire financier.** Le partenaire est choisi :
**iKeePay**. Le fournisseur est écrit et éprouvé (`lib/payments/IkeePayProvider.ts`,
`lib/__tests__/ikeepay.test.ts`), mais **il n'est pas activé** :
`PAYMENT_MODE` reste sur `test`, aucun argent ne bouge.

**Le 2 septembre 2026, la chaîne réelle a été jouée de bout en bout** —
`npm run ikeepay:repetition`, dix-neuf contrôles, sans un franc. Elle a trouvé
le défaut qui rendait tout le reste inutile : le rappel notait le paiement et
**ne faisait rien** — ni séquestre, ni facture, ni notification. Corrigé
(`lib/payments/aboutissement.ts`), et le schéma connaît enfin iKeePay
(migration `20260902110753_fournisseur_ikeepay`). Voir §8.

Ce qui manque pour un essai réel, dans l'ordre :

1. **Les deux clefs iKeePay**, à coller dans `.env.local` — les lignes y sont,
   vides. `IKEEPAY_WEBHOOK_TOKEN` et `CRON_SECRET` sont déjà tirés au sort.
2. **Une adresse joignable depuis Internet.** Sur `localhost`, iKeePay
   encaisse et poste son rappel dans le vide : le client est débité, la
   commande reste figée, et le rattrapage ne peut pas la sauver.
3. **L'adresse de rappel déclarée dans leur tableau de bord** —
   `npm run ikeepay:verifier -- --avec-jeton` l'affiche.

Marche à suivre complète : `docs/deploiement.md`, §5 ter.

Trois réponses manquent toujours, et elles sont d'eux : une **signature** de
leurs rappels, un **point d'entrée de consultation**, un **sandbox** pour
l'encaissement. Voir §8. Elles ne bloquent plus l'essai — elles décident de ce
qu'on peut garantir en production.

Restent ouverts et dépendent aussi d'eux : le versement au vendeur, le
remboursement automatique.

---

## 5. Comment travailler ici

### La base de données : LOCALE, jamais Supabase

```bash
npm run base:demarrer    # PostgreSQL 17.6 sur localhost:5433
npm run base:preparer    # démarre + migrations + jeu de DÉMONSTRATION
npm run base:etat
npm run base:arreter
```

### Trois jeux de données, et il faut savoir lequel on veut

| Commande | Ce qu'elle pose | Pour quoi |
|---|---|---|
| `npm run base:preparer` | comptes + produits + commandes + paiements + transactions | la campagne de vérification. **Efface tout** d'abord. |
| `npm run base:amorcer` | réglages + commission + administrateur | la **production**. Idempotent, n'efface rien, ne crée aucun mouvement. |
| `npm run base:vider` | rien — il retire les mouvements | **regarder le produit** : les tableaux de bord repassent à zéro. `-- --comptes` retire aussi les comptes de démonstration. |

**C'est le point qui a mordu.** `preparer-supabase.mjs` lançait le jeu de
démonstration contre Supabase. Le tout premier vendeur à ouvrir son tableau de
bord y aurait lu des encaissements, une courbe et un solde qui ne sont ceux de
personne — sur une application dont le sujet est la confiance. Et
`admin@koli.ci` / `Password123!`, publié dans ce dépôt, ouvrait
l'administration.

Il lance désormais `prisma/amorce.ts`. Le jeu de démonstration ne part que sur
`--avec-demonstration`, avec un avertissement.

⚠ `prisma/amorce.ts` exige `ADMIN_EMAIL`, `ADMIN_PHONE` et `ADMIN_PASSWORD`
(12 caractères minimum), **sans valeur de repli**. Un mot de passe
d'administrateur codé en dur est un mot de passe public — même règle
qu'`AUTH_SECRET`.

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

**Conséquence qui surprend** : `next start` impose `NODE_ENV=production`. Tout
comportement conditionné à la production se déclenche donc **aussi sur cette
machine**. C'est ainsi que le refus de stockage KYC non durable a fait échouer
sept contrôles en local — le correctif n'est pas d'affaiblir la garde mais de
déclarer le choix dans `.env.local` (`KYC_STORAGE_DIR`), ce qui est exactement
ce qu'elle réclame.

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
npm run verif:courbes    # les courbes disent-elles ce que porte le registre ?
npm run verif:annonces   # les vignettes de la vitrine se lisent-elles en entier ?
npm run verif:livreurs   # chaque vendeur n'a-t-il QUE ses livreurs ?
```

Et trois outils qui ne sont pas des vérifications mais des préparatifs — ils
concernent l'encaissement réel, et sont détaillés au §8 :

```bash
npm run secrets:generer      # les secrets qu'on ne choisit pas à la main
npm run ikeepay:verifier     # la configuration iKeePay tient-elle ?
npm run ikeepay:repetition   # la chaîne réelle, sans un franc (mode ikeepay requis)
```

34 commandes `verif:*` au total. Elles pilotent un **vrai navigateur**
(Playwright) contre le **vrai serveur** et lisent la **vraie base**. Un écran
peut mentir sans que la base bouge, et l'inverse.

**297 tests unitaires** par ailleurs (`npm test`, Vitest).

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
  layout.tsx             racine — porte aussi les dégradés de la marque
  icon.svg               favicon, servi automatiquement par Next
  apple-icon.png         icône iOS, 180 px, plein bord (le système arrondit)
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
    payments/aboutissement.ts  CE QUE FAIT un paiement qui aboutit —
                               séquestre, facture, stock, notifications.
                               Appelé par le bouton de simulation ET par le
                               rappel du prestataire. Sans lui, le mode réel
                               encaissait sans rien déclencher.
  invoices/  notifications/  audit/  kyc/  sellers/  products/
  auth/    db/       admin/       config/     navigation.ts  format.ts
  __tests__/             les tests unitaires

components/
  ui/                    composants génériques
    LogoKoli.tsx         LA marque — anneau ouvert, comma, sans contenant
    VisagesRoles.tsx     les trois visages de la pastille d’accueil
  domain/                composants métier
  driver/                l'espace livreur

prisma/
  schema.prisma          27 modèles
  migrations/            migrations PostgreSQL
  seed.ts                jeu de données de DÉMONSTRATION (local, campagne)
  amorce.ts              amorce de PRODUCTION — réglages, commission, admin
  vider.ts               retire les mouvements fabriqués

scripts/                 51 fichiers — vérification et outillage
  base-locale.mjs        PostgreSQL local
  base-donnees.mjs       accès base partagé par les scripts
  env.mjs                lecture de .env.local puis .env
  preparer-supabase.mjs  mise en route Supabase
  preparer-stockage.mjs  seau des pièces KYC
  verifier-*.mjs         contrôles (schéma, requêtes, latence)
  verifier-ikeepay.mjs   la configuration d'encaissement, avant l'argent
  repetition-ikeepay.mjs la chaîne réelle jouée sans un franc
  generer-secrets.mjs    AUTH_SECRET, CRON_SECRET, jeton de rappel
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


### Un formulaire ne se soumet pas avant d'être hydraté

Corollaire du précédent, et il a coûté trois faux diagnostics en deux jours.

Les formulaires de connexion et d'inscription sont soumis par React. Tant que
l'hydratation n'a pas eu lieu, leur `onSubmit` **n'existe pas** : Playwright
remplit, clique, et *rien ne part*. `waitUntil: "domcontentloaded"` rend la main
bien avant ce moment. On attend donc `networkidle` avant tout remplissage.

**Le piège n'est pas l'échec, c'est la réussite.** Un test qui conclut « rester
sur `/connexion` prouve que le mot de passe est refusé » passe aussi bien quand
le clic n'est jamais parti. `verif:motdepasse` portait exactement ce défaut :
« le nouveau mot de passe permet de se connecter » échouait — à tort — et
« l'ancien ne fonctionne plus » passait — à tort aussi, et **ne pouvait pas
échouer**. Un refus se prouve désormais par le message affiché, jamais par une
absence de mouvement.

Trois `goto` gardent délibérément `domcontentloaded` : ils cliquent un lien ou
lisent une redirection du serveur, deux choses qui n'attendent aucun JavaScript.

⚠ **Ce que cela dit du PRODUIT, et qui reste vrai** : sur un téléphone d'entrée
de gamme et un réseau lent (§70), quelqu'un qui tape « Se connecter » très vite
peut ne rien déclencher. Un humain met des secondes à remplir un formulaire,
donc le cas est rare — mais seul un formulaire fonctionnant **sans JavaScript**
le fermerait tout à fait.

### L'identité est violette sur blanc, et les jetons sont mesurés

Le raisonnement complet, avec le tableau de contraste, est en tête de
`app/globals.css` — c'est là qu'il faut regarder, pas ici. Trois choses à
retenir en arrivant :

**Deux jeux de violet cohabitent**, un CLAIR (actif) et un FONCÉ en commentaire
juste à côté, dans le bloc `@theme`. Basculer, c'est échanger trois lignes ;
rien d'autre ne bouge, tout passe par ces jetons. Les deux ont été mesurés.

**Aucune couleur n'entre au jugé.** Chaque valeur est mesurée contre le blanc
avant d'être écrite, et le tableau du fichier consigne le résultat. Un essai en
bleu-canard a montré pourquoi : la teinte choisie ne donnait que 2,8:1, soit un
titre qu'on devine au lieu de le lire.

**Le fond blanc a un coût.** Sur la crème (le fond jusqu'au 28 août 2026), une
carte blanche se détachait toute seule ; sur blanc, elle n'existe plus que par
son filet. `--color-hairline` porte donc deux contraintes à la fois : assez
sombre pour border une carte, assez clair pour que le badge neutre reste
lisible dessus. Si les blocs paraissent un jour se fondre en une nappe unique,
c'est ce jeton qu'il faut regarder — pas le balisage des cartes.

### Le mouvement a un vocabulaire, et il vient d'ailleurs

Les courbes d'accélération et les durées des animations sont **relevées** sur
`saspay.me/assets/index-CCDrHkgZ.css`, prise comme référence, pas approchées à
l'œil : `count-up .35s ease-out`, `toast-in .4s cubic-bezier(.16, 1, .3, 1)`,
`marquee 22s linear infinite`.

Ce qui fait la différence n'est pas l'idée mais la détente
`cubic-bezier(.16, 1, .3, 1)` : elle dépasse légèrement puis se pose, et le
mouvement paraît obéir à une matière plutôt qu'à une horloge.

Deux règles qui se déferaient sans être écrites : un bandeau défilant a son
contenu **doublé** dans le balisage et glisse de la moitié de sa largeur, sans
quoi la boucle saute ; et son conteneur porte `overflow-hidden`, sans quoi la
page gagne un défilement horizontal que le §8 interdit.

### Une courbe porte UNE mesure, et elle est nette

Les tableaux de bord vendeur et livreur portent une courbe sur quatorze jours
(`lib/finance/courbes.ts`, `components/domain/CourbePerformance.tsx`). Trois
règles, et chacune se déferait sans que rien ne s'affiche :

- **Une seule mesure par courbe.** Superposer un montant et un nombre de
  commandes demanderait deux échelles verticales, et deux échelles font dire à
  un graphique ce qu'on veut. Les compteurs voisins portent déjà les nombres.
- **Les jours vides valent zéro et restent dans la série.** Les sauter
  resserrerait l'axe du temps sans le dire : deux points voisins pourraient
  être séparés d'une semaine, et la pente entre eux serait un mensonge.
- **Le vendeur voit du net de commission**, parce que le même écran lui annonce
  un solde net juste au-dessus. Une courbe brute le dépasserait, et c'est lui
  qui découvrirait l'écart.

**C'est l'AIRE qui porte la courbe, pas le trait.** Le trait faisait deux pixels
sur un remplissage à 24 % : on lisait un fil cerné, une bordure posée sur du
vide. Il est passé à **1,5 px** et le remplissage à **30 %**. Les trois éléments
— trait, dégradé, grille — reçoivent la **même** constante `TEINTE_COURBE` :
c'est le bord de la masse à pleine opacité, pas un contour d'une autre couleur.

Ce trait fin n'est possible que parce que le violet tient **12,9:1** sur le blanc
des cartes, très au-dessus des 3:1 exigés d'un élément graphique. Le vert clair
du livreur (3,5:1) l'interdisait — à un pixel et demi, il aurait disparu. Et pas
1 px non plus : `vector-effect` compte en pixels d'écran, où l'anticrénelage
d'un téléphone à faible densité avale un trait d'un pixel par endroits.

La grille prenait `--color-hairline`, un **vert** accordé au fond de page. Sous
une courbe violette, elle posait une seconde famille de couleur dans un cadre
qui n'en demandait aucune, et le graphique paraissait fait de deux dessins
superposés. Elle lit maintenant la teinte de la courbe, à 13 %.

Le SVG est écrit à la main : la moindre bibliothèque de graphiques pèse
plusieurs dizaines de kilo-octets, et le public visé est sur réseau mobile lent
(§70). Les chiffres sont aussi dans un tableau replié — un graphique seul exclut
qui n'y voit pas, et ne se copie pas.

Le lissage est une spline cubique **monotone** (Fritsch–Carlson), et ce choix
n'est pas esthétique : un lissage ordinaire (Catmull-Rom, tangentes centrées)
dépasse. Après une journée vide suivie d'une forte journée, la courbe plonge
sous zéro avant de remonter — sur un graphique d'argent, ce creux inventé se lit
comme une perte qui n'a pas eu lieu. La spline monotone reste bornée par ses
propres points.

Les graduations sont en **HTML posé par-dessus** le SVG, jamais en `<text>` : le
SVG est mis à l'échelle, son texte aussi, et un 11 pixels dans un repère large
de 640 s'affiche à 16 sur un écran de bureau. Corollaire : leur conteneur
positionné doit contenir le dessin **et rien d'autre**, sinon les pourcentages
se comptent sur une hauteur plus grande et les étiquettes glissent vers le bas.

**Piège rencontré, et qui se reproduira** : l'animation d'ouverture se faisait
par `stroke-dasharray` sur un tracé normalisé par `pathLength="1"`. Combiné à
`vector-effect: non-scaling-stroke`, le navigateur compte les pointillés en
**pixels d'écran**, où `pathLength` ne veut plus rien dire : le dernier tiers de
chaque courbe n'était jamais tracé, sur tous les écrans, sans une erreur. La
courbe avait simplement l'air de s'arrêter. L'ouverture se fait désormais par un
rectangle de découpe, qui ne dépend d'aucune longueur.

### Une vignette d'activité est un TÉMOIGNAGE

`components/domain/AnnoncesActivite.tsx` — la carte qui monte du coin bas-gauche
de l'accueil : « Awa K. vient de s'inscrire », « Kouadio B. a reçu 42 500 FCFA ».

**Elle affirme des faits.** Untel s'est inscrit, untel a été payé. Sur un service
qui n'a pas encore d'utilisateur, ce sont des faits **fabriqués** — exactement au
même titre que les avis clients inventés, et sur un site qui vend précisément de
la confiance. Elle est donc soumise à `exemplesTemoignagesAutorises()`, la même
garde : visible sur le poste, absente de l'hébergeur, et portant la mention
« exemple » même en local. Le jour où de vraies inscriptions et de vrais
versements existent, la liste laisse la place à une requête — la forme du
composant ne bouge pas.

Trois contraintes qui se déferaient sans être écrites :

- **`truncate` coupe en silence.** À 17 rem, la carte disait « Awa K. vient de
  créer son com… » : la page restait valide, aucune erreur, et rien ne le
  signalait. `verif:annonces` mesure `scrollWidth` contre `clientWidth` pour les
  six annonces, à 1280 et à 320 px.
- **Un élément `fixed` échappe au contrôle du §8.** Il n'allonge pas la page, donc
  aucun défilement horizontal n'apparaît — mais il peut être coupé par le bord de
  l'écran, ce qui n'est pas mieux.
- **WCAG 2.2.2.** Un contenu qui se met à jour seul au-delà de cinq secondes doit
  pouvoir être arrêté, mis en pause ou masqué : le survol suspend, le bouton
  masque définitivement, et `prefers-reduced-motion` ne pose jamais la minuterie.
  Ce bouton fait **44 px** — `verif:responsive` l'a refusé à 28.

**La préférence de mouvement est lue par `useSyncExternalStore`**, pas recopiée
dans un état par un effet. La règle `react-hooks/set-state-in-effect` l'interdit,
et elle a raison deux fois : c'est un rendu de plus, et surtout la copie ne se
serait jamais mise à jour pour quelqu'un qui active la réduction de mouvement
pendant qu'il lit la page.

### Les visages sont de vraies photos, les annonces de vrais faits

Deux décisions liées, prises le 31 août 2026, et qui vont dans le même sens :
la vitrine ne dit plus rien qu'elle ne puisse tenir.

**Les trois visages de la pastille** (`components/ui/VisagesRoles.tsx`) sont
de vraies photographies sous licence Pexels — usage commercial autorisé,
aucune attribution exigée. La provenance est notée dans le fichier quand même :
le jour où quelqu'un demande d'où viennent ces visages, « je ne sais plus »
n'est pas une réponse.

Trois visages posés à côté d'une mention « mode test » ne prétendent pas que
ces gens sont clients. Ce qui serait malhonnête, c'est d'attacher une photo à
un avis signé d'un nom inventé — et c'est précisément ce qu'on n'a pas fait.

Trois choses qui se déferaient sans être écrites :

- **Jugées à 28 px avant de l'être en grand**, comme la marque. Onze
  candidates ont été rendues côte à côte : presque toutes sont superbes en
  grand et illisibles en petit, parce que le cadrage est large et que le
  visage occupe trois pixels.
- **Le fond compte autant que le sujet.** Une photo sur fond BLANC disparaît
  dans la pastille, qui est blanche — c'est ce qui a fait écarter le second
  choix, pourtant excellent en grand. Les trois retenues ont trois fonds de
  clartés franchement différentes.
- **12 Ko pour les trois**, en 128 px. Elles s'affichent à 28 : 128 couvre les
  écrans à trois fois la densité, au-delà on paie des octets que personne ne
  voit. C'est le genre d'endroit où une page gagne trois mégaoctets sans que
  personne s'en aperçoive (§70).

**Les vignettes d'activité lisent le registre** (`lib/notifications/activite.ts`).
Elles annonçaient six phrases écrites à la main. Elles disent maintenant les
vraies inscriptions et les vrais versements des quatorze derniers jours.

- **Les noms sont ABRÉGÉS** — « Awa K. », jamais le nom complet. Ce sont de
  vraies personnes et cette page est publique. `verif:annonces` vérifie
  qu'aucun nom de famille ne s'affiche en entier : si quelqu'un retire
  l'abréviation, c'est ce contrôle qui le dira, et personne d'autre.
- **L'accueil est passé en `revalidate = 60`.** Il était pré-rendu à la
  construction — servi identique jusqu'au déploiement suivant. Il aurait
  annoncé les inscriptions du jour du BUILD, indéfiniment.
- **Le retour anticipé est APRÈS les hooks.** Une première version le posait
  en tête de fonction en se disant que la liste vient du serveur et ne change
  jamais. React n'exige pas que les données soient stables, il exige que le
  NOMBRE de hooks le soit.

`verif:annonces` a changé de nature : il ne vérifie plus que six chaînes
connues s'affichent, il confronte l'écran au registre. C'est le seul contrôle
qui puisse encore attraper le retour d'un texte inventé.

**Deux faiblesses de ce contrôle, trouvées le 2 septembre 2026**, et toutes deux
du même genre : il comparait un écran à une base qui bougeait sous lui.

- **Il lisait « les six plus récents ».** L'accueil est en `revalidate = 60` :
  la page lue peut avoir été rendue une minute plus tôt. Pendant ce temps,
  d'autres contrôles de la campagne créent des comptes, et le top 6 n'est plus
  le même des deux côtés. « Boutique A. ne correspond à aucune ligne du
  registre » — alors que le compte existait, bien actif, simplement sorti de la
  fenêtre. La borne a disparu : la question posée est « cette phrase
  désigne-t-elle quelqu'un de réel ? », pas « est-ce exactement le top 6 ».
- **Il cherchait les noms de famille dans le texte entier.** « Test Nouveau
  **Vendeur** » donne le nom de famille « Vendeur » ; « **Vendeur** Concurrent »
  donne le prénom « Vendeur ». Le contrôle criait à la fuite sur une pure
  coïncidence. Il éprouve désormais la **forme** de ce qui s'affiche —
  `Prénom I.` — ce qui est exact au lieu d'être approximatif. Falsifié en
  retirant l'abréviation : il nomme la phrase fautive.

### La marque : un anneau ouvert, et un comma dedans

`components/ui/LogoKoli.tsx`. Deux tracés au trait, bouts ronds, dégradé en
diagonale. **Aucun contenant** : elle se pose à nu sur la page.

Elle reprend le langage de l'une des deux icônes données en référence — masse
pleine, bouts entièrement ronds, et surtout **un second trait détaché niché
dans le creux du premier**. C'est ce second trait qui fait tout : sans lui, la
forme n'est qu'un arc.

Ce n'est **pas un décalque**. La référence est la marque d'une entreprise
réelle ; sur un service qui manipule de l'argent et vend la confiance, se la
faire réclamer coûterait bien plus qu'un logo.

Elle dit quelque chose de juste : un anneau qui ne se referme pas, avec quelque
chose qui tourne dedans. C'est le cycle KOLI — l'argent fait un tour et revient
au vendeur une fois le client servi —, et l'ouverture dit que le tour est en
cours.

Quatre choses qui se déferaient sans être écrites :

- **Elle a été jugée à 24 px AVANT de l'être en grand.** Cinq compositions ont
  été rendues côte à côte, de 24 à 110 pixels. Quatre étaient plus belles en
  grand ; sur les quatre, le second trait se collait au premier ou disparaissait
  sous 32 px — c'est-à-dire à la taille où ce logo passe sa vie, dans un menu et
  un onglet. Les épaisseurs (17 et 13) sortent de là, pas d'un goût.
- **Les dégradés sont définis UNE FOIS**, dans `app/layout.tsx`
  (`DefinitionsLogoKoli`). Un dégradé SVG se désigne par identifiant : soit un
  identifiant unique par instance — donc `useId`, donc un composant CLIENT,
  donc du JavaScript sur chaque page pour une image fixe (§70) —, soit des
  identifiants fixes répétés, et `url(#id)` résout alors vers la **première**
  occurrence : retirer la première instance éteindrait toutes les autres.
- **Sans contenant, la marque dépend du fond.** D'où les deux variantes :
  `sombre` (violet profond) sur fond clair, `claire` (blanc vers lavande) sur
  le menu et le pied de page. Posée en violet sur le menu, qui est violet, elle
  disparaîtrait purement et simplement.
- **La taille se règle sur ce qui l'accompagne**, pas sur une valeur uniforme :
  40 px dans le pied de page où le mot est en `font-titre` extra-gras, 36
  ailleurs.

`app/icon.svg` (favicon) et `app/apple-icon.png` portent le même dessin mais
**avec un fond** violet, et c'est le seul endroit où elle en a un : un onglet
est clair chez les uns, sombre chez les autres, et la marque doit tenir dans
les deux. Ils sont **autonomes** — un favicon est chargé comme un document à
part et ne verrait aucune définition posée dans une page. Trois fichiers pour
une seule marque : c'est le prix d'icônes autonomes, et toute retouche doit
être reportée dans les trois. L'icône Apple est à plein bord, sans coins
arrondis : iOS applique son propre masque, et les arrondir les arrondirait deux
fois.

### L'adresse de rappel Google ne dépend plus d'une variable oubliée

`NEXT_PUBLIC_APP_URL` vaut `http://localhost:3000` sur le poste, et c'est
elle qui construit l'adresse où Google renvoie l'utilisateur. Déployée telle
quelle, elle produit le pire type de panne : **silencieuse et totale**. Le
bouton s'affiche, Google accepte la demande, puis renvoie le visiteur sur
`localhost` — c'est-à-dire sur SA propre machine, où il n'y a rien. Aucune
erreur côté serveur, aucune trace, et un visiteur qui conclut que le service
est cassé.

`lib/auth/google.ts` se rabat désormais sur ce que l'hébergeur sait de
lui-même : `VERCEL_PROJECT_PRODUCTION_URL`, à défaut `VERCEL_URL`.

Trois choses qui se déferaient sans être écrites :

- **Le repli ne s'arme QU'EN PRODUCTION et QUE si l'adresse déclarée est
  locale.** Une adresse déclarée non locale l'emporte toujours : sinon, poser
  un vrai domaine ne servirait à rien.
- **Sur ce poste, `next start` impose pourtant `NODE_ENV=production`** (§5).
  Le repli ne mord pas quand même, parce qu'aucune variable `VERCEL_*` n'y
  existe — mais c'est un équilibre, pas une garantie, et le contrôle
  « ne se rabat PAS hors production » existe pour ça.
- **`VERCEL_URL` n'est qu'un dernier recours.** Il désigne le déploiement
  courant et change à chaque envoi ; une adresse de rappel qui change ne peut
  pas être déclarée chez Google.

⚠ Le code ne peut pas tout : l'URI de redirection doit être **déclarée dans la
console Google Cloud**, sans quoi Google répond `redirect_uri_mismatch`. C'est
un geste manuel, dans un navigateur.

### Un vendeur n'a que SES livreurs, et ils entrent par un lien

§5.3 — « Au début, chaque vendeur peut utiliser son propre livreur. » La phrase
était dans le plan depuis le début ; le code faisait l'inverse.

`listAvailableDriversAction` renvoyait **tous** les livreurs actifs de la
plateforme, et `assignDriverAction` ne vérifiait que « ce livreur existe et son
compte est actif ». Le nom du livreur d'un concurrent s'affichait donc dans un
menu déroulant, et rien n'empêchait de le lui prendre. C'est le propre des
fuites de cloisonnement : l'écran fonctionne, les tests passent, et le défaut ne
se voit que du dehors.

**Table de jonction `SellerDriver`, pas un `sellerId` sur le livreur.** Un
livreur à moto d'Abidjan travaille pour plusieurs commerçants — c'est la norme.
Un rattachement unique l'aurait obligé à ouvrir un compte par vendeur, donc à
jongler avec plusieurs numéros de téléphone.

**On entre par un lien d'invitation, jamais par une recherche.** Chercher un
livreur par son numéro supposerait un annuaire de tous les livreurs de la
plateforme, interrogeable par quiconque ouvre un compte vendeur. Le vendeur n'a
pas à découvrir des livreurs : il en a déjà, et il veut les retrouver dans
l'application. Le jeton fait 32 octets tirés au sort en base64url — pas un
`cuid()`, qui porte un horodatage et se ressemble d'une émission à l'autre.

Quatre choses qui se déferaient sans être écrites :

- **La garde est dans l'ACTION, pas dans la liste.** Filtrer un menu déroulant
  ne protège rien : l'identifiant voyage dans le formulaire. `verif:livreurs`
  injecte une option à la main et vérifie que la livraison ne change pas de
  mains — falsifié en retirant la garde, il voit le détournement.
- **Révoquer un lien ne met personne dehors.** `SellerDriver.inviteId` est en
  `SetNull` : fermer une porte n'expulse pas ceux qui sont entrés par elle.
- **Retirer un livreur ne coupe pas une course en cours.** `Delivery.driverId`
  reste intact — sinon un colis resterait dans la nature, avec un livreur qui ne
  peut plus saisir l'OTP.
- **La disponibilité est déclarée par le livreur, et par lui seul.** Un vendeur
  qui pourrait la remettre à « oui » confierait un colis à quelqu'un qui a dit
  ne pas en prendre.

**Piège rencontré** : l'écran bascule le bouton de disponibilité *avant* la
réponse du serveur — c'est ce qu'on attend d'un interrupteur. Le contrôle
attendait ce basculement et lisait la base pendant que l'action écrivait encore.
Il faut attendre le **message**, qui n'apparaît qu'au retour. Et si le serveur
refuse, l'écran revient en arrière : il ne doit jamais affirmer un état que la
base ne porte pas.

### Le site ne doit jamais dire « aucun paiement reel » en prelevant

`isTestMode()` n'etait lu **nulle part** dans l'interface. Les mentions du §75
etaient ecrites en dur dans une vingtaine d'ecrans — y compris les conditions
d'utilisation et la politique de confidentialite, qui sont des documents
juridiques. Basculer sur iKeePay aurait fait prelever de l'argent reel a un
site affirmant le contraire, sur chaque page.

Trois mecanismes, et le choix entre eux n'est pas une preference :

- **`<MentionModeTest>`** — composant SERVEUR. Le texte n'est pas rendu.
- **`data-mention-test`** — composant CLIENT. Masque par une regle de
  `app/globals.css`, pilotee par `data-mode-paiement` pose sur `<body>`.
  Il en fallait un : le menu lateral est appele depuis **vingt-sept pages**, et
  lui passer un prop, c'etait vingt-sept occasions d'en oublier une.
- **`isTestMode()` lu a la main** — quand la phrase doit CHANGER plutot que
  disparaitre. Masquer « en mode test » au milieu d'un paragraphe laisse une
  coquille, et sur un document juridique laisse un vide la ou le lecteur
  attend de savoir qui detient son argent.

⚠ **Le mode est lu a la CONSTRUCTION** pour les pages statiques. Changer
`PAYMENT_MODE` sans reconstruire ne change rien a ce qui s'affiche.

`npm run verif:mentions` lit les sources et refuse toute mention hors garde.
Il en a trouve **neuf que j'avais manquees**, dont « Mode Test MVP » sur la
page de connexion. Falsifie en retirant une garde : il la voit et sort en
echec.

### Le tunnel iKeePay, et le rattrapage qui n'existait pas

**Le tunnel** (`components/domain/TunnelIkeePay.tsx`) remplace les boutons de
simulation en mode réel. C'est iKeePay qui demande le numéro, l'opérateur,
l'OTP et gère Wave et Orange : aucun numéro de payeur ne transite par KOLI.

Quatre choses qui se déferaient sans être écrites :

- **`event.origin` est vérifié.** Leur documentation montre un écouteur qui ne
  le fait pas : sans ce contrôle, TOUTE page capable de nous poster un message
  est crue.
- **`ikeepay-success` ne conclut RIEN.** C'est un `postMessage` : n'importe
  qui l'émet depuis la console. Il sert d'une seule chose — savoir qu'il est
  temps de DEMANDER AU SERVEUR. Le verdict vient du rappel, et c'est la base
  qui fait foi.
- **Au bout de deux minutes sans confirmation, l'écran ne dit PAS « échec ».**
  Le paiement a peut-être abouti chez eux et le rappel s'est perdu. Annoncer un
  échec ferait payer deux fois quelqu'un qui a déjà payé.
- **Les boutons de simulation ne sont pas rendus** en mode réel, pas seulement
  masqués : un bouton caché se réaffiche en une ligne dans les outils de
  développement.

Le montant part du SERVEUR, recalculé depuis les lignes de la commande. Le
prendre du navigateur reviendrait à laisser quelqu'un choisir combien il paie.

**Le rattrapage.** `rapprocherPaiements()` existait, éprouvée, et n'était
appelée par RIEN — ni route, ni tâche. En mode test c'était sans conséquence :
le paiement simulé répond tout de suite. `/api/paiements/rapprochement` et
`vercel.json` la déclenchent désormais toutes les dix minutes.

⚠ Le forfait **Hobby** de Vercel ramène toute tâche à UNE PAR JOUR, sans
avertissement.

⚠ Avec iKeePay elle ne fait qu'expirer les paiements abandonnés : sans point
d'entrée de consultation, un rappel PERDU n'est pas rattrapable.

### iKeePay ne signe pas ses rappels

Le partenaire financier est choisi : **iKeePay**, agrégateur Mobile Money. La
phase 30 est donc débloquée, et la garde `PAYMENT_MODE` peut s'ouvrir — parce
que **les fonds dorment sur LEUR compte**. C'est l'agrégateur qui porte
l'agrément ; KOLI ne détient jamais l'argent de personne, et le §84 est
satisfait plutôt que contourné. Si un jour les fonds transitent par un compte
KOLI, cette garde doit se refermer.

┌────────────────────────────────────────────────────────────────────────────┐
│  LEURS RAPPELS NE SONT SIGNÉS PAR RIEN. Leur documentation montre un        │
│  exemple PHP qui croit l'événement sur parole.                             │
└────────────────────────────────────────────────────────────────────────────┘

Conséquence : qui connaît l'adresse de rappel **et** une référence de commande
peut marquer cette commande payée. L'attaquant naturel est **l'acheteur** — il
ouvre le lien de paiement, il y lit la référence.

Faute de signature, l'adresse de rappel porte un **jeton secret** :
`/api/paiements/rappel?jeton=…`. Ce n'est PAS équivalent, et la différence est
écrite dans `IkeePayProvider` : une signature prouve que le corps vient d'eux
et n'a pas été modifié ; un jeton prouve seulement que l'appelant connaît un
secret. Il protège de l'acheteur — le scénario réel — mais pas d'un
intermédiaire qui verrait passer l'adresse.

**Trois choses leur restent à demander**, et les trois sont écrites dans le
fichier : une signature, un point d'entrée pour relire l'état d'une
transaction (sans lui, `consulter()` renvoie `null` et le rapprochement est
aveugle), et un sandbox pour l'encaissement — le seul documenté concerne les
cartes.

Quatre décisions qui se déferaient sans être écrites :

- **Le tunnel iframe, pas le H2H.** C'est iKeePay qui demande le numéro,
  l'opérateur, l'OTP, et qui gère les redirections Wave et Orange. Aucun
  numéro de payeur ne transite par KOLI.
- **`ikeepay-success` ne conclut RIEN.** C'est un message posté au navigateur :
  n'importe qui peut l'émettre depuis la console. `confirm()` renvoie donc
  l'état inchangé, et un test le vérifie explicitement.
- **Un statut inconnu n'est jamais un succès.** Le défaut penche du côté qui ne
  fait expédier aucun colis.
- **`providerRef` = notre propre référence de commande.** Le tunnel n'a pas
  d'appel serveur à l'initiation : iKeePay ne connaît la commande qu'au
  rappel. Notre référence est le seul identifiant commun aux deux côtés dès le
  départ, et elle est déjà imprévisible.

**Le contrôle du forgeage ne s'exerçait pas.** `verif:rappel` cherchait un
paiement EN ATTENTE, que le jeu de données ne crée jamais — il dépendait donc
d'un autre test en ayant laissé un. Il pose désormais sa propre fixture, et
l'efface. La note du `aNettoyer` se fait AVANT les insertions : notée après,
un échec sur la seconde laissait une commande orpheline que le ménage ignorait
— et c'est arrivé.

### Le rappel notait le paiement, et ne faisait RIEN

Le 2 septembre 2026, `npm run ikeepay:repetition` — la répétition générale de
l'encaissement réel — a trouvé ce pour quoi elle a été écrite.

`/api/paiements/rappel` marquait le paiement `SUCCEEDED` et s'arrêtait là. Son
propre commentaire l'annonçait : « le jour du branchement (phase 30), c'est ici
que l'action de confirmation sera appelée — une ligne, à un endroit déjà
éprouvé ». Ce jour était arrivé, la ligne n'était pas écrite.

En mode test, sans conséquence : le bouton de simulation appelle
`simulatePaymentAction`, qui fait tout. **En mode réel, ce rappel est le SEUL
chemin** — personne n'est devant un écran quand il arrive. Le résultat aurait
été :

```
le client débité chez l'agrégateur
  → le paiement passe à SUCCEEDED chez nous
  → aucun séquestre, aucune facture, aucune notification, aucun décompte de stock
  → la commande reste « en attente de paiement », invisible du vendeur
```

De l'argent prélevé, et personne pour l'apprendre — sur une application dont le
sujet est la confiance.

**Les conséquences d'un paiement vivent désormais dans
`lib/payments/aboutissement.ts`**, appelé par les deux chemins. Ce n'est pas une
action serveur : elle est appelée depuis une route d'API, qui n'a ni session ni
utilisateur, et surtout elle ne décide de rien — le verdict lui est donné.

Quatre choses qui se déferaient sans être écrites :

- **La transition est vérifiée DEUX fois, et c'est voulu.** `cheminDePaiement`
  est exporté parce que `simulatePaymentAction` doit poser la question **avant**
  d'appeler `initiate()`. S'y fier seulement dans `appliquerAboutissement` —
  qui n'intervient qu'après `confirm()` — reviendrait à demander une intention
  de prélèvement pour une commande déjà livrée. Un test unitaire garde cette
  propriété ; c'est lui qui a refusé la première version du refactor.
- **`AWAITING_CUSTOMER` a dû être ajouté aux états repris.** C'est l'état NORMAL
  d'un paiement Mobile Money quand le rappel arrive — le client valide sur son
  téléphone. Il n'existait pas dans le chemin simulé, où le verdict tombe dans
  la milliseconde. Sans lui, **tout** paiement réel aurait été refusé comme
  « concurrent », et rien n'aurait jamais été séquestré.
- **`simulatedOutcome` reste nul en mode réel.** C'est cette colonne qui
  distingue, dans le registre, un encaissement joué d'un encaissement qui a eu
  lieu.
- **Le rappel répond 200 même quand l'application échoue.** Un 500 ferait
  rejouer l'agrégateur en boucle, alors qu'une transition illégale ne se
  résoudra pas d'elle-même : le rejeu ne réparerait rien et noierait le
  problème.

**Rien dans la campagne ne vérifiait qu'un rappel VALIDE produise quoi que ce
soit.** `verif:rappel` n'éprouvait que des refus — signature forgée, corps
modifié, référence inconnue, montant discordant. C'est ainsi que le défaut a
pu vivre : tous ses contrôles restaient verts. Le contrôle 9 exerce désormais
le branchement complet avec le fournisseur de test — séquestre, statut de
commande, facture, et rejeu sans seconde facture. Falsifié en neutralisant
`appliquerAboutissement` derrière une garde d'environnement : ses cinq
assertions tombent, avec exactement les symptômes du défaut d'origine.

⚠ **`ikeepay:repetition` ne remplace pas ce contrôle** : elle exige
`PAYMENT_MODE=ikeepay` et ne tourne donc pas dans `verif:tout`. Un défaut du
branchement serait invisible de la campagne sans le contrôle 9.

⚠ **Falsifier demande une condition OPAQUE à TypeScript.** `if (true) return`
rend la suite inatteignable, lui fait perdre tout affinage de type, et casse la
compilation au lieu de falsifier : on ne voit alors rien du tout. Une lecture
d'`process.env` fait l'affaire.

**Le schéma ne connaissait pas iKeePay non plus.** `enum PaymentProviderType`
n'avait que `TEST`, et `lib/orders/actions.ts` écrivait `TEST` en dur. Une
commande encaissée par iKeePay aurait porté la mention `TEST` dans le registre —
et c'est précisément la colonne qu'on lit pour rapprocher nos écritures de leur
relevé. Migration `20260902110753_fournisseur_ikeepay`.

⚠ **Cette migration doit être appliquée à Supabase avant tout déploiement en
mode réel** (`npm run supabase:migrer -- --appliquer`), puis le code redéployé.

### Trois outils pour essayer sans bac à sable

iKeePay n'en offre aucun pour l'encaissement — le seul documenté concerne les
cartes. Le premier essai chez eux est un vrai débit. Ces trois commandes sont ce
qui remplace le bac à sable :

```bash
npm run secrets:generer      # AUTH_SECRET, CRON_SECRET, IKEEPAY_WEBHOOK_TOKEN
npm run ikeepay:verifier     # la configuration tient-elle ? (jeton masqué)
npm run ikeepay:repetition   # la chaîne complète en mode réel, sans un franc
```

`ikeepay:repetition` **refuse de tourner en mode test**, et c'est le point : en
`test`, ses dix-neuf contrôles passeraient tous en n'exerçant rien — les boutons
de simulation seraient absents parce qu'ils sont ailleurs, le rappel serait
accepté par un autre fournisseur. Une répétition qui rend vert sans avoir joué
la pièce est pire que pas de répétition.

Elle **ne sort pas du poste** : le serveur ne contacte jamais iKeePay —
`initiate()` ne fait que bâtir une adresse, sans appel réseau — et l'appel que
le NAVIGATEUR ferait vers leur tunnel est coupé par le script. Une première
version l'ouvrait pour de bon : cliquer « Payer » chargeait leur page de
paiement en vrai, avec la vraie clef publique, à chaque exécution. Rien n'y
était prélevé, mais une répétition qui dépend d'une page distante n'est pas
reproductible — et le VPN de ce poste la ferait attendre pour rien.

Éprouvée le 2 septembre 2026 avec les clefs de production : **19 sur 19**. Ce
qu'elle ne prouve pas, et il faut le dire : qu'ils envoient bien leur rappel, et
à la forme attendue.

⚠ **L'adresse de rappel doit être joignable depuis Internet.** Sur `localhost`,
iKeePay encaisse et poste son rappel dans le vide : le client est débité, la
commande reste figée, et sans point d'entrée de consultation le rattrapage ne
peut pas la sauver. `ikeepay:verifier` refuse de dire « prêt » tant que
`NEXT_PUBLIC_APP_URL` désigne une adresse privée.

La marche à suivre complète est en `docs/deploiement.md`, §5 ter.

### Un contrôle qui lit les restes d'un autre test

`verif:courbes` n'avait pas de fixture. Le jeu de démonstration s'arrête au
séquestre et ne libère jamais de fonds : les écritures que la courbe affichait
étaient celles qu'un test amont — le parcours, les jalons — avait laissées en
passant. Rien ne garantissait ni leur présence, ni leur date, ni leur montant.

Le 2 septembre 2026 elles n'y étaient plus, et trois contrôles sont tombés d'un
coup : « 0 graduation », « plafond -Infinity ». Le défaut n'était pas dans les
courbes, qui allaient très bien.

**Le pire était le §25.** Sans libération, la valeur de la marchandise vaut 0, et
le contrôle cherchait la chaîne `"0"` dans l'écran du livreur — qu'on y trouve
toujours. Il échouait donc quoi qu'affiche cette page, pour une raison étrangère
à ce qu'il vérifie.

Il pose maintenant **deux jours** d'écritures, et non un seul : avec un point
unique, l'axe vertical n'a pas d'étendue et le contrôle des graduations ne
prouverait rien. Falsifié en neutralisant la commission dans
`lib/finance/courbes.ts` : il voit l'écart (65 000 affichés, 61 750 en base).

⚠ **Piège rencontré pendant cette falsification**, et qui se reproduira : le
serveur précédent tenait encore le port 3000, `npx next start` a échoué en
silence, et la falsification a été jouée contre l'ANCIENNE construction — elle
passait au vert. Toujours arrêter le serveur avant de reconstruire (§5), et se
méfier d'une falsification qui ne mord pas.

### `vercel deploy` ne respecte PAS `.gitignore`

Découvert le 2 septembre 2026, en déployant l'aperçu d'essai iKeePay.

Le dépôt suivi pèse **3,9 Mo** (`git ls-files`). Le téléversement en annonçait
**56,5**. La différence, ce sont les dossiers ignorés par git — que Vercel
envoie quand même, faute de `.vercelignore`. Et `.donnees` en fait partie :

- `.donnees/kyc/` — les **pièces d'identité** déposées pour la vérification
  vendeur. De vraies photos de vraies personnes. Le §8 dit qu'elles ne vivent
  jamais sous `public/` ; les expédier chez un hébergeur est le même problème
  par une autre porte.
- `.donnees/postgres/` — le répertoire de données PostgreSQL **en entier** : la
  table `User` avec ses empreintes bcrypt, les commandes, les paiements.

Avec `.vercelignore`, le téléversement tombe à **10,9 Mo**. Ce qui ne peut pas
être établi rétroactivement, c'est lequel des deux dossiers composait les 45 Mo
manquants — `.next` seul (188 Mo) pourrait l'expliquer. Le plus prudent est de
considérer que `.donnees` est parti sur les treize déploiements de la semaine.

**La leçon générale** : un fichier d'exclusion par outil, et aucun ne se déduit
d'un autre. `.gitignore` protège le dépôt, `.vercelignore` protège le
déploiement. Le second n'existait pas, et rien ne le signalait — la seule trace
était un nombre de mégaoctets que personne ne regarde.

⚠ **`.next` aussi doit être exclu**, pour une raison plus banale : 188 Mo que
l'hébergeur refabrique de toute façon. C'est ce qui faisait échouer le
téléversement derrière le VPN.

### Le plan Hobby refuse le déploiement, il ne dégrade pas

`vercel.json` planifiait le rattrapage toutes les dix minutes. Le plan Hobby
plafonne à **une fois par jour** — et il ne ramène pas la fréquence en silence,
il **refuse la construction entière** : « Hobby accounts are limited to daily
cron jobs ». La mise en ligne du 2 septembre 2026 s'est arrêtée là.

Passé à `0 3 * * *`. Ce que cela coûte : les paiements abandonnés se ferment
avec jusqu'à 24 h de retard, et le stock qu'ils immobilisent reste bloqué
d'autant. Avec iKeePay c'est la seule utilité du rattrapage — faute de point
d'entrée de consultation chez eux, un rappel **perdu** n'est de toute façon pas
rattrapable.

⚠ **`vercel.json` n'accepte aucune propriété en trop.** Un `"comment"` posé dans
une entrée de `crons` pour expliquer ce choix a fait échouer une construction en
cinq secondes. Le raisonnement vit donc dans `docs/deploiement.md` — c'est
pourquoi ce fichier-là est nu.

⚠ **Le CLI ment sur l'échec.** `vercel deploy` rend `Error: fetch failed` alors
que le téléversement est passé et que la construction démarre : il perd
simplement la connexion en attendant, derrière le VPN. Vérifier avec
`vercel ls` avant de conclure à un échec — cinq tentatives ont été relancées
pour rien avant de le comprendre.

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
