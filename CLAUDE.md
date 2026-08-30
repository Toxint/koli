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

## 4. État au 30 août 2026

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

⚠ **La base Supabase porte le jeu de DÉMONSTRATION** — elle a été préparée avant
que l'amorce n'existe. À vider avant d'ouvrir le site :
`DATABASE_URL="<supabase>" npm run base:vider -- --comptes`, puis
`npm run base:amorcer`. Sans quoi le premier vrai vendeur lira des
encaissements qui ne sont ceux de personne, et `admin@koli.ci` /
`Password123!` — publié dans ce dépôt — ouvrira l'administration.

Le dépôt distant existe : `github.com/Toxint/koli`, branche `master`.

Reste à faire : connecter Vercel et renseigner les variables.

⚠ `AUTH_SECRET` vaut `koli-dev-…` : ce n'est pas un tirage aléatoire. Il signe
les jetons de session — en production, une valeur devinable permettrait de
forger la session de n'importe quel compte, administrateur compris. **À
régénérer avant la mise en ligne.**

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
  invoices/  notifications/  audit/  kyc/  sellers/  products/
  auth/    db/       admin/       config/     navigation.ts  format.ts
  __tests__/             les tests unitaires

components/
  ui/                    composants génériques
    LogoKoli.tsx         LA marque — anneau ouvert, comma, sans contenant
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
