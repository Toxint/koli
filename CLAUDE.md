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

La campagne complète — `npm run verif:tout`, **33 suites et 586 contrôles** —
passe sans un seul échec. Relevé le 8 septembre 2026.

⚠ **Elle exige `npm run base:preparer` d'abord**, et ce n'est pas une
politesse : elle consomme ce qu'elle éprouve. `verif:prealables` le vérifie
maintenant et le dit tout de suite — voir « La campagne CONSOMME ce qu'elle
éprouve ».

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

✓ **`NEXT_PUBLIC_APP_URL` et `AUTH_SECRET` sont réglés côté Vercel** — vérifié
le 7 septembre 2026, par `vercel env pull` et non déduit : la production porte
`https://koli-zeta.vercel.app` et un `AUTH_SECRET` de 44 caractères tiré au
sort. Les deux avertissements qui vivaient ici depuis le 26 août sont donc
levés.

⚠ **`.env` garde `NEXT_PUBLIC_APP_URL=http://localhost:3000`, et c'est
volontaire** : ce fichier sert l'outillage depuis ce poste. C'est la valeur
côté **hébergeur** qui construit les liens de paiement partagés et l'adresse de
retour Google. Ne pas « corriger » `.env` en croyant réparer quelque chose.

⚠ **Le dépôt `github.com/Toxint/koli` est PUBLIC.** Seul le préfixe
`koli-dev-…` a jamais été écrit dans un fichier suivi, jamais une valeur — mais
c'est la raison pour laquelle aucun secret ne doit y entrer, même en exemple,
même commenté.

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

**Les trois conditions de l'essai réel sont remplies depuis le 6 septembre
2026** : les clefs sont posées, `koli-essai.vercel.app` est joignable, et
l'adresse de rappel est déclarée chez eux. Deux vrais paiements sont arrivés —
`KOLI-B68YSD5C` (1 000 CDF) et `KOLI-E5ZNYA6R` (200 XOF), tous deux
`FUNDS_SECURED`, factures `FAC-2026-000001` et `FAC-2026-000002`.

⚠ **Les deux ont d'abord été PERDUS**, chacun pour une raison différente et
toutes deux muettes : `providerRef` jamais écrit en mode réel, et une règle de
montant qui comparait des devises différentes. Les deux sont corrigés, et un
rappel écarté laisse désormais une trace. Voir §8 — ces trois sections sont les
plus importantes du fichier pour qui reprend l'encaissement.

⚠ **La production reste en `test`.** Seul le site d'essai encaisse pour de
vrai, et les deux sites se ressemblent : le seul repère visible est la mention
« mode test », absente de l'essai.

Marche à suivre complète : `docs/deploiement.md`, §5 ter.

Trois réponses manquent toujours, et elles sont d'eux : une **signature** de
leurs rappels, un **point d'entrée de consultation**, un **sandbox** pour
l'encaissement. Voir §8. Elles ne bloquent plus l'essai — elles décident de ce
qu'on peut garantir en production.

Restent ouverts et dépendent aussi d'eux : le versement au vendeur, le
remboursement automatique.

