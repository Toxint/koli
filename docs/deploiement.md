# Mettre KOLI en ligne

Marche à suivre pour déployer sur **Vercel**, avec **Supabase** pour la base et
le stockage des pièces justificatives.

Ce document est une liste de contrôle, pas un tutoriel : chaque point y figure
parce qu'il a une conséquence, et la conséquence est écrite à côté.

---

## 1. Avant de commencer — ce qui est déjà prêt

| | État |
|---|---|
| Base Supabase | schéma à jour, **nettoyée le 31 août 2026** : zéro commande, zéro donnée fabriquée |
| Seau de stockage KYC | créé, **privé**, aller-retour vérifié |
| Construction | `npm run build` régénère le client Prisma et compile |
| Amorce de production | `prisma/amorce.ts` — réglages, commission, administrateur. **Aucune commande.** |
| Vérification | `npm run verif:tout` passe intégralement en local |

> ### Ne relancez JAMAIS `prisma/seed.ts` contre Supabase
>
> C'est exactement ce que faisait `scripts/preparer-supabase.mjs`, et la base
> en ligne a porté le jeu complet pendant six jours : cinq comptes au mot de
> passe publié dans ce dépôt, 15 commandes, 36 transactions, 14 factures.
>
> La conséquence est directe et muette : **le premier vrai vendeur à ouvrir son
> tableau de bord y lirait des encaissements, une courbe et un solde qui ne sont
> ceux de personne.** Et `admin@koli.ci` / `Password123!` ouvrait
> l'administration à quiconque a lu le dépôt.
>
> **Corrigé le 31 août 2026.** La base ne porte plus aucune donnée fabriquée, et
> `preparer-supabase.mjs` pose désormais l'amorce — la démonstration exige
> `--avec-demonstration`, avec un avertissement.
>
> Si la situation se reproduisait :
>
> ```bash
> npm run supabase:nettoyer                    # état, sans rien toucher
> npm run supabase:nettoyer -- --mouvements    # vide les mouvements
> npm run supabase:nettoyer -- --mouvements --comptes=a@b,c@d
> ```
>
> Il supprime en **une transaction** — tout passe ou rien —, et ne touche que
> les comptes qu'on lui nomme. Il ne devine jamais lesquels sont jetables : une
> règle fondée sur le domaine de l'adresse effacerait un vrai client le jour où
> quelqu'un s'inscrira avec une adresse qui y ressemble.

---

## 2. Le dépôt

Vercel se branche sur un dépôt Git (GitHub, GitLab, Bitbucket).

Le dépôt est en place : **`github.com/Toxint/koli`**, branche `master`. Le
projet Vercel existe et ce poste y est lié (dossier `.vercel/`, projet
`koli`).

Le dépôt peut être **privé** — Vercel s'y connecte sans difficulté. Rien
n'oblige à publier le code.

`.env`, `.env.local` et le dossier `.donnees/` sont ignorés par git : aucun
secret ne part avec le code. Seul `.env.example` est versionné, et il ne
contient que des exemples.

---

## 3. Les variables d'environnement sur Vercel

À renseigner dans **Project Settings → Environment Variables**, jamais dans le
dépôt.

### Obligatoires

| Variable | Valeur | Pourquoi |
|---|---|---|
| `DATABASE_URL` | l'adresse du **pooler** Supabase, port 6543 | sur un hébergement sans serveur, chaque requête peut démarrer son propre processus ; une connexion directe épuiserait la limite de connexions en quelques minutes de trafic |
| `AUTH_SECRET` | **une valeur neuve**, tirée au sort | voir l'avertissement ci-dessous |
| `NEXT_PUBLIC_APP_URL` | l'adresse du site déployé | sert aux liens de paiement et aux messages partagés |
| `PAYMENT_MODE` | `test` | le MVP ne manipule aucun argent réel (§1, §84) |
| `SUPABASE_URL` | `https://<référence>.supabase.co` | stockage des pièces KYC |
| `SUPABASE_SERVICE_ROLE_KEY` | la **secret key** Supabase | idem |
| `ADMIN_EMAIL` | l'adresse de l'administrateur | `prisma/amorce.ts` crée ce compte. Sans lui, personne ne peut vérifier un vendeur ni trancher un litige — et l'inscription ne propose pas ce rôle |
| `ADMIN_PHONE` | son numéro | la connexion accepte l'un ou l'autre |
| `ADMIN_PASSWORD` | **12 caractères minimum**, tiré au sort | aucune valeur de repli, et l'amorce refuse en dessous de 12 : ce compte administre la plateforme entière |
| `CRON_SECRET` | tiré au sort | protège `/api/paiements/rapprochement`, qui écrit en base. Sans lui la route répond 503 et le rattrapage ne tourne pas |

