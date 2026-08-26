# Mettre KOLI en ligne

Marche à suivre pour déployer sur **Vercel**, avec **Supabase** pour la base et
le stockage des pièces justificatives.

Ce document est une liste de contrôle, pas un tutoriel : chaque point y figure
parce qu'il a une conséquence, et la conséquence est écrite à côté.

---

## 1. Avant de commencer — ce qui est déjà prêt

| | État |
|---|---|
| Base Supabase | schéma appliqué, jeu de données en place |
| Seau de stockage KYC | créé, **privé**, aller-retour vérifié |
| Construction | `npm run build` régénère le client Prisma et compile |
| Vérification | `npm run verif:tout` passe intégralement en local |

---

## 2. Le dépôt

Vercel se branche sur un dépôt Git (GitHub, GitLab, Bitbucket).

> **Le projet n'existe aujourd'hui que sur un seul portable.** Aucun dépôt
> distant. C'est un risque à traiter pour lui-même, indépendamment du
> déploiement : une panne de disque effacerait tout le travail.

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

## 6. Ce que le déploiement ne fait PAS

- **Aucun argent ne circule.** `PAYMENT_MODE=test`. Le site est utilisable de
  bout en bout, mais chaque paiement est simulé (§1, §84).
- **Les migrations ne s'exécutent pas automatiquement.** Le schéma est déjà
  appliqué sur Supabase. Pour une migration future :
  `npm run supabase:preparer -- --par-le-pooler` depuis un poste.
- **Le jeu de données de démonstration n'est pas rejoué.** Les comptes de
  démonstration présents en base restent tels quels.

> Les comptes de démonstration ont un mot de passe connu et publié dans ce
> dépôt (`Password123!`). Sur un site accessible publiquement, ils constituent
> une porte d'entrée — dont un compte **administrateur**. À supprimer ou à
> changer avant de communiquer l'adresse à qui que ce soit.