⚠ **Le versement au vendeur est BLOQUÉ par une décision, pas par du code** :
iKeePay règle en dollars, pas dans la monnaie encaissée, et `Fund.amount`
suppose le contraire. Ne rien construire avant d'avoir tranché — voir §8.

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
npm run verif:prealables # le jeu de données permet-il d'éprouver quoi que ce soit ?
npm run verif:requetes   # chaque requête SQL est-elle valide contre le schéma ?
npm run verif:schema     # intégrité : clefs étrangères, orphelins, migrations
npm run verif:parcours   # le parcours complet — le critère du §80
npm run verif:courbes    # les courbes disent-elles ce que porte le registre ?
npm run verif:annonces   # les vignettes de la vitrine se lisent-elles en entier ?
npm run verif:livreurs   # chaque vendeur n'a-t-il QUE ses livreurs ?
npm run verif:devises    # une monnaie est-elle ecrite en dur quelque part ?
npm run verif:sansjs     # peut-on entrer sans JavaScript ?
```

Et trois outils qui ne sont pas des vérifications mais des préparatifs — ils
concernent l'encaissement réel, et sont détaillés au §8 :

```bash
npm run secrets:generer      # les secrets qu'on ne choisit pas à la main
npm run ikeepay:verifier     # la configuration iKeePay tient-elle ?
npm run ikeepay:repetition   # la chaîne réelle, sans un franc (mode ikeepay requis)
npm run supabase:registre    # le registre en ligne porte-t-il des ecritures FABRIQUEES ?
npm run ikeepay:surveiller   # attendre un vrai paiement et dire ce qui arrive
npm run admin:motdepasse     # changer le mot de passe administrateur, en local ou en ligne
```

37 commandes `verif:*` au total. Elles pilotent un **vrai navigateur**
(Playwright) contre le **vrai serveur** et lisent la **vraie base**. Un écran
peut mentir sans que la base bouge, et l'inverse.

**358 tests unitaires** par ailleurs (`npm test`, Vitest).

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

✓ **Ce que cela disait du PRODUIT est CORRIGÉ depuis le 7 septembre 2026.** Sur
un téléphone d'entrée de gamme et un réseau lent (§70), quelqu'un qui tapait
« Se connecter » avant l'hydratation ne déclenchait rien. Les deux portes —
connexion et inscription — fonctionnent désormais sans une ligne de
JavaScript : voir « Les deux portes s'ouvrent sans JavaScript ».

⚠ **La remarque reste vraie pour tout NOUVEAU formulaire** soumis par un
`onSubmit`. Le réflexe à garder : `<form action={…}>`, jamais
`onSubmit` seul.

### Les deux portes s'ouvrent sans JavaScript

C'était écrit ici depuis des jours, en avertissement : « seul un formulaire
fonctionnant sans JavaScript le fermerait tout à fait ». Fait le 7 septembre
2026, pour la connexion et l'inscription.

┌────────────────────────────────────────────────────────────────────────────┐
│  Un `onSubmit` n'existe QU'APRÈS l'hydratation. Avant, on remplit, on      │
│  clique, et rien ne part — sans erreur, sans message.                      │
└────────────────────────────────────────────────────────────────────────────┘

Le public de KOLI est sur téléphone d'entrée de gamme et réseau mobile lent
(§70), où ce moment dure. Et c'est le genre de panne le plus coûteux : la
personne ne voit pas d'erreur, elle conclut que le service ne marche pas.

**`<form action={…}>` et `useActionState`** remplacent le `onSubmit`. Le
navigateur sait soumettre seul ; React reprend la main quand il arrive. C'est
le même code pour les deux chemins, et c'est pour cela qu'ils ne peuvent pas
diverger.

Cinq décisions, et chacune se déferait sans être écrite :

- **La redirection se fait dans l'ACTION, côté serveur.** Rendre
  `{ redirectTo }` suppose un navigateur qui l'utilise. Sans JavaScript,
  personne ne le fait : à la connexion le cookie est posé et la personne reste
  devant le formulaire ; à l'inscription le compte est **créé** et elle
  recommence, ce qui lui répond « un compte existe déjà ».
  ⚠ `redirect()` lève `NEXT_REDIRECT` : jamais dans un `try/catch` qui avale
  tout, sinon le succès se change en « erreur réseau ».
- **Les champs sont NON CONTRÔLÉS**, et l'action rend la saisie (`saisie`).
  Sans React, un `value` piloté par un état n'a personne pour le piloter ; et
  un refus recharge la page, donc renvoie un formulaire vide. Retaper un numéro
  de téléphone sur un clavier de téléphone après s'être trompé, c'est ce qui
  fait abandonner.
  ⚠ **Le mot de passe n'est JAMAIS rendu.** Il traverserait le réseau une
  seconde fois pour se poser dans un attribut du document — lisible dans le
  cache, dans un mandataire, et par-dessus l'épaule. Un contrôle l'exige.
- **Le rôle est une VRAIE radio**, plus un `<button role="radio">`. Un bouton
  ne change d'état que par JavaScript : avant l'hydratation, les trois cartes
  ne répondaient à rien. L'`input` est en `sr-only` et non `hidden` — masqué
  pour de bon, il sortirait de l'ordre de tabulation.
- **Les trois blocs de champs sont TOUS rendus**, et `globals.css` montre celui
  du rôle coché, par `:has()`. Un rendu conditionnel en React ne produirait que
  le bloc initial : changer de rôle ne ferait rien apparaître, et le formulaire
  demanderait le nom d'une boutique à un client.
  ⚠ **Aucun de ces champs ne peut devenir `required`.** Un champ obligatoire en
  `display: none` fait échouer l'envoi sur « An invalid form control is not
  focusable » — le formulaire refuse de partir, et le navigateur n'a nulle part
  où l'afficher.
- **`useFormStatus` vit dans un composant SÉPARÉ.** Appelé dans celui qui porte
  le `<form>`, il rend toujours `pending: false` : il n'écoute qu'un formulaire
  **parent**. Ce n'est pas un découpage esthétique.

**`npm run verif:sansjs`** — quatorze contrôles dans un navigateur à
`javaScriptEnabled: false`. C'est la seule façon d'éprouver la chose : un
navigateur normal hydrate en quelques millisecondes sur cette machine, et le
test passerait en exerçant exactement le chemin qu'on ne veut pas éprouver.

⚠ **Il clique l'ÉTIQUETTE, pas la radio.** Celle-ci est un carré d'un pixel
recouvert par l'icône de la carte ; `.check()` vise sa boîte et se heurte au
pictogramme. Forcer le clic (`force: true`) ferait passer le test en cessant de
dire ce qu'un doigt peut faire.

**La falsification a montré pire que ce qu'elle cherchait.** En remettant le
`onSubmit`, les trois contrôles tombent — et l'adresse devient :

```
/connexion?identifier=vendeur%40koli.ci&password=MauvaisMotDePasse%21
```

Un `<form>` sans `action`, privé de son JavaScript, retombe sur un **GET** : le
mot de passe part dans l'URL, donc dans l'historique du navigateur, les
journaux du serveur et tout mandataire sur le chemin. Le défaut n'était pas
seulement « on ne peut pas se connecter ».

⚠ **Ce qui reste délibérément tributaire de JavaScript** : le tunnel de
paiement, l'assistant de commande en cinq étapes, les courbes. Ils ne se font
pas sans. La règle n'est pas « tout doit marcher sans JavaScript », c'est « on
doit pouvoir ENTRER » — si la porte ne s'ouvre pas, le reste ne compte pas.

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

**Une troisième, le 7 septembre 2026, et du genre inverse : le contrôle était
trop STRICT.** Il exigeait que l'initiale soit une lettre majuscule
(`\p{Lu}`). Il a donc crié à la fuite sur « Livreur 8. » — l'abréviation de
« Livreur Invité 87494 », le compte que `verif:livreurs` laisse en passant.
Aucun nom n'était exposé : le dernier mot était bien réduit à un caractère.

Le défaut était dans l'attente, pas dans le code. `abreger` réduit le dernier
mot à **son premier caractère, quel qu'il soit** — et deux noms parfaitement
réels le prennent en défaut : une enseigne comme « Boutique 225 » donne
« Boutique 2. », et un patronyme en écriture arabe ou chinoise n'a pas de
majuscule, `toUpperCase()` le rendant inchangé. Sur ce marché, ce n'est pas
une hypothèse d'école.

Le motif accepte désormais `\S` : ce qui protège n'est pas la NATURE du
caractère, c'est qu'il y en ait **un seul**. « Awa Kone » échoue toujours,
parce qu'un mot entier ne tient pas dans un caractère suivi d'un point.
Falsifié en faisant rendre le nom complet à `abreger` : sept contrôles
tombent, dont celui-ci, en nommant la phrase fautive.

⚠ **Un contrôle trop strict coûte autant qu'un contrôle trop laxiste**, et se
repère moins vite : il ne laisse rien passer, il crie sur du sain. On finit
par lire ses échecs comme du bruit — et le jour où il a raison, personne
n'écoute.


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

### iKeePay annonce un bac à sable — correction du 6 septembre 2026

Il était écrit ici, à plusieurs endroits, qu'iKeePay n'offre **aucun** bac à
sable pour l'encaissement et que le seul documenté concerne les cartes. Leur
propre page commerciale dit le contraire :

> « **Sandbox développeur** — Environnement de test complet avec données mock et
> webhooks. »
> *(https://ikeepay.com/business, section « API Gateway »)*

**Un environnement de test avec webhooks**, c'est exactement ce qui manquait :
de quoi éprouver la chaîne complète, rappel compris, sans qu'un franc bouge.

Ce qui reste vrai, et qu'il ne faut pas confondre avec une bonne nouvelle
acquise :

- **Il est gardé.** « Demander un accès développeur » est un `<button>` sans
  destination — il agit en JavaScript, probablement après connexion. L'accès se
  demande, il ne se prend pas.
- **C'est une promesse commerciale, pas une documentation.** Rien n'y dit si le
  bac à sable couvre l'ENCAISSEMENT Mobile Money ou seulement les cartes — la
  distinction qui avait mené à la note d'origine.
- **Rien n'a été vérifié.** Tant que l'accès n'est pas obtenu et éprouvé, les
  scripts continuent de traiter le premier paiement comme un vrai débit, et
  c'est la bonne posture : le défaut penche du côté qui ne coûte rien.

⚠ **À demander en même temps que les deux autres questions en suspens** — la
signature des rappels et le point d'entrée de consultation. Les trois relèvent
du même interlocuteur et du même accès développeur.

Leur tableau de bord est à **`https://ikeepay.com/auth/login`** (courriel et mot
de passe). Il n'existe ni `dashboard.` ni `app.` : ces sous-domaines ne
résolvent pas.

⚠ **Leur site est une application entièrement montée en JavaScript** : 5 Ko de
coquille HTML, et tout le reste dans un fichier de 2 Mo au nom empreinté
(`/assets/index-<hash>.js`). Trois conséquences pratiques :

- `curl` n'en tire rien — il faut Playwright pour lire quoi que ce soit chez eux.
- **Toutes les adresses rendent 200**, y compris celles qui n'existent pas :
  sonder un chemin par son code de statut ne prouve rien.
- Quand ils publient une nouvelle version, l'empreinte change. Un navigateur qui
  a gardé l'ancienne coquille réclame un fichier supprimé et **reste blanc
  indéfiniment**, sans message. C'est ce qui a bloqué l'utilisateur une journée
  entière ; le remède est `Ctrl+Maj+R`, puis vider les données du site.

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

### La campagne CONSOMME ce qu'elle éprouve

Chaque passage vend des produits, et le stock ne se rend pas tout seul — le
décompte se fait au paiement (§17). Après quelques campagnes d'affilée, le
catalogue est à sec.

Le 7 septembre 2026, « Robe Wax » était tombée à **1** et les autres à zéro.
Deux contrôles sont tombés, et aucun ne disait pourquoi :

| Contrôle | Ce qu'il annonçait | Ce qui se passait |
|---|---|---|
| `verif:etapes` | « l'étape 1 ne mène pas à l'étape 2 » | le formulaire refusait une quantité de 2 |
| `verif:clients` | délai dépassé sur un menu déroulant | l'option était `disabled` (rupture) |