> ### ⚠ `AUTH_SECRET` doit être RÉGÉNÉRÉ
>
> La valeur du poste de développement commence par `koli-dev-…`. Ce secret
> signe les jetons de session : s'il est devinable, n'importe qui peut forger
> la session de n'importe quel compte, **y compris un administrateur**.
>
> En générer un, et le coller directement dans Vercel sans le faire transiter
> ailleurs :
>
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
> ```

> ### ⚠ `SUPABASE_SERVICE_ROLE_KEY` passe outre toutes les règles d'accès
>
> Elle vaut un accès total à la base. Elle ne doit **jamais** porter le préfixe
> `NEXT_PUBLIC_` — ce préfixe embarque la valeur dans le paquet envoyé au
> navigateur — ni être versionnée, ni quitter le serveur.

### Facultatives

| Variable | Effet si absente |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | le bouton « Continuer avec Google » ne s'affiche pas ; le reste fonctionne |
| `PAYMENT_WEBHOOK_SECRET` | une valeur de repli est utilisée en mode test ; **obligatoire** le jour d'un vrai prestataire |
| `DIRECT_URL` | sans effet sur le site — n'est utile qu'aux migrations, qui ne s'exécutent pas sur Vercel |
| `KYC_BUCKET` | `kyc` par défaut |

### À NE PAS mettre sur Vercel

`KYC_STORAGE_DIR`. Elle ferait écrire les pièces d'identité sur le disque de
l'hébergeur, qui est **éphémère** : elles disparaîtraient au déploiement
suivant, sans erreur et sans trace. L'application refuse d'ailleurs de démarrer
un dépôt en production si aucun stockage durable n'est configuré — c'est cette
variable qui lèverait le garde-fou, à tort.

---

## 4. La région

Choisir une région Vercel **proche du projet Supabase**.

Ce n'est pas un détail de confort : une page du produit enchaîne une dizaine de
requêtes. À 5 ms d'aller-retour la page se rend en une fraction de seconde ; à
100 ms elle met plus d'une seconde ; à 700 ms — ce qu'on a mesuré depuis une
liaison dégradée — elle met vingt-six secondes.

Le projet Supabase est en **eu-west-1 (Irlande)** : côté Vercel, prendre
`Dublin (dub1)` ou, à défaut, une région européenne.

---

## 5. Après le premier déploiement

### Mettre à jour `NEXT_PUBLIC_APP_URL`

Vercel attribue une adresse (`https://<projet>.vercel.app`). Reporter cette
adresse dans la variable, puis redéployer. Sans cela, les liens de paiement
envoyés aux clients pointeraient vers `localhost`.

### Déclarer l'adresse de rappel Google

Console Google Cloud → Identifiants → l'ID client OAuth :

- Origine JavaScript autorisée : `https://<projet>.vercel.app`
- URI de redirection autorisé : `https://<projet>.vercel.app/api/auth/google/callback`

C'est le déploiement qui **débloque** la connexion Google : Google refuse les
adresses IP de réseau local, il lui faut un nom de domaine en HTTPS. Elle ne
pouvait donc pas fonctionner depuis un téléphone en développement.

### Vérifier sur le site en ligne

```bash
BASE_URL=https://<projet>.vercel.app npm run verif:parcours
```

Le parcours complet du §80, contre le vrai site. C'est le seul contrôle qui
prouve que le déploiement fonctionne réellement.

Attention : lancé depuis une liaison dégradée, ce contrôle peut échouer pour
des raisons de réseau et non de code — voir `CLAUDE.md`, section 5.

---

## 5 bis. La tâche planifiée

> ⚠ **Une fois par jour, et ce n'est pas un choix.** Le plan Hobby plafonne les
> tâches planifiées à une par jour — et il ne dégrade pas la fréquence en
> silence, il **refuse le déploiement entier** : « Hobby accounts are limited to
> daily cron jobs ». La valeur d'origine, `*/10 * * * *`, a bloqué la mise en
> ligne du 2 septembre 2026.
>
> Ce que cela coûte : le rattrapage ferme les paiements abandonnés avec jusqu'à
> 24 h de retard, et le stock qu'ils immobilisent reste bloqué d'autant. Avec
> iKeePay c'est sa seule utilité — faute de point d'entrée de consultation chez
> eux, un rappel PERDU n'est de toute façon pas rattrapable. Le plan Pro permet
> de revenir à `*/10 * * * *`.
>
> ⚠ Et `vercel.json` **n'accepte aucune propriété en trop** : un `"comment"`
> dans une entrée de `crons` fait échouer la construction en cinq secondes.
> C'est pourquoi cette explication est ici et non dans le fichier.

`vercel.json` déclare une tâche toutes les dix minutes sur
`/api/paiements/rapprochement`. Elle ferme les paiements restés en suspens :
quelqu'un ouvre le tunnel, ne valide pas, ferme l'onglet — sans elle, sa
commande reste « en attente » pour toujours, et le stock avec elle.

> ⚠ **Le forfait Hobby de Vercel limite les tâches à UNE PAR JOUR.** La
> déclaration `*/10 * * * *` y sera ramenée au quotidien sans avertissement, et
> un paiement abandonné le matin resterait ouvert jusqu'au lendemain. Sur un
> forfait Pro, elle s'exécute bien toutes les dix minutes.

Elle exige `CRON_SECRET`. Sans lui, la route répond 503 et ne fait rien — c'est
voulu : elle écrit en base.

⚠ Avec iKeePay, elle ne fait qu'expirer ce qui a dépassé son échéance. Ils
n'exposent aucun point d'entrée pour relire l'état d'une transaction, donc un
rappel PERDU n'est pas rattrapable — voir §8 de `CLAUDE.md`.

---


---

## 5 ter. Essayer l'encaissement iKeePay soi-même

Trois outils existent pour cela, et l'ordre compte.

```bash
npm run secrets:generer      # les valeurs qu'on ne choisit pas à la main
npm run ikeepay:verifier     # la configuration tient-elle ?
npm run ikeepay:repetition   # toute la chaîne, en mode réel, sans un franc
```

> ⚠ **iKeePay n'a pas de bac à sable pour l'encaissement.** Le seul sandbox
> documenté concerne les cartes (iKeeCard). Le premier essai chez eux est donc
> un **vrai débit sur un vrai numéro** — prenez le plus petit montant possible.

### La répétition générale — à faire d'abord

`npm run ikeepay:repetition` joue la chaîne complète en mode `ikeepay` sans
qu'un franc bouge : elle forge elle-même le rappel qu'iKeePay enverrait.

Elle prouve dix-neuf choses, dont les quatre qui comptent : que l'écran ne
porte plus aucune mention « mode test » ni aucun bouton de simulation ; que
l'adresse du tunnel porte le montant **recalculé par le serveur** ; qu'un
rappel authentique met les fonds sous séquestre ; et qu'un rappel **forgé** —
l'acheteur qui lit sa référence sur son propre lien de paiement — ne fait
avancer strictement rien.

Elle ne prouve pas qu'iKeePay envoie bien son rappel, ni qu'il a la forme
attendue. Cela ne se saura qu'au premier vrai paiement.

Elle **ne sort pas du poste**, et peut donc tourner avec vos vraies clefs sans
rien déclencher chez eux : le serveur ne les contacte jamais — `initiate()` ne
fait que bâtir une adresse, sans appel réseau — et l'appel que le navigateur
ferait vers leur tunnel est coupé par le script lui-même.

Éprouvée le 2 septembre 2026 avec les clefs de production : **19 contrôles sur
19**, sans qu'un franc bouge et sans une requête chez eux.