Vingt minutes de campagne pour un diagnostic faux, deux fois de suite.

**`npm run verif:prealables`** passe désormais juste après `verif:latence`, et
pour la même raison qu'elle : *un test qui échoue pour une cause étrangère à ce
qu'il vérifie est pire qu'aucun test* — il envoie chercher un défaut qui
n'existe pas. Il vérifie les cinq comptes de démonstration, un produit d'au
moins 2 en stock **par vendeur**, et le taux de commission.

Trois choses qui se déferaient sans être écrites :

- **Le stock se compte PAR VENDEUR.** Le menu déroulant d'une commande ne
  montre que les produits du vendeur connecté (§16) : un catalogue global bien
  fourni ne prouve rien si c'est le vendeur de démonstration qui est à sec — et
  c'est lui que les contrôles utilisent.
- **Deux, et pas un.** `verif:etapes` commande une quantité de 2 pour éprouver
  la multiplication du sous-total ; avec un seul article, « prix × quantité »
  et « prix » donneraient le même nombre.
- **Il ne répare RIEN, délibérément.** Réamorcer tout seul effacerait la base
  sans que personne ne l'ait demandé. Un script qui décide seul de vider une
  base est un script qu'on finit par lancer contre la mauvaise — et `.env`
  contre `.env.local` est précisément le piège documenté plus bas.

⚠ **`npm run base:preparer` est un PRÉALABLE de la campagne, pas une option.**
C'était écrit au §5 comme une description ; c'est maintenant vérifié.

**Deux contrôles ont été rendus indépendants du jeu de données au passage :**

- `verif:etapes` choisissait « Robe Wax » par son nom. Il prend désormais le
  produit qui a **le plus de stock**, en lisant le nombre annoncé dans le
  libellé de l'option — et s'il n'en trouve aucun, il le dit.
- Son total attendu valait « 38 500 » en dur, soit 2 × 18 500 + 1 500. Il est
  **calculé** depuis le produit réellement choisi : un attendu codé en dur
  décrit le jeu de données, pas la règle.


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

### Le site de production FABRIQUE des écritures dans le registre réel

Découvert le 5 septembre 2026, en cherchant pourquoi un essai de paiement
restait simulé.

Trois choses vraies séparément, désastreuses ensemble :

```
un déploiement de PRODUCTION, public
  + PAYMENT_MODE=test, donc le bouton « simuler un paiement réussi »
  + la base de PRODUCTION derrière
  = n'importe quel visiteur fabrique une commande, un séquestre
    et un NUMÉRO DE FACTURE dans le registre réel
```

Ce n'est pas une hypothèse. `KOLI-M6BDYA9F` portait 2 500 FCFA jamais
encaissés, 2 000 FCFA de séquestre inexistant, et **`FAC-2026-000001`** — le
premier numéro de la série fiscale de l'année. `rangSuivant` lit le plus grand
numéro, pas le nombre de factures : la première vraie vente aurait donc porté
le n° 2, avec un n° 1 ne correspondant à rien. C'est le genre d'écart qu'un
comptable relève.

C'est le problème que le §4 décrit à propos du jeu de démonstration, entré par
une autre porte — et cette porte-là est ouverte à tout le monde.

**Le détecteur est `Payment.simulatedOutcome`.** Cette colonne est renseignée
par le chemin simulé et **reste nulle en mode réel** — c'est exactement pour
cela qu'elle a été gardée telle quelle dans `lib/payments/aboutissement.ts`.
`npm run supabase:registre` s'en sert :

```bash
npm run supabase:registre                # montre, ne touche à rien
npm run supabase:registre -- --appliquer # efface
```

`provider = 'TEST'` ne suffirait pas : une commande peut naître en mode test et
n'avoir jamais été payée. Ce qu'on retire, ce sont les écritures **fabriquées**,
pas les commandes en attente. Le script compte les dépendances avant et après —
une cascade absente laisserait des lignes orphelines, et une ligne orpheline
dans un registre financier est pire qu'une ligne fausse : elle n'apparaît plus
nulle part.

**Le stock ne revient pas tout seul.** Une vente simulée DÉCRÉMENTE le stock,
comme une vraie — le décompte se fait au paiement (§17). Effacer la commande ne
le rend pas : la première version du script a laissé le produit « Robe » à zéro
après avoir supprimé la fausse vente qui l'avait vidé. Un article invendable
pour une vente qui n'a jamais eu lieu, et rien pour le signaler.

Le script rend désormais le stock, et **seulement pour les paiements ABOUTIS** :
une simulation en échec n'a rien décrémenté, lui rendre du stock en inventerait.
Falsifié contre la base locale : Pagne 6 → 7, Robe 15 → 16.

⚠ **Le vrai correctif n'est pas le nettoyage.** Tant que production, mode test
et base de production coexistent, la pollution revient. Elle cesse le jour où la
production bascule en `ikeepay` : il n'y a alors plus de bouton à appuyer.

### Fermer la production au public est IMPOSSIBLE sur le plan Hobby

Éprouvé le 5 septembre 2026, par l'API Vercel, et non déduit :

| Réglage | Réponse |
|---|---|
| `ssoProtection: { deploymentType: "all" }` | **428** — « Vercel Authentication is not available on your plan for production deployments » |
| `ssoProtection: { deploymentType: "preview" }` | **200** — disponible |
| `passwordProtection` | **428** — « Advanced Deployment Protection is not enabled » |

Le seul réglage disponible protège **les aperçus**, c'est-à-dire exactement
l'inverse du besoin : il fermerait le site d'essai — celui qui prélève vraiment
— et laisserait la production ouverte à la simulation.

⚠ **Ce test a une conséquence qu'il faut annuler.** Le troisième appel active
réellement la protection sur les aperçus, ce qui **bloque le rappel iKeePay**.
Après toute exploration de ces réglages : remettre `ssoProtection: null` et
vérifier que le rappel répond encore, avant que quiconque ne paie. Un rappel
bloqué pendant un vrai paiement, c'est un client débité et une commande figée.

Le jeton du CLI est lisible dans
`%APPDATA%/xdg.data/com.vercel.cli/auth.json` — c'est par là que passent les
appels à `api.vercel.com` quand le CLI n'offre pas la commande.

### Le site d'essai porte un nom STABLE

`https://koli-essai.vercel.app` (`vercel alias set`), et non l'adresse du
déploiement.

Une adresse de déploiement (`koli-nfcce35hf-…`) change à chaque envoi. Déclarée
telle quelle chez iKeePay, elle serait morte au redéploiement suivant — et le
rappel serait posté dans le vide, sans erreur visible, pendant un vrai paiement.

⚠ **Les deux sites se ressemblent, et c'est ce qui a fait perdre trois jours.**
L'essai du 2 septembre a été joué sur `koli-zeta.vercel.app`, la production, en
mode test — d'où « ça fonctionne toujours en mode test ». Le seul repère visible
est la mention « mode test » : le site d'essai n'en porte aucune.

### Le premier vrai encaissement, et les deux défauts qu'il a révélés

Le 6 septembre 2026, 1 000 CDF ont été encaissés pour de vrai sur
`KOLI-B68YSD5C`. Le tableau de bord iKeePay affichait **COMPLETED**. KOLI n'en
a rien su.

**`providerRef` n'est JAMAIS écrit en mode réel.**

En mode test, `simulatePaymentAction` l'enregistre après `initiate()`. En mode
réel, le tunnel n'a **aucun appel serveur à l'initiation** : `adresseDuTunnel`
bâtit une adresse et jette la référence. Personne ne l'écrit, jamais.