```bash
# dans .env.local
IKEEPAY_PUBLIC_KEY=pk_essai_local_factice
IKEEPAY_SECRET_KEY=sk_essai_local_factice
PAYMENT_MODE=ikeepay
```

Puis — et l'ordre n'est pas négociable, le mode est lu **à la construction** :

```
arrêter le serveur  →  npm run build  →  npx next start  →  npm run ikeepay:repetition
```

### Le vrai essai

Il exige une chose de plus, et c'est elle qui bloque :

> ⚠ **L'adresse de rappel doit être joignable depuis Internet.**

Sur `localhost`, iKeePay encaisse, poste son rappel dans le vide, et la
commande reste « en attente de paiement » indéfiniment : **le client est
débité, le vendeur ne voit rien**. Et comme iKeePay n'expose aucun point
d'entrée de consultation, `consulter()` renvoie `null` et le rattrapage ne peut
pas le réparer — il faut aller le lire à la main dans leur tableau de bord.

Il faut donc un déploiement (un aperçu Vercel suffit — `vercel deploy`, sans
`--prod`, avec `PAYMENT_MODE=ikeepay` sur l'environnement *Preview* seul, pour
que la production reste en mode test).

Ensuite, dans le tableau de bord iKeePay, déclarer l'adresse de rappel :

```
https://<votre-site>/api/paiements/rappel?jeton=<IKEEPAY_WEBHOOK_TOKEN>
```

`npm run ikeepay:verifier -- --avec-jeton` l'affiche en entier. Sans l'option,
le jeton est masqué : cette sortie finit dans un historique de terminal ou une
capture d'écran, et ce jeton est la **seule** chose qui distingue un rappel
authentique d'un rappel forgé — iKeePay ne signe pas les siens.

### Ce qui reste à leur demander

Trois choses, et les trois sont écrites dans `lib/payments/IkeePayProvider.ts` :

| Manque | Ce qu'il coûte |
|---|---|
| Une **signature** des rappels | Le jeton d'URL protège de l'acheteur — le scénario réel — mais pas d'un intermédiaire qui verrait passer l'adresse. |
| Un **point d'entrée de consultation** | Sans lui, un rappel perdu n'est pas rattrapable : le client est débité, la commande figée. |
| Un **sandbox d'encaissement** | Sans lui, le premier essai est un vrai débit. |

## 6. Ce que le déploiement ne fait PAS

- **Aucun argent ne circule.** `PAYMENT_MODE=test`. Le site est utilisable de
  bout en bout, mais chaque paiement est simulé (§1, §84).
- **Les migrations ne s'exécutent pas automatiquement.** Pour une migration
  future, depuis un poste :

  ```bash
  npm run supabase:migrer                  # dit ce qui manque, sans rien faire
  npm run supabase:migrer -- --appliquer   # applique
  npm run vercel:redeployer                # le code doit suivre le schéma
  ```

  **Et surtout pas `supabase:preparer`.** Il ne sert qu'à la mise en route : il
  REFUSE une base déjà peuplée, et son option `--ecraser` supprime le schéma
  public entier — donc toutes les données réelles. Ce document a longtemps
  recommandé l'inverse.

  Appliquer une migration sans redéployer laisse le code tourner contre un
  schéma qu'il ne connaît pas.
- **Aucun jeu de données n'est rejoué.** La base garde ce qu'elle a.

> **Les comptes de démonstration ont été supprimés de la base en ligne le
> 31 août 2026.** Leur mot de passe, `Password123!`, est publié dans ce dépôt —
> et l'un d'eux était **administrateur**.
>
> L'administrateur a été recréé avec un mot de passe tiré au sort, remis à
> l'utilisateur une seule fois. Si vous n'y avez plus accès, régénérez-le :
> supprimez la ligne et relancez `prisma/amorce.ts` avec un `ADMIN_PASSWORD`
> neuf.
>
> `npm run supabase:securiser` existe pour le cas où des comptes de
> démonstration se retrouveraient à nouveau en ligne : il tire un mot de passe
> au sort pour chacun plutôt que de les supprimer, et les dépose dans un
> fichier local ignoré par git.