La route de rappel cherchait le paiement par ce champ. Elle ne trouvait
personne, et répondait **200 sans rien faire** — la règle anti-oracle interdit
de révéler qu'une référence est inconnue, donc le refus et le succès se
ressemblent. Un défaut totalement muet, sur le chemin par lequel arrive tout
l'argent.

Elle résout désormais aussi par la **référence de commande** — chez iKeePay les
deux sont la même chaîne — et note la référence manquante au passage, pour
qu'un rapprochement à la main reste possible.

⚠ **`verif:rappel` ne pouvait pas le voir : sa fixture posait un `providerRef`
que la production n'écrit pas.** Un test plus gentil que la réalité ne protège
de rien. Le contrôle 10 part maintenant d'un paiement à `providerRef` NUL —
l'état réel — et vérifie qu'il aboutit quand même. Falsifié en neutralisant le
second chemin : il reproduit exactement la panne du jour, « rappel accepté »
suivi d'un paiement resté en attente.

### « Le montant doit correspondre » — mais dans quelle monnaie ?

Second vrai paiement perdu le 6 septembre 2026, et pour une autre raison que le
premier.

La commande valait **200 XOF**. iKeePay a converti dans son tunnel et encaissé
**796 CDF**. La règle 4 comparait `intent.amount` à `paiement.amount` — 796
contre 200 — et jetait le rappel :

```
{ "recu": true, "traite": false }
```

Un 200 poli, aucune trace, et un acheteur débité pendant que le vendeur ne
voyait rien. La règle est nécessaire — sans elle, un rappel forgé attribuerait
n'importe quelle somme à n'importe quelle commande — mais elle comparait des
grandeurs qui ne se mesurent pas dans la même unité.

**Même devise → comparaison exacte, inchangée. Devises différentes → conversion
et tolérance de ±25 %.** La bande est large exprès : leur taux n'est pas le
nôtre (1,8 % d'écart mesuré), il inclut leur marge, il bouge entre l'affichage
et le prélèvement, et l'arrondi pèse lourd sur de petits montants. Ce qu'elle
attrape encore, c'est un écart d'ordre de grandeur — éprouvé en production : 40
000 CDF et 400 CDF refusés pour une commande de 1 000 XOF, 4 050 et 3 900
acceptés.

⚠ **Taux indisponible ⇒ on NE REJETTE PAS.** Faire dépendre l'aboutissement d'un
vrai paiement d'une API de change tierce coûterait un client débité pour rien.
Le jeton et la référence restent la porte.

**`Payment.collectedAmount` / `collectedCurrency`** retiennent désormais ce qui
a été RÉELLEMENT prélevé. `amount` reste le montant de la commande : les deux
sont vrais et ne se remplacent pas — l'un est ce que le vendeur recevra, l'autre
ce qui a quitté le compte de l'acheteur. Sans eux, le second chiffre n'existait
nulle part, et rapprocher notre registre de leur relevé était impossible.

### Un rappel écarté LAISSE UNE TRACE

C'est le silence qui a coûté les deux paiements du 6 septembre 2026, pas les
deux défauts eux-mêmes.

La route répond **200 à un rappel qu'elle jette**. La règle anti-oracle
l'impose : révéler qu'une référence est inconnue apprendrait à qui sonde
l'adresse quelles commandes existent. Conséquence — le refus et le succès se
ressemblent, le prestataire est satisfait, l'acheteur est débité, et personne
n'apprend rien. Il a fallu lire les journaux de l'hébergeur pour seulement
SAVOIR que les rappels étaient arrivés.

Les quatre points de rejet consignent désormais au journal d'audit, sous
`PAYMENT_CALLBACK_DISCARDED`, avec leur motif et ce que le rappel réclamait :

| Motif | Ce qu'on note en plus |
|---|---|
| aucun paiement ne porte cette référence | — |
| montant différent, même monnaie | montant attendu, devise de la commande |
| montant hors tolérance après conversion | équivalent calculé, écart en % |
| paiement déjà conclu | statut actuel |
| statut sans correspondance | — |

Trois décisions qui se déferaient sans être écrites :

- **La réponse reste indifférenciée.** Le contrôle anti-oracle est toujours là
  et il a raison. Ce qui change, c'est que NOUS savons.
- **Rien n'est consigné en deçà de la porte du jeton.** Sinon n'importe qui
  remplirait le journal en frappant l'adresse.
- **Une panne d'écriture du journal ne change pas la réponse.** Le prestataire
  rejouerait, sans que cela répare quoi que ce soit.

⚠ `verif:rappel` **exige cette trace** : qu'elle existe, qu'elle dise pourquoi,
et qu'elle dise ce qui était réclamé. Sans ce contrôle, la ligne se perdrait au
premier remaniement — et le silence reviendrait, ce qui est exactement comment
ce défaut est né.

⚠ **Ce contrôle a d'abord été écrit de travers, et seule la falsification l'a
montré.** Il cherchait la trace d'une référence FIXE. Le journal d'audit n'étant
pas vidé entre deux campagnes, il retrouvait celle laissée par l'exécution
précédente et restait **vert alors que la consignation était désactivée**. Un
contrôle qui ne peut pas échouer ne protège rien (§8), et celui-là ne le
pouvait pas.

La référence porte désormais un horodatage : la trace ne peut venir que de
CETTE exécution. Falsifié de nouveau, il rend « 0 trace(s) ».

**La leçon dépasse ce fichier :** un contrôle qui lit une table CUMULATIVE doit
s'assurer que ce qu'il y lit vient de lui. Le journal d'audit survit d'une
campagne à l'autre, comme les comptes et les commandes — et c'est précisément
ce qui rend son témoignage trompeur si on ne le date pas.

### Un vendeur sans pays vend en francs CFA sans l'avoir choisi

`deviseDuVendeur(null)` retombe sur XOF. C'est correct pour les comptes créés
avant que `SellerProfile.country` n'existe — ils étaient tous ivoiriens, le pays
ayant été écrit en dur à l'inscription — mais cela reste un repli.

Le 6 septembre 2026, les deux comptes vendeurs de Supabase étaient dans ce cas,
et leurs commandes sortaient en francs CFA pour des acheteurs de Kinshasa. Leur
pays a été renseigné à la main (RDC) ; leurs commandes ANTÉRIEURES gardent leur
devise, un registre ne se relit pas.

⚠ **À vérifier après toute reprise de données** : un vendeur sans pays est un
vendeur dont les prix ne sont peut-être pas dans la monnaie qu'il croit.

### L'ordre des déploiements, appris à mes dépens

La migration `devise-exigee` retire la valeur par défaut de
`Transaction.currency`, pour que le compilateur exige la devise à chaque
écriture. Elle a été appliquée à Supabase **avant** que le code correspondant
soit déployé.

Résultat immédiat : le rappel du prestataire a répondu **500**. Le code déployé
n'écrivait pas la colonne, devenue `NOT NULL` sans défaut.

C'est exactement ce que le §4 annonce — « une migration appliquée à Supabase ne
suffit pas, le code déployé doit suivre » — et je l'ai fait dans le mauvais
ordre, sur un vrai paiement.

**La règle, formulée pour ne plus s'y tromper :** une migration qui RESSERRE une
contrainte (`NOT NULL`, retrait d'un défaut, clé étrangère) se déploie APRÈS le
code ; une migration qui ÉLARGIT (colonne ajoutée, contrainte levée) se déploie
AVANT. Le sens est toujours le même : à aucun instant le code en ligne ne doit
violer le schéma en ligne.

⚠ Le défaut a été rétabli en urgence pour débloquer, et il a **immédiatement**
produit deux écritures en XOF sur une commande en CDF — corrigées depuis la
commande. La démonstration la plus nette de pourquoi ce défaut ne doit pas
exister : il ne se trompe pas de temps en temps, il se trompe tout de suite.

### iKeePay règle en DOLLARS, pas dans la monnaie encaissée

Les 1 000 CDF encaissés ont été crédités **0,45 USD** au portefeuille. Le
portefeuille CDF est resté à zéro.

Sur le taux, rien à conclure : 1 000 CDF valent 0,436 USD au marché, ils ont
crédité 0,45 — trois pour cent d'écart, probablement l'arrondi à deux décimales
sur un montant minuscule. Il faudra une vraie vente pour juger.

**Mais le fait structurel ouvre un trou dans le modèle.** KOLI dit au vendeur
« 1 000 FC sous séquestre » ; la somme réellement détenue est en dollars, et sa
valeur en francs congolais bouge entre le séquestre et le versement. Quelqu'un
porte un risque de change que personne n'a choisi de porter.

`Fund.amount` est un entier dans la monnaie de la commande, et suppose que
l'argent est détenu dans cette monnaie. Il ne l'est pas.

Trois issues, et le choix appartient à l'utilisateur — mais la première question
est de savoir si iKeePay permet d'être crédité en CDF (leur portefeuille a une
case CDF, restée vide). Posée par courriel le 6 septembre 2026. À défaut : KOLI
absorbe l'écart et garantit le montant, ou le vendeur reçoit ce que les dollars
valent au versement — auquel cas il faut le dire à l'inscription, pas au moment
de payer.

⚠ **Ne pas construire le versement au vendeur avant d'avoir tranché.**

### Les notifications n'allaient NULLE PART

`notifier()` écrivait une ligne dans `Notification`, visible dans l'écran des
notifications de KOLI. C'est tout ce qu'elle faisait. Un vendeur qui ne rouvre
pas l'application de la journée ne savait pas qu'il avait vendu — et le §44 dit
que c'est LE moment à annoncer.

`lib/notifications/courriel.ts` est le pont entre la ligne écrite et la boîte du
destinataire. `lib/notifications/textes.ts` porte les phrases, et rien d'autre.

**Resend, par `fetch` et sans SDK.** Leur API est un seul POST ; le SDK ajoute
une dépendance à installer, mettre à jour et auditer pour ce que trente lignes
font ici — et chaque kilo-octet du serveur se paie au démarrage à froid, sur un
public à réseau lent (§70).

**Un sous-domaine dédié : `koli.premiummarketafrica.com`.** La réputation d'envoi
se construit par domaine. Si KOLI tombe un jour sur des adresses invalides, c'est
`koli.` qui en souffre — pas le domaine racine, ni le second projet qui s'en sert.
DKIM, SPF et DMARC sont posés chez Hostinger et vérifiés chez Resend ; sans le
`_dmarc`, les deux premiers essais sont arrivés dans les indésirables.

Sept décisions, et chacune se déferait sans être écrite :

- **AUCUN montant dans le courriel du livreur, et c'est le §25.** Il ne doit
  jamais voir la valeur de ce qu'il transporte : un livreur qui sait qu'il porte
  400 000 FCFA ne fait pas le même trajet. La règle était déjà tenue à l'écran
  (`verif:courbes`) ; un courriel est un écran de plus, et celui qui voyage le
  mieux — il se montre, se transfère, se lit par-dessus l'épaule.
- **La commission n'est jamais nommée.** Décision de l'utilisateur, le 6
  septembre 2026. Le chiffre annoncé est celui que le vendeur touche, vrai sans
  réserve ; le détail de ce qui a été retenu vit dans son solde (§40), où il se
  regarde posément plutôt que de s'apprendre dans un courriel.
- **Les montants sont LUS dans le registre, jamais recalculés.** Le séquestre
  vient de `Fund`, le règlement de `Payment`, le net libéré de la somme des
  écritures `FUNDS_RELEASED` et `COMMISSION` — qui est négative, donc s'additionne.
  Refaire le calcul, c'est se donner une seconde chance de se tromper, et l'écart
  ne se verrait que dans la boîte du vendeur.
- **Registre muet ⇒ phrase sans chiffre, et elle reste correcte.** Chaque texte
  est écrit pour tenir debout sans montant. Un test éprouve l'absence de
  deux-points orphelin, d'espace avant un point et de double espace — les marques
  d'un gabarit dont un morceau a disparu.
- **Aucun lien cliquable.** Décision de l'utilisateur. Un courriel qui apprend
  une vente et pousse à cliquer ressemble exactement à celui qui l'imite ; le
  destinataire ouvre KOLI par où il a l'habitude.
- **Hors de la transaction, et après la réponse.** `after()` de Next : l'acheteur
  ne patiente pas derrière Resend, et la transaction est déjà close quand le
  courriel part. **Un courriel parti ne se rappelle pas** — envoyé de l'intérieur,
  un échec ultérieur laisserait un vendeur prévenu d'une vente qui n'existe pas.
- **`declencherExpedition()` n'échoue JAMAIS bruyamment.** Hors contexte de
  requête — un script, un test — `after()` lève. On l'attrape et on ne fait rien :
  la notification reste en attente, alors qu'une exception ici annulerait le
  paiement qui vient d'aboutir.

**Les adresses de démonstration ne reçoivent rien.** `koli.ci`, `exemple.ci`,
`example.com`, `test.local`. Chaque campagne crée des ventes, donc des
notifications : sans ce garde, elle expédierait une dizaine de courriels vers des
boîtes inexistantes à chaque passage, et chaque rebond abîme la réputation
d'envoi — celle qui décide si un vrai vendeur trouve le message dans sa boîte.
Un expéditeur neuf n'a droit qu'à peu d'erreurs ; les dépenser en tests serait
dommage.

⚠ **La liste est EXPLICITE, pas une devinette.** Un filtre malin — « les adresses
contenant *test* » — écarterait un jour le courriel d'un vrai commerçant qui
s'appelle Testa. Un test le dit.

**Six points déclenchent l'expédition**, et il a fallu les chercher :
`aboutissement.ts` (vente et paiement confirmé), `assign.ts` (livreur assigné),
puis `deliveries/actions.ts` (livré), `disputes/actions.ts` (litige ouvert),
`orders/actions.ts` (fonds libérés) et `refunds/actions.ts` (remboursement).

⚠ **Les quatre derniers manquaient.** Ils s'en remettaient à la tâche de
rattrapage — qui, sur le forfait Hobby, passe **une fois par jour** (§8). Un
vendeur réglé à 4 h l'aurait appris à 3 h le lendemain, pour le courriel qui est
l'aboutissement de toute la promesse KOLI.

⚠ **Sans clef, on ne marque RIEN.** `sentAt` posé sans envoi ferait disparaître
à jamais des notifications que personne n'a reçues. En revanche une ligne
inexpédiable — pas d'adresse, pas de texte pour ce type, pas de référence — est
marquée avec son motif : sinon elle reviendrait à chaque passage et bloquerait la
file derrière elle.

⚠ **Une notification sans référence de commande n'est pas envoyée.** `entityId`
est nullable ; le repli sur une chaîne vide produisait « Vous avez une vente — »
et « la commande . » — un courriel visiblement cassé, adressé à un vrai vendeur,
sur une application dont le sujet est la confiance.

**Sept types sur douze partent ; cinq sont muets, et c'est un CHOIX.**
`SANS_COURRIEL` porte les étapes de livraison — colis prêt, ramassé, en route,
arrivé, réception confirmée. Les écrire ferait quatre courriels de plus par
commande pour une information que l'acheteur suit dans l'application et qui ne
lui demande rien ; un service qui écrit trop finit dans les indésirables, et
emporte les trois messages qui comptaient.

⚠ **La liste existe pour que le registre distingue un CHOIX d'un OUBLI.** Sans
elle, `sendError` disait « aucun texte pour ce type » dans les deux cas, et la
prochaine lecture aurait corrigé le choix en croyant réparer l'oubli. Un test
exige que chaque valeur de l'énumération soit dans l'un ou l'autre, jamais dans
les deux ni dans aucun : ajouter un type au schéma sans trancher échoue,
en le nommant. Falsifié en retirant `ARRIVED` de la liste.

**Une notification SURVIT à sa commande, et ne doit alors rien annoncer.**
`entityId` est une chaîne, pas une clef étrangère : rien ne la supprime en
cascade. Le ménage du registre (`supabase:registre`) efface les ventes
FABRIQUÉES et laisse leurs notifications derrière lui — `KOLI-M6BDYA9F` en est
une, et son destinataire est une **vraie** personne. « Le registre ne dit rien
encore » et « cette commande n'existe pas » se ressemblaient : les deux
donnaient quatre `null`, et le courriel partait quand même. `montantsDe()`
rend désormais `null` pour le second cas, et la ligne est marquée
`commande absente du registre`.

⚠ **C'est ce qui aurait eu lieu au premier déploiement.** Quatre notifications
attendaient en ligne, écrites avant que le canal courriel existe ; trois sont
sur `koli.ci`, la quatrième sur une vraie adresse et pour la vente fabriquée
du 2 septembre. Le garde les couvre toutes les quatre sans qu'on touche à la
base de production.

**La DÉCISION est séparée du TRANSPORT.** `motifDeNonEnvoi()` est pure : elle
rend le motif qui empêche d'écrire, ou `null`. Elle vivait dans une ternaire à
quatre étages au milieu de la boucle — l'endroit le plus difficile à lire du
fichier, et le seul qu'on ne pouvait éprouver sans `DATABASE_URL`.

⚠ **L'ORDRE des motifs n'est pas arbitraire.** Une notification sans adresse ET
sans référence doit dire « aucune adresse » : c'est le fait le plus général,
celui qui explique le reste. Un motif qui change selon un détail sans rapport
rend le registre illisible — et c'est le registre qu'on lira pour comprendre
pourquoi un vendeur n'a rien reçu. Falsifié en intervertissant deux tests : le
contrôle le voit.

**Les textes sont SÉPARÉS de l'expédition** (`textes.ts`) parce qu'ils sont purs :
aucune base, aucun réseau. `courriel.ts` importe `prisma`, qui exige
`DATABASE_URL` au chargement — les éprouver aurait demandé une base. Un contrôle
qu'on ne peut pas lancer est un contrôle qu'on ne lance pas. Dix-huit contrôles dans
`lib/__tests__/courriels.test.ts`, sans une variable d'environnement.

Falsifié en glissant `${m.sequestre}` dans le message du livreur : le contrôle du
§25 tombe, seul, en nommant le montant qu'il a trouvé.


**La clef Resend est sur l'APERÇU seulement** — décision de l'utilisateur, le 7
septembre 2026. `koli-essai.vercel.app` est le seul site qui encaisse pour de
vrai : les courriels y annoncent de vraies ventes.

⚠ **La production reste muette, et ce n'est pas un oubli.** Elle tourne en
`PAYMENT_MODE=test` et elle est ouverte au public : n'importe quel visiteur qui
appuie sur « simuler un paiement réussi » y fabrique une commande dans le
registre réel (§8). Y poser la clef ferait partir un courriel annonçant cette
vente inventée, à une vraie adresse. La clef s'y posera le jour où la
production bascule sur `ikeepay` — il n'y aura alors plus de bouton à appuyer.

**Éprouvé en production le 7 septembre 2026, et non déduit.** La route de
rattrapage a été déclenchée à la main sur l'essai, clef valide en place :

```
{"courriels":{"envoyees":0,"echouees":0,"ignorees":4}}
```

Les quatre notifications qui dormaient en ligne depuis avant l'existence du
canal ont été écartées et marquées, chacune avec son motif :

| Commande | Adresse | Motif |
|---|---|---|
| `KOLI-M6BDYA9F` | une **vraie** adresse | commande absente du registre |
| `KOLI-B68YSD5C` | `koli.ci` | adresse de demonstration |
| `KOLI-E5ZNYA6R` | `koli.ci` | adresse de demonstration |
| `KOLI-E5ZNYA6R` | `koli.ci` | adresse de demonstration |

La première est celle qui comptait : c'est la vente FABRIQUÉE du 2 septembre,
effacée depuis du registre, dont la notification a survécu. Zéro courriel parti,
zéro notification en attente.

### La file d'envoi pouvait se bloquer, définitivement et en silence

Trouvé le 7 septembre 2026, en cherchant quoi proposer sur Resend. C'est un
défaut du travail de la veille, et le plus grave qu'il portait.

Sur échec, `sentAt` restait nul — voulu : une coupure réseau ne doit pas faire
disparaître l'annonce d'une vente. Mais **rien ne comptait les tentatives**.
Éprouvé avec une clef invalide, deux notifications en tête de file :

```
passage 1 : envoyees=0 echouees=2   file-1 EN ATTENTE
passage 2 : envoyees=0 echouees=2   file-1 EN ATTENTE
passage 3 : envoyees=0 echouees=2   file-1 EN ATTENTE
```

Un 401 ne guérit jamais, et il repassait quand même. Or la requête lit les
**vingt-cinq plus anciennes** : vingt-cinq lignes définitivement en échec
occupaient toute la fournée, et plus aucune vente n'était annoncée. Aucune
erreur, aucun écran, rien — exactement la forme des deux paiements perdus du
6 septembre.

**Le statut HTTP tranche, et c'est plus juste qu'un compteur aveugle**
(`lib/notifications/reessai.ts`) :

| Réponse | Ce qu'on en fait |
|---|---|
| 4xx sauf 429 — clef révoquée, domaine non autorisé, adresse illisible | définitif : on marque, la file avance |
| **429** — trop vite | passager : Resend accorde 10 requêtes/seconde, la boucle en enchaîne 25 |
| 5xx, coupure, délai | passager : on repasse |

Trois décisions qui se déferaient sans être écrites :

- **Le 429 est l'exception qui compte.** Le traiter comme définitif jetterait
  des ventes pour la seule raison qu'elles arrivent en même temps que d'autres
  — c'est-à-dire un jour de forte activité, le pire moment. Falsifié en le
  retirant : le contrôle le voit.
- **L'ordre est `sendAttempts` PUIS `createdAt`.** Une ligne déjà en échec
  passe après celles jamais tentées : une panne passagère ne doit pas retarder
  l'annonce des ventes qui arrivent pendant qu'elle dure.
- **`TENTATIVES_MAX` vaut 8, pas 3.** Le compteur monte à chaque tentative, et
  une panne chez le prestataire pendant une heure chargée en brûlerait
  plusieurs pour rien. Ce plafond n'arbitre aucun cas réel — `refusDefinitif`
  s'en charge ; il empêche une boucle infinie sur un échec imprévu.

Éprouvé dans les deux sens, contre le vrai serveur : clef invalide ⇒ tout est
clos au premier passage, `echouees=0` au second ; API pointée sur un port mort
⇒ la ligne reste en attente, `tentatives` monte 1 → 2 → 3.

### Une adresse d'envoi ne reçoit rien

`notifications@koli.premiummarketafrica.com` émet ; personne n'y lit. Un vendeur
qui apprend une vente répond — c'est le premier réflexe devant un courriel, et
sur un service dont le sujet est la confiance, écrire à quelqu'un sans pouvoir
être répondu est un mauvais début.

`RESEND_REPLY_TO` porte l'adresse de réponse.

⚠ **Non renseignée ⇒ AUCUN `reply_to`**, et surtout pas un repli inventé. Une
adresse de réponse qui rebondit est pire que pas d'adresse : elle promet une
écoute qui n'existe pas, et le rebond abîme la réputation d'envoi du domaine.

### La clef Resend ne sait QUE envoyer, et depuis un seul domaine

Elle était en `Full access` : elle pouvait supprimer les domaines et créer
d'autres clefs. Remplacée le 7 septembre 2026 par une clef `sending_access`
liée à `koli.premiummarketafrica.com` — créée par l'API, avec l'ancienne, ce
qui était précisément le seul usage légitime de son accès total.

Portée vérifiée, et non supposée :

| Tentative | Réponse |
|---|---|
| Envoyer depuis `koli.premiummarketafrica.com` | **200** |
| Envoyer depuis `premiummarketafrica.com` (l'autre projet) | **403** — `not authorized to send emails from…` |
| Lire les domaines, lister les clefs | **401** — `restricted to only send emails` |

**L'ancienne clef `Full access` est RÉVOQUÉE** (7 septembre 2026). Trois clefs
existaient au compte ; seule celle nommée `koli`, créée la veille et posée dans
`.env`, a été supprimée :

| Clef | Sort |
|---|---|
| `koli-envoi` — restreinte, créée ce jour | **gardée** — c'est celle qui sert |
| `koli` — `Full access`, celle de `.env` | **supprimée** |
| `Onboarding` — créée le 2 septembre, avant que KOLI existe chez Resend | **laissée** : elle n'est pas à nous, et c'est vraisemblablement celle du second projet |

⚠ **Une clef supprimée rend `400`, pas `401`.** « *API key is invalid* », avec
le statut d'une requête mal formée. Un contrôle qui cherche `401` conclurait
qu'elle marche encore — c'est ce qu'a fait le premier essai, et c'est le corps
de la réponse qui a tranché, pas le code.

**Conséquence à connaître** : plus aucune clef de ce poste ne peut administrer
le compte Resend. Créer un domaine, lire les clefs, en révoquer une — tout cela
passe désormais par leur tableau de bord, à la main. C'est le but, et c'est
aussi ce qui rendra la prochaine rotation moins commode : il faudra créer la
nouvelle clef dans leur interface avant de pouvoir échanger quoi que ce soit.

⚠ **Resend est en `eu-west-1`** et le domaine y est `verified`. Le quota
mesuré : **10 requêtes par seconde** (`ratelimit-policy: 10;w=1`). Les plafonds
journalier et mensuel du forfait gratuit ne se lisent pas par l'API — à
regarder sur leur tableau de bord avant de compter dessus, car une commande
complète produit cinq à six courriels sur sa vie.


### Un montant ne peut pas revenir à la ligne, seulement déborder

`formatMontant` assemble ses montants avec des espaces **insécables** — entre
les groupes de chiffres et avant le symbole. C'est la bonne typographie : « 8 »
et « 000 » ne doivent jamais se séparer, ni « 8 000 » et « FCFA ».

┌────────────────────────────────────────────────────────────────────────────┐
│  Conséquence : « 8 000 FCFA » est UN SEUL BLOC. Dans un conteneur trop     │
│  étroit, il ne se replie pas — il déborde, et la PAGE défile.              │
└────────────────────────────────────────────────────────────────────────────┘

Trouvé le 7 septembre 2026 sur le tableau de bord livreur, à 320 px : deux
colonnes laissaient 96 px de contenu par carte pour un chiffre qui en faisait
133. Le §8 interdit le défilement horizontal ; la page en avait un.

⚠ **Ce défaut est APPARU SANS QUE LE CODE CHANGE.** Il dépend du montant :
tant que le livreur avait gagné trois chiffres, tout tenait. C'est la
signature d'une classe entière de bugs — un écran juste aujourd'hui, faux
demain, sans qu'aucun commit ne soit en cause.

Trois corrections, et l'ordre compte :

- **`min-w-0` sur les cartes.** Dans une grille, un élément refuse par défaut
  de descendre sous la largeur de son contenu (`min-width: auto`). Sans lui, la
  carte pousse la grille, qui pousse la page : ce n'est pas la carte qui
  défile, c'est le document.
- **Une seule colonne sous 380 px.** Deux colonnes à 320 px ne peuvent pas
  porter un montant à cinq chiffres à une taille lisible — ce n'est pas un
  réglage à trouver, c'est une place qui n'existe pas. Le tableau de bord
  vendeur était déjà en `grid-cols-1 sm:grid-cols-2` ; le livreur était le seul
  à forcer deux colonnes dès 320.
- **`[overflow-wrap:anywhere]` sur les montants**, en dernier recours. Il ne
  s'exerce que si le texte ne rentre pas : un montant énorme casse au lieu de
  pousser la page. Laid, mais borné — et le défilement horizontal, lui, ne
  l'est pas.

Mesuré à 320, 360, 380, 420, 768, 1024 et 1280 px : le document fait exactement
la largeur de la fenêtre, et aucun paragraphe ne déborde. Comme pour les
couleurs, la valeur n'est pas approchée à l'œil.

⚠ **La règle générale, pour tout écran qui affiche de l'argent** : un montant
est un bloc insécable, il faut donc lui donner la place ou l'autoriser à
casser. `min-w-0` sur le conteneur, et jamais deux colonnes serrées pour un
chiffre qu'on veut voir en grand.


### Le vendeur fixe SA monnaie, l'acheteur lit la sienne

C'est la demande d'origine, le 6 septembre 2026 : « le vendeur ivoirien vend
2000 fcfa et le client congolais doit voir le prix en cdf automatiquement ».

KOLI dessert 17 pays et 12 monnaies — la couverture d'iKeePay. La devise d'une
commande est celle du **pays du vendeur** (`SellerProfile.country` →
`deviseDuVendeur`), figée à la création et jamais relue : un registre ne se
relit pas.

┌────────────────────────────────────────────────────────────────────────────┐
│  LA CONVERSION AFFICHÉE EST INDICATIVE. Elle ne fait jamais foi.           │
└────────────────────────────────────────────────────────────────────────────┘

Le vendeur fixe 2 000 FCFA : c'est ce qu'il reçoit, et c'est le montant que
porte la commande. L'acheteur congolais voit « ≈ 8 100 FC » pour savoir ce que
cela représente chez lui — mais c'est **iKeePay** qui convertit au moment du
prélèvement, à SON taux.

**L'écart est mesuré, pas supposé** : le 6 septembre 2026, notre source donnait
1 XOF = 4,0506 CDF quand leur tunnel affichait 796 CDF pour 200 XOF, soit 3,98.
Environ 2 %, leur marge de change. Annoncer notre chiffre comme définitif ferait
mentir l'écran d'un acheteur sur deux.

Cinq décisions, et chacune se déferait sans être écrite :

- **Le « ≈ » n'est pas décoratif**, et il DISPARAÎT entre deux francs CFA. XOF
  et XAF sont arrimés à l'euro au même taux : le montant y est exact, et un
  « environ » serait une fausse modestie qui ferait douter d'un chiffre qui ne
  le mérite pas.
- **Une parité fixe ne passe JAMAIS par le réseau.** Aller demander à une API
  que 1 = 1, c'est payer un aller-retour sur un écran de paiement vu sur réseau
  lent (§70), et s'ouvrir une panne là où il n'y en avait aucune. Un test
  vérifie que `fetch` n'est pas appelé — c'est le contrôle qui compte, pas le
  résultat.
- **Taux hors d'atteinte ⇒ l'écran n'affiche RIEN de plus.** Pas de taux
  périmé, pas de « — ». Un montant absent se remarque ; un montant faux se
  croit.
- **Un taux à ZÉRO est refusé**, d'où `> 0` et non `!= null`. Zéro passerait
  toute vérification d'existence et rendrait un montant nul — « 0 FC » sur un
  écran de paiement se lit « gratuit ». Falsifié en retirant la garde : le
  contrôle rend `montant: +0`, et le voisin `montant: -8000`, un prix négatif.
- **`formatTotaux` JUXTAPOSE, il n'additionne pas.** Un tableau de bord qui
  mêle des commandes en XOF et en CDF ne peut pas en faire une somme : les
  totaux s'affichent côte à côte, séparés par « · ». Une addition y serait un
  nombre qui ne veut rien dire, présenté comme un solde.

**Le pays de l'ACHETEUR décide de ce qu'il lit ; son défaut valait « Côte
d'Ivoire » pour tout le monde.** `app/pay/[reference]` lit
`deviseDuPays(dbOrder.buyerCountry)` — c'est ce champ, et lui seul, qui
déclenche la conversion. Un commerçant de Kinshasa qui ne touchait pas au menu
créait donc une commande en francs congolais pour un acheteur déclaré ivoirien,
et la page annonçait à ce Congolais un équivalent en FCFA : l'inverse exact de
ce que cette conversion existe pour faire.

Le défaut est désormais **le pays du vendeur**. Sur une plateforme de commerce
local, la vente est domestique bien plus souvent qu'elle ne traverse une
frontière ; le menu reste là pour l'autre cas.

⚠ **Le défaut du SCHÉMA reste « Côte d'Ivoire »** (`lib/orders/actions.ts`),
et c'est voulu : c'est un dernier recours pour une soumission sans le champ,
pas un choix offert à quelqu'un. Il rejoint le repli de `deviseDuVendeur(null)`
— voir « Un vendeur sans pays vend en francs CFA sans l'avoir choisi ».


⚠ **`lib/finance/change.ts` dépend d'une API tierce et fait de l'arithmétique
sur de l'argent affiché.** Ses quatorze contrôles remplacent `fetch` : un test
qui interrogerait vraiment `open.er-api.com` échouerait un jour parce qu'ils
sont en panne, et on chercherait le défaut chez nous.

### « FCFA » restait écrit en dur là où personne ne regarde

Le travail sur les devises a d'abord traité ce qui se voit : les prix, les
totaux, les factures, le tunnel de paiement. Il restait **34 occurrences**, et
les plus graves n'étaient pas les plus visibles.

**Trois écrivaient une monnaie fausse dans un enregistrement.**

- `lib/orders/actions.ts` et `lib/refunds/actions.ts` consignaient au journal
  d'audit `details: { montant: "20500 FCFA" }` — pour une commande en francs
  congolais aussi. Ce journal est ce qu'on relit pour **rapprocher les
  écritures** (§48) ; une unité fausse y vaut un chiffre faux.
- `lib/notifications/activite.ts` formatait en FCFA les vignettes de la page
  d'**accueil publique**. Un vendeur de Kinshasa réglé en francs congolais s'y
  affichait comme ayant reçu des francs CFA — quatre fois plus. La vitrine
  affirme des faits ; celui-là était faux, et c'était le plus visible du site.

**Quatre trompaient le vendeur au moment où il saisit.** Les formulaires de
produit et de commande étiquetaient « Prix unitaire (FCFA) » pour tout le monde.
Un commerçant de Kinshasa qui tape 5 000 lit qu'il demande 5 000 francs CFA. Il
ne s'en apercevrait qu'à la première vente, et son client avant lui.
`FormulaireCommande` **recevait déjà** `devise` et ne s'en servait pas pour
ses étiquettes ; `FormulaireProduit` ne la recevait pas du tout.

**Deux messages de validation ne peuvent nommer aucune monnaie.** Les schémas
Zod de `lib/orders/actions.ts` et `lib/products/actions.ts` sont statiques, au
niveau du module : ils ne connaissent ni le vendeur ni son pays. Plutôt que d'en
supposer une — ce qui était le défaut —, « d'au moins 100 FCFA » est devenu
« d'au moins 100 ». L'étiquette du champ, elle, porte le symbole : le lecteur a
l'unité sous les yeux à l'instant où il saisit.

⚠ **Ce qui reste, et c'est voulu** : les commentaires qui citent « FCFA » comme
exemple, et `SYMBOLE.XOF`/`SYMBOLE.XAF` qui valent « FCFA » parce que c'est le
nom de ces monnaies. Le jeu de démonstration est ivoirien : les contrôles qui
cherchent « FCFA » à l'écran ont donc toujours raison de le trouver.

⚠ **Un balayage comme celui-ci ne se termine pas par un `grep` vide.** Il se
termine quand on a répondu, pour chaque occurrence, à « qui lit ceci, et dans
quelle monnaie pense-t-il ? ». Les trois plus graves étaient invisibles à
l'écran — dans un journal d'audit et sur une page d'accueil que le vendeur
concerné ne regarde jamais.

**`npm run verif:devises` garde le terrain repris.** Même famille que
`verif:mentions` : un contrôle STATIQUE qui lit les sources et refuse une
phrase écrite en dur. L'éprouver dans un navigateur demanderait un compte
vendeur par monnaie, donc douze parcours complets à chaque passage de la
campagne — et cela ne couvrirait toujours pas le journal d'audit, qui n'est un
écran pour personne.

Trois choses qui se déferaient sans être écrites :

- **Il cherche le symbole COLLÉ À UN AFFICHAGE**, pas le symbole nu. « FC »
  seul signalerait « FCFA », « FComplet » et la moitié des identifiants du
  projet ; seules comptent les tournures où il sert d'unité à un montant. Un
  contrôle qui crie à tort finit par ne plus être lu — c'est ce qui a coûté
  deux faux positifs à `verif:mentions`.
- **La liste des symboles est RECOPIÉE, pas importée** de `data/markets.ts`.
  L'importer ferait dépendre le contrôle du fichier qu'il surveille : un
  symbole retiré là-bas cesserait d'être cherché ici, en silence.
- **Les tests et `markets.ts` sont épargnés.** Le jeu de démonstration est
  ivoirien : un test qui attend « 16 000 FCFA » a raison de l'écrire.

Falsifié en remettant un « FCFA » en dur dans le journal des remboursements :
il le nomme, avec son fichier et sa ligne, et sort en échec.

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

⚠ **Ceux-ci sont LOCAUX.** Ils viennent de `prisma/seed.ts` et n'existent que
sur le poste. En ligne, l'administrateur est `admin@koli.ci` — même adresse,
mais **le mot de passe a été choisi par l'utilisateur le 6 septembre 2026** et
n'est écrit nulle part, ni ici, ni dans le dépôt, ni dans une conversation.
Pour en poser un autre : `ADMIN_PASSWORD="…" npm run admin:motdepasse`, qui
écrit sur la base EN LIGNE (`.env` seul) et vérifie que le nouveau rouvre bien
le compte. On se connecte par `/connexion` comme tout le monde ; c'est le rôle
porté par le compte qui ouvre `/admin`.

Mot de passe commun : `Password123!`

| Rôle | Adresse |
|---|---|
| Administrateur | `admin@koli.ci` |
| Vendeur | `vendeur@koli.ci` |
| Vendeur (concurrent, pour les contrôles de cloisonnement) | `vendeur2@koli.ci` |
| Client | `client@koli.ci` |
| Livreur | `livreur@koli.ci` |
