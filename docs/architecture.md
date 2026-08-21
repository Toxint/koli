# KOLI — Document technique (Phase 0)

Produit conformément à `docs/koli-plan.md` §79 et §87 : architecture, arborescence, schéma de base de données, rôles/permissions, workflows, routes, composants principaux.

---

## ⚠️ Correctifs post-validation (19/08/2026)

Ce document a été validé, puis confronté au code réel. Quatre points ont dû être corrigés — ils sont signalés ici plutôt que réécrits en silence.

**1. Les groupes de routes ne posaient pas le problème que je craignais.**
J'avais annoncé que `(client)/`, `(seller)/`, `(driver)/`, `(admin)/` du §2 provoqueraient une collision d'URL. C'est faux dans la forme retenue : le motif utilisé est `app/(admin)/admin/…`, c'est-à-dire un groupe qui *contient* un vrai segment de même nom. Le groupe est transparent, le segment porte l'URL — aucune collision. Ma crainte n'était fondée que si le segment réel avait été omis.

**2. §5 — la machine à états mélangeait deux enums.**
Le tableau listait `ADMIN_REVIEW`, `SELLER_WINS` et `CUSTOMER_WINS` comme statuts de commande. Ils n'existent que dans `DisputeStatus` et vivent sur `Dispute.status`. Au niveau de la commande, la résolution d'un litige s'écrit `DISPUTE_OPEN → FUNDS_RELEASED` (vendeur) ou `DISPUTE_OPEN → REFUND_PENDING` (client). Corrigé dans `lib/orders/statusMachine.ts`, qui fait désormais foi.

**3. §9 annonçait le schéma Prisma en Phase 1.** Il relève de la Phase 2 (`koli-plan.md` §78).

**4. Modèle de libération des fonds — changement de fond (§29).**
Le code livré libérait les fonds au vendeur dès la saisie du code OTP par le livreur. Le §29 impose une confirmation de réception **par le client** avant toute libération, et c'est le cœur même de la proposition de valeur (§82, priorité n°3). Le modèle retenu est donc :

```
Livreur saisit l'OTP  →  commande DELIVERED   (le vendeur n'est PAS payé)
Client confirme       →  CUSTOMER_CONFIRMED → FUNDS_RELEASED
```

Second chemin possible, à construire en Phase 21 : la décision d'un administrateur sur un litige.

**Complément d'arborescence** : le §2 omettait `livraisons/` (liste) côté livreur, ainsi que `clients/`, `livreurs/`, `transactions/` et `profil/` côté admin, tous présents au §9 du cahier des charges.

**URLs** : les espaces sont en français — `/client`, `/vendeur`, `/livreur`, `/admin`.

---

## 0. État actuel du projet (avant Phase 0)

Le projet n'est pas vierge : un prototype du parcours "checkout client" existe déjà (`app/commande/[id]`, `components/OrderSummary.tsx`, `components/BuyerInfoForm.tsx`, `data/orders.ts`, `data/markets.ts`, `lib/format.ts`). Il couvre approximativement les §18 (étapes 3-4) et §20, mais :

- utilise un format d'ID (`CMD-001`) différent du format cible (`KOLI-000124`) ;
- affiche les montants en `"18 500 F"` au lieu de `"18 500 FCFA"` ;
- saute entièrement le paiement simulé (§21-23) : la confirmation du formulaire acheteur déclenche directement l'état "commande confirmée" ;
- n'a aucune persistance (données en dur dans `data/orders.ts`) ;
- le bouton "Annuler la commande" n'a pas de confirmation (§58) ;
- `next.config.ts` et `data/orders.ts` référencent un fichier `AGENTS.md` qui n'existe pas dans le dépôt.

**Décision proposée :** conserver ce code comme base visuelle (il est propre et déjà mobile-first), mais le réintégrer dans la nouvelle architecture au lieu de le garder isolé. Voir §7 « Traitement du code existant » plus bas. Rien ne sera modifié avant validation de ce document.

---

## 1. Stack technique

| Couche | Choix | Justification |
|---|---|---|
| Framework frontend | Next.js 16 (App Router), React 19, TypeScript | Déjà en place. |
| Backend | **Aucun framework séparé** — Route Handlers + Server Actions de Next.js | Un seul déploiement, un seul langage ; pas besoin d'un Express/NestJS distinct pour un MVP mono-repo. La séparation logique (routes publiques vs privées par rôle) se fait par dossiers, pas par service séparé. |
| Style | Tailwind CSS v4 (config CSS-first, pas de `tailwind.config.js`) | Déjà en place. |
| Base de données | SQLite en développement (fichier `prisma/dev.db`), schéma compatible PostgreSQL | Zéro configuration externe pour itérer vite ; bascule vers Postgres en Phase 29-30 en changeant simplement le `provider` du datasource. |
| ORM | Prisma | Migrations versionnées, typage généré, lisible pour un schéma à 20+ tables. |
| Authentification | Cookie de session signé (JWT via `jose`) + hash de mot de passe (`bcrypt`) + garde de rôle via `middleware.ts` | Plus simple qu'un framework auth à providers multiples pour un cas 100% "téléphone/email + mot de passe" avec 4 rôles maison ; réutilisable pour les futurs codes OTP. |
| Validation | Zod | Un seul schéma de validation réutilisé côté client et côté serveur (§47). |
| Tests | Vitest + React Testing Library | Couverture unitaire/composants (§71) ; Playwright pourra être ajouté en Phase 27 pour les scénarios bout-en-bout (§72-74). |
| Hébergement | Vercel | Intégration native avec Next.js (Server Actions, Route Handlers, Edge/Node), déploiement automatique depuis git, palier gratuit suffisant pour le MVP en mode test. |
| Base de données hébergée (Phase 29-30) | Neon ou Supabase (Postgres serverless) | Compatibles Vercel, palier gratuit, migration directe depuis le schéma Prisma déjà écrit pour Postgres. Pas nécessaire avant la Phase 29 — SQLite local suffit jusque-là. |
| Stockage des images | Vercel Blob | Photos produits (§16), preuves de livraison futures (§28), documents KYC (§37). Zéro compte supplémentaire si hébergé sur Vercel ; upgrade possible vers Cloudinary plus tard si des transformations d'image (recadrage, compression automatique) deviennent nécessaires. |
| Emails transactionnels | Resend | Réinitialisation de mot de passe, copie de facture. Secondaire dans ce cahier des charges (les communications client passent surtout par WhatsApp/in-app), donc à n'installer qu'en Phase 25 (Notifications), pas maintenant. |
| Structure API | Server Actions/Route Handlers internes dès maintenant ; `/api/v1/` externe réservée mais vide (§54) | Pas d'API publique à construire avant que KOLI Connect (Phase 32) soit à l'ordre du jour. |

Ces choix sont des propositions par défaut, pas des contraintes du cahier des charges — à ajuster si tu préfères un autre stack (ex. Postgres dès le départ, NextAuth, Cloudinary). Si l'implémentation effective se fait dans Antigravity plutôt qu'ici, ces choix ne coûtent rien à revoir : rien n'a encore été installé.

---

## 2. Arborescence cible du projet

```
koli-saas/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                    # Accueil (§59)
│   │   ├── comment-ca-marche/page.tsx  # §60
│   │   ├── pour-les-vendeurs/page.tsx  # §61
│   │   ├── aide/page.tsx
│   │   ├── conditions/page.tsx
│   │   ├── confidentialite/page.tsx
│   │   ├── connexion/page.tsx          # §62
│   │   └── inscription/page.tsx        # §63
│   │
│   ├── pay/[reference]/                # Lien de paiement public — remplace /commande/[id]
│   │   ├── page.tsx                    # Checkout (§20)
│   │   └── order-flow.tsx              # inclut désormais l'étape paiement simulé (§21-23)
│   │
│   ├── (client)/                       # protégé, rôle CLIENT
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── commandes/page.tsx
│   │   ├── commandes/[id]/page.tsx
│   │   ├── factures/page.tsx
│   │   ├── litiges/page.tsx
│   │   └── profil/page.tsx
│   │
│   ├── (seller)/                       # protégé, rôle SELLER
│   │   ├── layout.tsx                  # sidebar desktop / menu mobile (§10)
│   │   ├── dashboard/page.tsx          # §11-12
│   │   ├── commandes/…
│   │   ├── produits/…                  # §16-17
│   │   ├── clients/…
│   │   ├── livreurs/…
│   │   ├── transactions/page.tsx
│   │   ├── solde/page.tsx              # §42-43
│   │   ├── litiges/…
│   │   ├── parametres/page.tsx
│   │   └── profil/page.tsx
│   │
│   ├── (driver)/                       # protégé, rôle DRIVER
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx          # §24
│   │   ├── livraisons/[id]/page.tsx    # §25-27
│   │   ├── historique/page.tsx
│   │   └── profil/page.tsx
│   │
│   ├── (admin)/                        # protégé, rôle ADMIN
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx          # §34
│   │   ├── utilisateurs/…              # §35
│   │   ├── vendeurs/…                  # §36
│   │   ├── kyc/…                       # §37
│   │   ├── commandes/…
│   │   ├── paiements/…
│   │   ├── fonds/…
│   │   ├── litiges/…
│   │   ├── remboursements/…
│   │   ├── commissions/…
│   │   ├── logs/…
│   │   └── parametres/…
│   │
│   ├── api/v1/                         # réservé pour la future API externe (§54) — vide pour l'instant
│   ├── layout.tsx
│   └── globals.css
│
├── components/
│   ├── ui/                             # Button, Input, Card, Badge, EmptyState, ConfirmDialog, LoadingState
│   └── domain/                         # OrderSummary, BuyerInfoForm, StatusBadge, OtpInput, etc.
│
├── lib/
│   ├── auth/                           # session, hash, garde de rôle
│   ├── db/                             # client Prisma singleton
│   ├── orders/                         # création, machine à états, génération de référence KOLI-xxxxxx
│   ├── payments/                       # PaymentProvider (interface) + TestPaymentProvider
│   ├── deliveries/                     # logique livraison + OTP
│   ├── disputes/
│   ├── notifications/
│   ├── ledger/                         # écritures transactions/fonds
│   └── format.ts                       # existant — à corriger (suffixe FCFA)
│
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
│
├── docs/
│   ├── koli-plan.md                    # existant — document de référence
│   └── architecture.md                 # ce document
│
├── middleware.ts                       # garde d'accès par rôle sur les route groups protégés
└── (config existants inchangés)
```

**Séparation des rôles :** chaque route group protégé est vérifié par `middleware.ts`, qui lit le cookie de session, résout le rôle, et redirige toute requête vers un espace qui ne correspond pas à son rôle (§4 point 10, §71 « Permissions »).

---

## 3. Schéma de base de données (Prisma)

Couvre les 22 tables du §49 et les relations du §50.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite" // → "postgresql" en Phase 29-30, sans changer les modèles
  url      = env("DATABASE_URL")
}

// ── Enums ──────────────────────────────────────────────

enum UserRole { CLIENT SELLER DRIVER ADMIN }
enum UserStatus { ACTIVE SUSPENDED }
enum SellerVerificationStatus { PENDING VERIFIED REJECTED SUSPENDED }
enum KycStatus { PENDING VERIFIED REJECTED }

enum OrderStatus {
  DRAFT PAYMENT_PENDING PAYMENT_CONFIRMED FUNDS_SECURED SELLER_ACCEPTED
  PACKAGE_PREPARING READY_FOR_PICKUP PICKED_UP IN_TRANSIT ARRIVED DELIVERED
  CUSTOMER_CONFIRMED FUNDS_RELEASED COMPLETED
  CANCELLED PAYMENT_FAILED DELIVERY_FAILED DISPUTE_OPEN
  REFUND_PENDING REFUNDED RETURN_REQUESTED RETURNED
}

enum PaymentStatus { PENDING SUCCEEDED FAILED }
enum PaymentProviderType { TEST } // futurs providers réels ajoutés ici
enum TransactionType { PAYMENT COMMISSION FUNDS_SECURED FUNDS_RELEASED REFUND }
enum DeliveryStatus { ASSIGNED TO_PICK_UP PICKED_UP IN_TRANSIT ARRIVED TO_CONFIRM CONFIRMED FAILED }
enum DisputeReason { NOT_RECEIVED WRONG_PRODUCT DAMAGED INCOMPLETE NOT_AS_DESCRIBED OTHER }
enum DisputeStatus { OPEN ADMIN_REVIEW SELLER_WINS CUSTOMER_WINS }
enum RefundStatus { PENDING COMPLETED REJECTED }
enum NotificationType {
  PAYMENT_CONFIRMED FUNDS_SECURED ORDER_ACCEPTED PACKAGE_READY PICKED_UP
  IN_TRANSIT DELIVERED CUSTOMER_CONFIRMED FUNDS_RELEASED DISPUTE_OPEN REFUND
}

// ── Identité ────────────────────────────────────────────

model User {
  id           String   @id @default(cuid())
  role         UserRole
  name         String
  phone        String   @unique
  email        String?  @unique
  passwordHash String
  photoUrl     String?
  status       UserStatus @default(ACTIVE)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  sellerProfile   SellerProfile?
  customerProfile CustomerProfile?
  driverProfile   DriverProfile?
  notifications   Notification[]
  auditLogs       AuditLog[] @relation("AuditActor")
}

model SellerProfile {
  id                     String   @id @default(cuid())
  userId                 String   @unique
  user                   User     @relation(fields: [userId], references: [id])
  businessName           String?
  verificationStatus     SellerVerificationStatus @default(PENDING)
  commissionRateOverride Float?
  createdAt              DateTime @default(now())

  products Product[]
  orders   Order[]
  kyc      KycDocument[]
}

model CustomerProfile {
  id      String  @id @default(cuid())
  userId  String  @unique
  user    User    @relation(fields: [userId], references: [id])
  address String?
  city    String?
  country String?

  orders Order[]
}

model DriverProfile {
  id      String @id @default(cuid())
  userId  String @unique
  user    User   @relation(fields: [userId], references: [id])
  vehicle String?

  deliveries Delivery[]
}

// ── Catalogue ───────────────────────────────────────────

model Product {
  id          String   @id @default(cuid())
  sellerId    String
  seller      SellerProfile @relation(fields: [sellerId], references: [id])
  name        String
  description String?
  category    String?
  price       Int      // FCFA — entier, pas de centimes
  quantity    Int      @default(0)
  weightKg    Float?
  status      String   @default("ACTIVE")
  createdAt   DateTime @default(now())

  images     ProductImage[]
  orderItems OrderItem[]
}

model ProductImage {
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id])
  url       String
  position  Int     @default(0)
}

// ── Commandes ───────────────────────────────────────────

model Order {
  id         String   @id @default(cuid())
  reference  String   @unique // "KOLI-000124"
  sellerId   String
  seller     SellerProfile @relation(fields: [sellerId], references: [id])
  customerId String?
  customer   CustomerProfile? @relation(fields: [customerId], references: [id])

  buyerName     String
  buyerPhone    String
  buyerCountry  String
  buyerCity     String
  buyerAddress  String
  buyerLandmark String?

  deliveryFee Int      @default(0)
  status      OrderStatus @default(DRAFT)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  items         OrderItem[]
  payment       Payment?
  delivery      Delivery?
  dispute       Dispute?
  refund        Refund?
  transactions  Transaction[]
  invoice       Invoice?
  statusHistory OrderStatusHistory[]
  fund          Fund?
}

model OrderItem {
  id        String  @id @default(cuid())
  orderId   String
  order     Order   @relation(fields: [orderId], references: [id])
  productId String
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int
  unitPrice Int
}

model OrderStatusHistory {
  id          String   @id @default(cuid())
  orderId     String
  order       Order    @relation(fields: [orderId], references: [id])
  fromStatus  OrderStatus?
  toStatus    OrderStatus
  actorUserId String?
  createdAt   DateTime @default(now())
}

// ── Paiement / argent (mode test) ──────────────────────

model Payment {
  id               String   @id @default(cuid())
  orderId          String   @unique
  order            Order    @relation(fields: [orderId], references: [id])
  provider         PaymentProviderType @default(TEST)
  status           PaymentStatus @default(PENDING)
  amount           Int
  simulatedOutcome String?  // "SUCCESS" | "FAILURE", mode test uniquement
  createdAt        DateTime @default(now())
  confirmedAt      DateTime?
}

model Transaction {
  id        String   @id @default(cuid())
  orderId   String
  order     Order    @relation(fields: [orderId], references: [id])
  type      TransactionType
  amount    Int      // signé : + crédit / - débit
  createdAt DateTime @default(now())
}

model Fund {
  id         String   @id @default(cuid())
  orderId    String   @unique
  order      Order    @relation(fields: [orderId], references: [id])
  sellerId   String
  amount     Int
  secured    Boolean  @default(false)
  released   Boolean  @default(false)
  securedAt  DateTime?
  releasedAt DateTime?
}

model Refund {
  id          String   @id @default(cuid())
  orderId     String   @unique
  order       Order    @relation(fields: [orderId], references: [id])
  amount      Int
  status      RefundStatus @default(PENDING)
  reason      String?
  createdAt   DateTime @default(now())
  processedAt DateTime?
}

model Invoice {
  id        String   @id @default(cuid())
  orderId   String   @unique
  order     Order    @relation(fields: [orderId], references: [id])
  number    String   @unique
  createdAt DateTime @default(now())
}

model Commission {
  id          String   @id @default(cuid())
  ratePercent Float    @default(5)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
}

// ── Livraison ───────────────────────────────────────────

model Delivery {
  id          String   @id @default(cuid())
  orderId     String   @unique
  order       Order    @relation(fields: [orderId], references: [id])
  driverId    String?
  driver      DriverProfile? @relation(fields: [driverId], references: [id])
  status      DeliveryStatus @default(ASSIGNED)
  assignedAt  DateTime @default(now())
  pickedUpAt  DateTime?
  arrivedAt   DateTime?
  deliveredAt DateTime?

  proof    DeliveryProof?
  otpCodes OtpCode[]
}

model DeliveryProof {
  id           String   @id @default(cuid())
  deliveryId   String   @unique
  delivery     Delivery @relation(fields: [deliveryId], references: [id])
  otpCode      String
  confirmedAt  DateTime @default(now())
  signatureUrl String?  // préparé pour plus tard (§28)
  photoUrl     String?  // préparé pour plus tard
  latitude     Float?   // préparé pour plus tard
  longitude    Float?   // préparé pour plus tard
}

model OtpCode {
  id          String   @id @default(cuid())
  deliveryId  String
  delivery    Delivery @relation(fields: [deliveryId], references: [id])
  code        String
  attempts    Int      @default(0)
  maxAttempts Int      @default(5)
  consumedAt  DateTime?
  createdAt   DateTime @default(now())
}

// ── Litiges ─────────────────────────────────────────────

model Dispute {
  id          String   @id @default(cuid())
  orderId     String   @unique
  order       Order    @relation(fields: [orderId], references: [id])
  reason      DisputeReason
  description String?
  status      DisputeStatus @default(OPEN)
  decision    String?
  createdAt   DateTime @default(now())
  resolvedAt  DateTime?

  messages DisputeMessage[]
}

model DisputeMessage {
  id            String   @id @default(cuid())
  disputeId     String
  dispute       Dispute  @relation(fields: [disputeId], references: [id])
  authorUserId  String
  body          String?
  attachmentUrl String?
  createdAt     DateTime @default(now())
}

// ── Notifications / audit / conformité ─────────────────

model Notification {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  type       NotificationType
  readAt     DateTime?
  entityType String?
  entityId   String?
  createdAt  DateTime @default(now())
}

model AuditLog {
  id          String   @id @default(cuid())
  actorUserId String?
  actor       User?    @relation("AuditActor", fields: [actorUserId], references: [id])
  action      String   // ex. "FUNDS_RELEASE_TEST"
  entityType  String
  entityId    String
  metadata    String?  // JSON sérialisé
  createdAt   DateTime @default(now())
}

model KycDocument {
  id        String   @id @default(cuid())
  sellerId  String
  seller    SellerProfile @relation(fields: [sellerId], references: [id])
  type      String
  fileUrl   String
  status    KycStatus @default(PENDING)
  createdAt DateTime @default(now())
}

model Setting {
  key   String @id
  value String // JSON sérialisé (taux de commission, feature flags…)
}
```

---

## 4. Rôles et permissions

| Rôle | Espace | Accès interdit |
|---|---|---|
| `CLIENT` | `(client)/*`, `/pay/[reference]` | Aucun accès à `(seller)`, `(driver)`, `(admin)` |
| `SELLER` | `(seller)/*` | Aucun accès à `(admin)` ; ne voit que ses propres commandes/produits |
| `DRIVER` | `(driver)/*` | Aucun accès aux données financières (montants, commissions, fonds) — uniquement infos de livraison (§25) |
| `ADMIN` | `(admin)/*` + lecture globale | — |

Appliqué à deux niveaux : `middleware.ts` (garde de route par rôle) **et** vérification serveur dans chaque action/route API (§47 : « Ne jamais faire confiance uniquement au frontend »).

---

## 5. Machine à états des commandes

Transitions autorisées uniquement (§15) :

```
DRAFT → PAYMENT_PENDING
PAYMENT_PENDING → PAYMENT_CONFIRMED | PAYMENT_FAILED
PAYMENT_CONFIRMED → FUNDS_SECURED
FUNDS_SECURED → SELLER_ACCEPTED | CANCELLED
SELLER_ACCEPTED → PACKAGE_PREPARING
PACKAGE_PREPARING → READY_FOR_PICKUP
READY_FOR_PICKUP → PICKED_UP
PICKED_UP → IN_TRANSIT
IN_TRANSIT → ARRIVED | DELIVERY_FAILED
ARRIVED → DELIVERED
DELIVERED → CUSTOMER_CONFIRMED | DISPUTE_OPEN | RETURN_REQUESTED
CUSTOMER_CONFIRMED → FUNDS_RELEASED
FUNDS_RELEASED → COMPLETED
DISPUTE_OPEN → FUNDS_RELEASED (décision admin : vendeur) | REFUND_PENDING (décision admin : client)
REFUND_PENDING → REFUNDED
```

`ADMIN_REVIEW`, `SELLER_WINS` et `CUSTOMER_WINS` **ne sont pas** des statuts de commande : ils appartiennent à `DisputeStatus` et vivent sur `Dispute.status` (voir correctif n°2 en tête de document).

Toute tentative de transition hors de cette table est rejetée côté serveur (`lib/orders/statusMachine.ts`, qui fait foi). Tant qu'un litige est ouvert, seule une décision d'administrateur peut mener à `FUNDS_RELEASED` (§33) — la confirmation client est refusée dans cet état.

---

## 6. Architecture financière (abstraction paiement)

```ts
// lib/payments/PaymentProvider.ts
export interface PaymentProvider {
  initiate(orderId: string, amount: number): Promise<{ paymentId: string }>;
  confirm(paymentId: string): Promise<{ status: "SUCCEEDED" | "FAILED" }>;
}

// lib/payments/TestPaymentProvider.ts — mode MVP
export class TestPaymentProvider implements PaymentProvider {
  // "confirm" ici est piloté par le choix explicite de l'utilisateur
  // ("Simuler un paiement réussi" / "Simuler un paiement échoué"), jamais aléatoire.
}

// Plus tard : lib/payments/RealPaymentProvider.ts implémentera la même interface.
```

La logique métier KOLI (statuts, fonds, commissions, notifications) ne dépend que de l'interface `PaymentProvider`, jamais d'un fournisseur concret — remplaçable sans réécriture (§51, §83).

---

## 7. Traitement du code existant

| Fichier existant | Action proposée |
|---|---|
| `app/commande/[id]/*` | Déplacer vers `app/pay/[reference]/*` (URL publique conforme à §19) |
| `components/OrderSummary.tsx`, `BuyerInfoForm.tsx` | Conserver, déplacer dans `components/domain/`, brancher sur le vrai modèle `Order` (Prisma) au lieu de `data/orders.ts` |
| `data/orders.ts`, `data/markets.ts` | `orders.ts` remplacé par la base de données (Phase 2) ; `markets.ts` conservé tel quel comme donnée statique de référence (marchés desservis) |
| `lib/format.ts` | Corriger `formatCFA` pour afficher `"FCFA"` au lieu de `"F"`, conserver `isValidLocalPhone` |
| `order-flow.tsx` | Insérer l'étape de paiement simulé (§21-23) entre la confirmation du formulaire acheteur et l'état "commande confirmée" ; ajouter une confirmation avant "Annuler la commande" (§58) |

✅ Fait : le PDF source est déplacé dans `docs/` ; les références à `AGENTS.md` dans `next.config.ts` et `data/orders.ts` pointent maintenant vers `docs/koli-plan.md`/`docs/architecture.md` (pas de fichier `AGENTS.md` séparé). Le reste du tableau ci-dessus n'est pas encore exécuté — en attente du feu vert Phase 1.

---

## 8. Contradictions et zones grises identifiées dans le cahier des charges

Relecture complète de `docs/koli-plan.md` demandée — voici ce qui n'est pas explicitement tranché par le document, avec la résolution que je propose pour chaque point (à corriger si tu vois les choses différemment) :

| # | Zone grise | Ce que dit le document | Résolution proposée |
|---|---|---|---|
| 1 | **Compte client obligatoire ou non pour payer** | §20-23 (checkout) ne mentionnent aucune connexion ; §5.1 et §62-63 supposent un compte client avec historique | **Achat possible sans compte** (le lien de paiement fait office d'accès à la commande) ; un compte client est optionnel et sert uniquement à regrouper l'historique de plusieurs commandes. `Order.customerId` est donc nullable dans le schéma (§3). |
| 2 | **Livreur : auto-inscription vs créé par le vendeur** | §63 permet un self-signup "Je suis livreur" ; §5.3 dit "chaque vendeur peut utiliser son propre livreur" | Les deux coexistent : un livreur peut créer son propre compte, mais n'est **assigné** à une livraison que par un vendeur (§26), commande par commande. Pas de lien exclusif livreur↔vendeur dans le schéma — l'assignation se fait via `Delivery.driverId`, pas via une propriété du compte livreur. |
| 3 | **Remboursement en dehors d'un litige formel** | §58 liste "Rembourser" et "Annuler commande" comme actions admin séparées, mais le seul chemin de remboursement détaillé (§32-33) passe par `DISPUTE_OPEN → ADMIN_REVIEW → CUSTOMER_WINS` | Une commande annulée **après** sécurisation des fonds (`FUNDS_SECURED → CANCELLED`) doit elle aussi déclencher un remboursement simulé automatique — pas besoin d'ouvrir un litige formel pour ça. Un litige reste le seul chemin si l'annulation intervient après livraison. |
| 4 | **Devise unique "FCFA" mais deux zones monétaires réelles** | Les 7 marchés déjà présents dans `data/markets.ts` (Côte d'Ivoire, Sénégal, Cameroun, Bénin, Togo, Mali, Burkina Faso) sont à cheval sur deux zones : XOF (Afrique de l'Ouest, UEMOA) et XAF (Afrique Centrale, CEMAC — le cas du Cameroun). Le cahier des charges parle uniquement de "FCFA" sans distinguer | Garder l'affichage "FCFA" pour l'utilisateur (c'est l'usage local, correct dans les deux zones), mais stocker un code devise explicite (`XOF`/`XAF`) par commande en interne, dérivé du pays du vendeur — pour éviter un mélange silencieux des deux zones si un vrai partenaire de paiement est branché plus tard. |
| 5 | **Canal de livraison du code OTP** | §27 dit seulement "le client reçoit le code", sans préciser le canal (SMS ? in-app ?) | En mode test, aucune intégration SMS réelle n'est prévue avant la Phase 31 — le code OTP sera simplement affiché dans le suivi de commande du client (dashboard ou page liée au lien de paiement). À revoir dès qu'un partenaire SMS/Mobile Money réel est choisi. |
| 6 | **Numérotation de facture** | §38 ne précise pas si la facture a un numéro propre ou reprend la référence de commande | Simplification proposée : la facture reprend directement la référence de commande (`KOLI-000124`) comme identifiant visible, sans numérotation séparée — un champ `Invoice.number` distinct reste dans le schéma au cas où une numérotation comptable dédiée serait exigée plus tard (ex. suivi fiscal). |
| 7 | **`SUSPENDED` : statut de compte ou statut de vérification vendeur ?** | §35 (admin peut "suspendre" un utilisateur) et §36 (`SUSPENDED` fait partie des statuts de vérification vendeur) semblent désigner deux choses différentes sous le même mot | Séparés dans le schéma en deux champs distincts : `User.status` (`ACTIVE`/`SUSPENDED` — accès à la plateforme) et `SellerProfile.verificationStatus` (`PENDING`/`VERIFIED`/`REJECTED`/`SUSPENDED` — droit de vendre). Un vendeur peut donc être "vérifié" mais avoir son compte utilisateur suspendu, ou l'inverse. |

Aucun de ces points ne bloque le démarrage — ce sont des interprétations raisonnables déjà reflétées dans le schéma du §3. Dis-moi si l'une d'elles ne correspond pas à ce que tu avais en tête.

---

## 8 bis. Audit du 20/08/2026 — failles corrigées

Un audit de sécurité et un audit mobile ont été menés sur le code livré. Trois défauts majeurs, non détectés lors des passes précédentes :

**1. Le vendeur pouvait libérer ses propres fonds.** `confirmReceptionAction` se contentait de la possession de la référence comme autorisation. Or la référence est exactement ce que le vendeur partage (bouton « Partager le lien ») et ce que le livreur lit sur sa fiche. Le vendeur pouvait donc ouvrir son propre lien de paiement, cliquer « Oui, j'ai reçu ma commande », et déclencher son propre versement. Le livreur pouvait même fabriquer la condition : valider l'OTP, puis s'auto-confirmer. **La garantie centrale de KOLI ne reposait sur rien.** Corrigé : session client obligatoire et rattachée à la commande, vendeur explicitement refusé.

> Leçon retenue : le modèle « la possession du lien fait capacité » est valable pour *payer* (seul le payeur y a intérêt), jamais pour *libérer* (deux des trois détenteurs du lien sont les bénéficiaires).

**2. Le code de réception n'était affiché à personne.** Généré, stocké, correctement masqué au livreur — mais jamais montré au client. Le scénario complet du §72 était donc infaisable. Affiché désormais sur `/pay/<référence>`, au seul client authentifié.

**3. Le livreur pouvait « livrer » une commande impayée.** Aucune vérification que les fonds étaient séquestrés ; l'historique enregistrait alors des étapes de paiement jamais survenues (§48).

Également corrigé : le tableau de bord admin comptait les fonds déjà versés comme encore séquestrés ; le montant de la commande était exposé au livreur (contraire au §25) ; la devise était figée à `XOF` alors que le Cameroun est en zone `XAF` (champ `Order.currency` ajouté) ; le paiement du client n'était inscrit à aucune écriture comptable (§40) ; la commande n'atteignait jamais `COMPLETED` (§29).

**Conformité mobile.** 90 % des utilisateurs visés sont sur téléphone. L'audit a relevé 20 défauts, dont : aucune navigation dans les espaces connectés (§10), deux tableaux à 5 colonnes débordant de plus du double de la largeur d'écran (§8), une modale OTP que le clavier du téléphone rendait inutilisable, un correctif iOS placé dans `@layer base` donc **inopérant** (les couches priment sur la spécificité), et le mode sombre rendant l'adresse de livraison invisible.

Un harnais de vérification automatisé (`scripts/check-responsive.mjs`, Playwright) parcourt désormais chaque écran en 320/375/414/768/1024/1440 px et contrôle débordement horizontal, cibles tactiles et taille des champs — exigence §74. Il fait autorité sur ce point : **aucun problème détecté**.

---

## 8 ter. Identité visuelle

> **Révisée le 21/08/2026** — voir §8 septies. Le vert et le fond blanc décrits ci-dessous ont été remplacés par la crème, le bordeaux et l'or. Les enseignements sur le contraste et la typographie restent valables et ont été reportés.

Fond blanc, **vert KOLI** (`#047857`) sur les titres, les textes importants et les appels à l'action ; encre neutre profonde pour le texte courant. Un vert appliqué partout ne signalerait plus rien : il ne ressort que parce que le reste ne l'est pas.

Une version entièrement dorée a été essayée puis écartée : l'or pur (`#FFD700`) sur blanc ne donne que **1,4:1** de contraste contre 4,5:1 exigés — illisible sur un téléphone en plein soleil, situation quotidienne du public visé. L'or est conservé, cantonné à son rôle d'alerte : l'indicateur de mode test.

**Typographie** — aucune police n'était définie (pile système par défaut, d'où un rendu générique). **Plus Jakarta Sans**, dessinée pour les interfaces, limitée à 4 graisses avec `display: swap` pour ne pas pénaliser les réseaux mobiles lents (§70). Les graisses extrêmes (`font-black` 900, `font-extrabold` 800) sont plafonnées à 700 : à l'écran, une graisse extrême écrase la hiérarchie au lieu de la créer. C'est la couleur qui porte l'importance.

**Piège Tailwind v4 rencontré deux fois, noté dans `globals.css`** : les couches sont résolues *avant* la spécificité. Une règle hors couche l'emporte sur tout — voulu pour la taille des champs (invariant), néfaste pour la couleur des titres (valeur par défaut qu'un `text-white` doit pouvoir surcharger). Les invariants vont hors couche, les défauts dans `@layer base`.

---

## 8 quater. Phase 15 — assignation du livreur (20/08/2026)

`lib/deliveries/assign.ts` : le vendeur choisit un livreur pour une commande payée (§26, §57). Sans cette étape, **aucune commande créée par l'interface n'atteignait un livreur** — le parcours s'arrêtait au paiement.

Garde-fous : rôle vendeur, propriété de la commande, fonds effectivement séquestrés, livraison non déjà confirmée, livreur actif. L'assignation fait passer la commande de `FUNDS_SECURED` à `SELLER_ACCEPTED`.

L'enum `DeliveryStatus` gagne l'état **`UNASSIGNED`** qui lui manquait : une livraison sans livreur était marquée `ASSIGNED`, ce qui était faux.

**Vérification de bout en bout** — `scripts/test-parcours-complet.mjs` pilote un vrai navigateur à travers les quatre rôles et rejoue le scénario du §72 : création → paiement → assignation → OTP → confirmation → libération. Il contrôle aussi les garanties de sécurité (le vendeur ne voit pas le code et ne peut pas confirmer à la place du client ; la backdoor « 1234 » reste fermée). **17/17.**

---

## 9. État réel au 20/08/2026

### Implémenté et sécurisé

| Domaine | État |
|---|---|
| Schéma de données | Complet — les 22 tables du §49, montants entiers FCFA, escrow en table `Fund` de premier ordre |
| Authentification | Session JWT en cookie httpOnly, mots de passe bcrypt, garde de rôle dans `middleware.ts` + vérification serveur dans chaque action |
| Machine à états | `lib/orders/statusMachine.ts` — transitions autorisées, chemins multi-sauts, états terminaux |
| Abstraction paiement | `PaymentProvider` / `TestPaymentProvider`, sélection unique via `lib/config/mode.ts` |
| Garde MODE TEST | Toute valeur de `PAYMENT_MODE` autre que `test` fait échouer l'application |
| Idempotence | Paiement, validation OTP et libération des fonds : écritures conditionnelles, aucune double opération |
| Parcours complet | Création commande → lien de paiement → paiement simulé → fonds sécurisés → OTP livreur → confirmation client → fonds libérés |
| Preuve de livraison | `DeliveryProof` (OTP, date, commande) ; signature / photo / géolocalisation prévues plus tard |

### Tables existantes mais encore vides (par choix, phases à venir)

`Dispute`, `DisputeMessage` (Phase 21) · `Refund` (Phase 22) · `Invoice` (Phase 20) · `Notification` (Phase 25) · `AuditLog` (Phase 26) · `KycDocument` (Phase 24) · `Commission` — la table est alimentée, mais aucun prélèvement n'est calculé (Phase 19).

## 8 quinquies. Complétion fonctionnelle (20/08/2026)

- **§47 — limitation des tentatives de connexion.** Elle existait pour l'OTP mais pas pour le mot de passe : le compte acceptait un nombre illimité d'essais. 5 tentatives, puis blocage 15 minutes (`User.failedLoginAttempts`, `User.lockedUntil`). Ajout d'une vérification factice quand l'identifiant est inconnu : sans elle, la différence de temps de réponse révélait quels comptes existent.
- **§42-43 — page « Solde vendeur »** (`/vendeur/solde`) : fonds sécurisés, solde disponible, total gagné, historique des mouvements, et l'interface « Retirer mes fonds » désactivée avec la mention exigée par le §43.
- **§64 — pages de profil** pour les quatre rôles, avec changement de mot de passe protégé par le mot de passe actuel. Le téléphone reste non modifiable : il identifie le compte et rattache les commandes passées en mode invité — le changer exigerait de vérifier le nouveau numéro par SMS (phase 31).
- **§46 — recherche, filtre et pagination** sur les commandes vendeur et les utilisateurs admin. L'état vit dans l'URL (partageable, résistant au rafraîchissement) et le filtrage s'effectue **en base**, pas sur une liste déjà chargée.
- **§35 — page admin « Utilisateurs »** avec suspension et réactivation, confirmation préalable (§58). Un administrateur ne peut pas se suspendre lui-même : ce serait le seul moyen de se verrouiller définitivement hors de la plateforme.
- **§10 — navigation centralisée** dans `lib/navigation.ts`. Règle stricte : uniquement des routes existantes, un lien mort étant pire que pas de lien. La barre horizontale bascule à 1024px et non 768px — à cinq entrées, elle débordait sur tablette.

---

### Écarts au cahier des charges, non encore traités

- **§58 — confirmation avant action destructrice** : faite pour la suspension de compte, à généraliser aux autres actions sensibles quand elles existeront.
- **§18 — le formulaire de commande est d'un seul tenant** au lieu des 5 étapes prévues.
- **§34, §36 — le tableau de bord admin reste partiel** : paiements, litiges, remboursements, commissions et activités récentes manquent ; la page de vérification des vendeurs n'existe pas.
- **§28 — les preuves de livraison sont écrites mais jamais affichées.**
- **§62 — pas de lien « Mot de passe oublié ? »** : la réinitialisation exige un canal de contact vérifié (SMS ou e-mail), donc les phases 25 et 31.
- **Intégrité** : `Fund.sellerId` est une chaîne sans clé étrangère ; aucun index sur les colonnes de jointure ; le total de commande est recalculé en six endroits au lieu d'être lu depuis `Payment.amount` ; aucune politique d'arrondi n'est définie pour la future commission (§41).
- ~~`prisma/seed.ts` produit une référence `KOLI-000124`~~ — **corrigé** le 20/08/2026, voir §8 sexies.
- **§17 — pas de restitution de stock.** Le décompte a lieu au paiement ; une commande annulée ou remboursée ne remet rien en rayon, faute de parcours d'annulation (phases 21-22).
- **§16 — l'envoi de photos depuis le téléphone n'existe pas.** Le catalogue accepte l'adresse d'une image déjà en ligne ; le téléversement attend la configuration d'un espace de stockage.

### Manques connus, à traiter dans leur phase

- **Navigation (§10)** — il n'existe aucune sidebar ni menu mobile. La navigation se réduit à un en-tête avec logo, badge de rôle et déconnexion. À construire quand il y aura des pages à desservir (Phase 5 revisitée).
- **Jalons du livreur (§26)** — les étapes intermédiaires (colis récupéré, en transit, arrivé) n'ont pas d'interface. La validation OTP franchit le chemin d'un bloc, chaque saut restant une transition légale et journalisée. À remplacer par de vraies actions en Phase 15, avec un état « non assignée » à ajouter à l'enum `DeliveryStatus`.
- ~~Assignation du livreur (§26)~~ — **fait** le 20/08/2026, voir §8 quater.
- **Tableaux sur mobile (§8)** — défilement horizontal au lieu d'une conversion en cartes (Phase 28).
- **Breakpoint tablette** — seuls `sm:` et `lg:` sont utilisés ; `md:` (768px, §7) est inexploité (Phase 28).
- **`/pay/<référence>` inexistante** renvoie une page « Commande introuvable » avec un statut HTTP 200 plutôt qu'un 404.
- **Convention Next.js** — Next 16 signale que `middleware.ts` est déprécié au profit de `proxy.ts`. Migration à planifier.
- **Migrations Prisma** — la base est construite via `db push`, sans dossier `prisma/migrations/`. À mettre en place avant tout déploiement partagé.

### Vérifications en place

`npm run typecheck` · `npm run lint` · `npm test` (64 tests) · `npm run build` — tous propres. Les tests couvrent la machine à états, la génération des références, le catalogue produits, et les garde-fous de sécurité des actions serveur (autorisation, propriété, idempotence, plafond de tentatives OTP, portée de la libération d'escrow).

`npm run verif:tout` enchaîne en plus les vérifications en navigateur réel : responsive (§74), liens cliquables, connexion, inscription, catalogue et parcours complet à quatre rôles.

**Règle d'exécution** : ces vérifications se lancent depuis l'**adresse réseau** (`BASE_URL=http://<ip>:3000`), jamais depuis `localhost` seul. Les navigateurs traitent `localhost` comme une origine de confiance, ce qui masque toute une classe de défauts — c'est ainsi que le cookie `secure` avait rendu la connexion impossible depuis un téléphone sans qu'aucun test ne le voie.

## 8 sexies. Phase 6 — Catalogue produits (20/08/2026)

Le vendeur retapait le nom de son article à chaque commande. `createOrderAction` cherchait alors un produit par **égalité de nom** et en créait un à la volée sinon : deux orthographes donnaient deux fiches, le prix du catalogue n'était jamais consulté, et le stock était inventé à 100 unités.

**Ce qui a été construit** — `lib/products/actions.ts`, `/vendeur/produits` (liste, recherche, pagination), `/vendeur/produits/nouveau`, `/vendeur/produits/[id]`.

**Décisions qui méritent d'être justifiées :**

- **Le prix du catalogue fait foi.** Quand le vendeur choisit un produit du catalogue, `unitPrice` envoyé par le formulaire est ignoré au profit de `product.price`, et le champ passe en lecture seule. Sans cela, un lien de paiement pouvait partir sur un montant fabriqué côté client.
- **Le prix est figé à la commande.** `OrderItem.unitPrice` conserve le prix appliqué : modifier le catalogue plus tard ne réécrit pas le montant d'une vente déjà conclue.
- **On archive, on ne supprime pas.** Un produit est référencé par des commandes passées ; l'effacer réécrirait l'historique. `status` bascule `ACTIVE` / `ARCHIVED`, avec confirmation (§58).
- **Le stock est décompté au paiement, pas à la création.** En mode test, la plupart des liens ne sont jamais réglés ; décompter à la création aurait fait fondre l'inventaire à chaque abandon. Le décompte utilise un `updateMany` conditionné par `quantity >= n`, de sorte que deux paiements simultanés sur le dernier article ne peuvent pas passer le stock sous zéro.
- **La saisie libre reste possible** pour l'article ponctuel, mais crée désormais une vraie fiche à stock **nul** — rien ne justifiait d'inventer un inventaire.
- **`prisma/seed.ts`** génère sa référence avec `generateOrderReference()`, comme en production. Les images de démonstration ont été retirées : elles pointaient vers des fichiers absents de `public/` et s'affichaient cassées dans le catalogue.

**Défaut de responsive découvert à cette occasion** — un `<select>` réclame la largeur de sa plus longue option. Celle du sélecteur de livreur (« Kouassi Express — Moto YBR 125 - Immatriculation AB-123-CI ») imposait 448px et poussait toute la page des commandes en débordement horizontal sur un écran de 320px. Le défaut était **latent** : la commande du seed avait déjà un livreur assigné, si bien que le sélecteur ne s'affichait jamais. Corrigé par `min-w-0` sur le `<select>` et `items-stretch` sous `sm:` sur les lignes de liste — `items-start` dimensionne chaque colonne sur son contenu maximal.

### Point de reprise

Phase 6 (catalogue), §34-36 (console d'administration) et la refonte visuelle (§8 septies) sont terminées. La suite reprend la discipline phase par phase de `koli-plan.md` §78. Prochaine cible recommandée : **§18 — assistant de commande en 5 étapes**, puis **§28 — affichage des preuves de livraison**. Aucune phase ne démarre sans validation explicite.

---

## 8 septies. Refonte visuelle — crème, bordeaux, or (21/08/2026)

Sur la base d'un tableau de bord fourni en référence par le porteur du projet, l'identité passe du vert sur blanc à un **fond crème, un menu latéral bordeaux profond et des accents or**.

### La crème est une couleur, pas un blanc sali

`--color-cream: #FBF7E9`. C'est le point le plus facile à perdre lors d'une reprise : le fond **n'est pas blanc**. Deux raisons, dans cet ordre :

1. **Le relief de l'interface en dépend.** Les cartes sont blanches ; elles ne se détachent que parce que le fond ne l'est pas. Remettre `#FFFFFF` en fond fait disparaître toute la structure visuelle d'un coup — les cartes deviennent invisibles et il ne reste que des filets.
2. **Le confort de lecture.** Le blanc pur éblouit sur un écran de téléphone en plein soleil ; la crème garde la clarté sans la brûlure.

Le fond est posé à trois endroits pour qu'aucun ne puisse le contredire seul : `html`, `body` (règle non layerée dans `globals.css`) et la classe `bg-cream` du `<body>` dans `app/layout.tsx`.

### Palette

| Jeton | Valeur | Rôle | Contraste sur crème |
|---|---|---|---|
| `--color-brand` | `#4A0F30` | titres, texte important, CTA | 12,9:1 ✓ |
| `--color-brand-strong` | `#300A20` | survol, emphase, `h1` | 15,7:1 ✓ |
| `--color-brand-accent` | `#7B2350` | boutons secondaires, focus | 9,0:1 ✓ |
| `--color-menu` / `--color-menu-deep` | `#3E0C28` / `#2B0619` | dégradé du menu latéral | — |
| `--color-gold` | `#E0A82E` | aplats, pastilles, accents **du menu** | 2,0:1 ✗ |
| `--color-gold-deep` | `#8A6110` | seul or lisible en texte sur clair | 5,0:1 ✓ |
| `--color-ink` / `--color-ink-muted` | `#241C22` / `#6A6055` | texte courant / secondaire | 15,8:1 / 5,7:1 ✓ |

**L'or ne se lit pas sur clair.** `#E0A82E` sur crème donne 2,0:1, très loin des 4,5:1 exigés. Il est donc réservé aux **aplats** et au texte posé **sur le bordeaux**, où il atteint 7,0:1 — c'est ce qui en fait l'accent naturel du menu latéral. Pour un or lisible sur fond clair, `--color-gold-deep`.

**Les couleurs de statut restent sémantiques** (`lib/orders/statusLabels.ts`) : vert pour ce qui est acquis, ambre pour ce qui est en cours, rouge pour ce qui alerte. Les aligner sur le bordeaux de la marque supprimerait l'information que porte la couleur. Seul le ton neutre a été réchauffé, un gris bleuté jurant sur la crème.

### Menu latéral (§10)

`components/ui/DashboardNav.tsx` — le composant garde son nom et ses props bien qu'il ne soit plus un en-tête horizontal : les quinze pages qui l'utilisent n'ont eu à changer que la classe de leur conteneur.

- **≥ 1024px** : panneau flottant fixe à gauche, `15.5rem`, coins arrondis, crème visible autour. Les pages réservent la place avec `lg:pl-[15.5rem]` — la barre étant `fixed`, elle sort du flux et recouvrirait sinon le contenu.
- **< 1024px** : en-tête bordeaux compact et tiroir glissant depuis la gauche, fermable par le voile, par le bouton, par la touche Échap, et refermé automatiquement à chaque navigation. Le défilement du fond est bloqué tant qu'il est ouvert.

**Entrée active = le plus long préfixe correspondant.** Un simple `startsWith` allumerait « Commandes » *et* « Nouvelle commande » sur `/vendeur/commandes/nouvelle` ; une égalité stricte n'allumerait rien sur `/vendeur/produits/<id>`.

Les icônes sont dessinées en SVG inline (`components/ui/IconesNav.tsx`) : quatre traits suffisent, et une bibliothèque d'icônes représente plusieurs centaines de kilo-octets pour un public souvent en 3G.

### Défaut corrigé dans l'outil de vérification lui-même

Le contrôleur de contraste ne lisait que `background-color`. Un dégradé étant peint via `background-image`, il retombait sur le blanc par défaut et déclarait **illisible un texte blanc posé sur le bordeaux** — 84 fausses alertes. Deux corrections :

1. **Dans l'application** : les surfaces en dégradé portent aussi une couleur de fond solide (`bg-menu bg-gradient-to-b …`). Si le dégradé ne peint pas, le texte blanc reste sur du bordeaux et non sur rien.
2. **Dans `scripts/check-responsive.mjs`** : les étapes du dégradé sont extraites et le texte n'est déclaré conforme que s'il l'est sur **chacune** d'elles — le cas le plus défavorable fait foi. La règle est donc plus stricte qu'avant, jamais plus laxiste ; vérifié en réinjectant des fautes connues (or sur crème, blanc sur dégradé clair).

### Accord en nombre

`pluriel()` dans `lib/format.ts` remplace les « 1 vendeur(s) » disséminés dans l'interface. Le français ne met la marque du pluriel qu'à partir de 2 : « 0 commande » s'écrit au singulier, contrairement à l'anglais.

---

## 8 octies. Connexion Google et animation des boutons (21/08/2026)

### Connexion Google (OAuth 2.0 / OpenID Connect)

`lib/auth/google.ts` · `app/api/auth/google/route.ts` · `app/api/auth/google/callback/route.ts`

**Trois protections, toutes obligatoires :**

- **`state`** — jeton aléatoire déposé en cookie httpOnly avant la redirection, recomparé au retour **à durée constante**. Sans lui, un tiers peut forger un lien de rappel et connecter la victime sur *son* compte Google.
- **PKCE (S256)** — le code d'autorisation ne vaut rien sans le `code_verifier`, qui ne quitte jamais le serveur. Protège si le code fuite par les journaux, l'en-tête `Referer` ou l'historique.
- **`nonce`** — lie le jeton d'identité à cette demande précise, ce qui interdit de rejouer un jeton obtenu ailleurs.

Le jeton d'identité est obtenu **directement** auprès du point de terminaison de Google, en TLS, authentifié par le secret client : OpenID Connect Core §3.1.3.7 dispense alors de vérifier la signature. Les claims qui restent à contrôler — `iss`, `aud`, `exp`, `nonce` — le sont explicitement ; ce sont eux qui empêchent d'accepter un jeton émis pour une autre application.

**Le rattachement par e-mail exige `email_verified`.** Sans cette condition, il suffirait de créer un compte Google portant l'adresse d'un vendeur KOLI pour prendre la main sur sa boutique. Le lien durable se fait sur le claim `sub`, stable, et non sur l'adresse, qui peut changer de propriétaire.

**Pourquoi une étape supplémentaire à l'inscription** (`/inscription/google`) — Google fournit le nom, l'e-mail et la photo, mais ni le **téléphone** ni le **rôle**. Or le numéro n'est pas un détail administratif chez KOLI : il porte la livraison, le code de réception (§27) et le rattachement des commandes passées en invité (`createOrderAction` relie l'acheteur à un compte par son numéro). Créer le compte sans lui donnerait un utilisateur qui ne verrait jamais ses propres achats. L'identitéYthon validée transite dans un **cookie signé** — déposée en clair, n'importe qui pourrait se déclarer titulaire de n'importe quelle adresse.

**Comptes sans mot de passe** — `User.passwordHash` devient nullable. Deux conséquences traitées :

- `loginAction` répond *« Ce compte se connecte avec Google »* au lieu de *« identifiant ou mot de passe incorrect »*, qui enverrait l'utilisateur essayer indéfiniment un mot de passe inexistant.
- La page de profil propose de **définir** un premier mot de passe sans exiger l'actuel. Ce n'est pas un relâchement : en définir un n'enlève rien au propriétaire, qui continue d'entrer par Google et ne peut donc pas être mis dehors de cette façon.

**Absence de configuration assumée** — sans `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, le bouton ne s'affiche pas et le reste fonctionne normalement. Un bouton qui mène à une erreur vaut moins que pas de bouton.

**Défaut trouvé à la vérification** — `/connexion` et `/inscription` étaient **pré-rendues statiquement**. `googleEstConfigure()` lisant des variables d'environnement serveur, la réponse était figée *à la construction* : un déploiement bâti sans identifiants n'aurait jamais affiché le bouton, même après les avoir renseignés en production. Invisible en local, où l'on reconstruit sans arrêt. Corrigé par `export const dynamic = "force-dynamic"` sur les deux pages.

> **Limite à connaître.** Google n'accepte comme adresse de rappel que `localhost`, `127.0.0.1` ou un domaine en **HTTPS**. Une IP de réseau local (`192.168.x.x`, `172.20.x.x`) est refusée : la connexion Google ne fonctionnera donc **pas depuis un téléphone sur le wifi** tant qu'il n'y a pas de nom de domaine. Le reste de l'application, lui, continue de fonctionner sur l'IP locale.

### Animation de tous les boutons

Règle globale dans `globals.css`, hors couche, plutôt que des utilitaires recopiés bouton par bouton : **quatre boutons seulement** portaient une animation, avec des valeurs déjà divergentes entre eux ; les vingt-sept autres ne bougeaient pas. Sur un téléphone d'entrée de gamme, où l'affichage met un instant à suivre, rien ne confirmait alors que l'appui avait été pris en compte — et l'utilisateur appuyait deux fois.

Les sélecteurs d'attribut (`a[class*="rounded"][class*="bg-"]`) visent les liens **stylés en bouton** sans toucher aux liens de texte courant, qui ne doivent pas bouger. Deux précautions :

- `@media (hover: hover)` pour le soulèvement : sur un écran tactile, le survol « colle » après l'appui et le bouton resterait soulevé une fois le doigt parti ;
- un bouton **désactivé** est exclu — il ne doit pas donner l'impression d'être pressable.

Les animations restent soumises à `prefers-reduced-motion` (§70). Vérifié : 31 boutons inspectés sur trois pages, tous animés, le survol produit bien un déplacement mesurable.

---

## 8 nonies. §18 — assistant de commande en 5 étapes (21/08/2026)

Le formulaire de création de commande était d'un seul tenant : douze champs sur une page. Le §18 en prescrit cinq étapes — produit, client, livraison, résumé, création.

**Ce que le découpage apporte concrètement** — la validation a lieu **à chaque étape**. Auparavant le vendeur saisissait tout, cliquait, et découvrait alors seulement que le numéro du client était invalide. Désormais il l'apprend à l'étape 2, avant d'avoir saisi la suite.

**Le contrôle est rejoué avant la création.** Revenir en arrière depuis le résumé, vider un champ puis relancer contournerait autrement la validation : `creer()` repasse les étapes 1 à 3 et renvoie à la première fautive. Ce n'est pas une redondance décorative, c'est le seul filet quand la navigation est libre.

**`Order.buyerEmail`** — le §18 étape 2 demande un e-mail client facultatif, absent du schéma. Colonne optionnelle ajoutée ; le téléphone reste l'identifiant, l'e-mail n'étant pas répandu dans le public visé. Il servira à transmettre la facture (§38).

**Fil d'étapes** — barres et non libellés côte à côte : à 320px, cinq libellés ne tiennent pas et se chevauchaient. Le libellé de l'étape courante est affiché seul en dessous, en `aria-hidden` — la liste porte déjà l'information complète pour les lecteurs d'écran, et sans cela la progression serait annoncée deux fois.

**Défaut de méthode rencontré** — le test lisait l'étape courante avec `/Étape (\d) sur 5/` sur `document.body.innerText`. Or les libellés destinés aux lecteurs d'écran énumèrent les cinq étapes : la première correspondance renvoyait toujours « 1 ». Neuf assertions échouaient alors que l'application était correcte, pendant que les assertions de contenu (total, valeurs conservées) passaient — c'est cette contradiction qui a mis sur la piste. Le détecteur cible désormais le tiret cadratin de la ligne visible.

### Point de reprise

Phase 6 (catalogue), §34-36 (console d'administration), refonte visuelle, connexion Google et §18 (assistant en 5 étapes) sont terminés. Prochaine cible recommandée : **§28 — affichage des preuves de livraison**, aujourd'hui enregistrées mais jamais montrées, puis **§38 — facture après paiement**, dont le champ e-mail client vient d'être posé.

---

## 8 decies. Appels à l'action et petits boutons (21/08/2026)

**Contours** — `--color-hairline` passe d'un gris froid à un bordeaux très dilué. Le gris disparaissait sur la crème : les blocs flottaient sans limite lisible. Teinter le **jeton** plutôt que chaque carte donne un contour cohérent dans toute l'application sans toucher au balisage.

`.carte-koli` : contour à 12 % de la marque, qui se densifie à 38 % au survol avec une ombre teintée de la même couleur et un soulèvement de 3 px. `color-mix` plutôt qu'une couleur figée, pour que le contour suive `--color-brand` si l'identité évolue.

**Appels à l'action** — ombre portée teintée de la marque au repos, qui s'accentue au survol ; soulèvement de 2 px ; un reflet balaie le bouton. L'ombre est bordeaux et non grise : une ombre neutre sous un bouton bordeaux donne un rendu sale. Le reflet est une animation **déclenchée** et non perpétuelle — une boucle infinie sur chaque CTA userait la batterie des téléphones d'entrée de gamme visés (§70).

**Petits boutons** — beaucoup n'avaient **aucune** limite : un libellé bordeaux posé sur du blanc, sans rien qui indique la zone cliquable. Sur un téléphone, où l'on vise au doigt, la cible était invisible tant qu'on ne l'avait pas touchée. Seuls les boutons sans fond et les pastilles à fond doux sont visés : un contour bordeaux sur le vert WhatsApp ou sur le rouge d'une action destructrice jurerait.

### Deux pièges de spécificité rencontrés — et la leçon

Le CTA ne se soulevait que d'**un** pixel au lieu de deux, deux fois de suite :

1. `:where(button, a)[class~="bg-brand"]:hover` — `:where()` **annule la spécificité** de son contenu. La règle valait (0,2,0) contre (0,2,1) pour `button:not(:disabled):hover`, qui l'emportait.
2. Après avoir écrit les sélecteurs en toutes lettres — (0,2,1) — la règle générique des **liens** l'emportait encore : `a[class*="rounded"][class*="bg-"]:hover` compte **deux** sélecteurs d'attribut, soit (0,3,1).

**La correction n'a pas été de surenchérir** en spécificité, ce qui aurait relancé la course au premier ajout suivant, mais d'**exclure** les appels à l'action de la règle générique. Chaque bouton relève désormais d'une seule règle de soulèvement, et l'intention est lisible dans le sélecteur.

C'est le troisième piège de cascade de ce projet, après les deux de `@layer` notés au §8 ter. La règle qui s'en dégage : **quand deux règles se disputent la même propriété sur le même élément, on en supprime une, on n'ajoute pas de poids à l'autre.**

Vérifié en mesurant les styles calculés : ombre présente au repos et accentuée au survol, `translateY(-2px)`, reflet passant de −120 % à +120 %, et 23 petits boutons contournés sur trois pages.

---

## 8 undecies. Page blanche sur session orpheline (21/08/2026)

Signalé par capture d'écran : une page entièrement blanche sur `/vendeur/dashboard`, sans message ni moyen d'en sortir.

### Ce que c'était

Le cookie de session est **signé, pas vérifié en base**. Le middleware s'en contente ; la page, elle, exige le compte réel. Tant que les deux sont d'accord, tout va bien. Dès que le compte disparaît — suppression par l'administration, ou simple réinitialisation de la base de démonstration, qui fait `user.deleteMany()` — ils cessent de l'être et se renvoient la balle :

```
/vendeur/dashboard  →  la page ne trouve pas le compte     →  /connexion
/connexion          →  le middleware voit un jeton valide  →  /vendeur/dashboard
```

`ERR_TOO_MANY_REDIRECTS`, page blanche, et **aucune issue** pour l'utilisateur sans effacer ses cookies à la main.

Ce n'est pas un accident de la base de démonstration : le même enchaînement se produit en production dès qu'un compte est supprimé pendant qu'une session est ouverte.

### Pourquoi les tests ne l'avaient pas vu

Chaque test partait d'une base cohérente avec le navigateur. Le défaut n'apparaît que dans l'**intervalle** entre les deux — un état que rien ne produisait. `scripts/test-session-orpheline.mjs` le fabrique désormais explicitement : il s'inscrit, rejoue le seed pour effacer le compte, puis revient sur l'espace.

### La correction

Décider « vous êtes déjà connecté » suppose de savoir que le compte **existe**, ce que seul un accès à la base permet — donc pas le middleware. La redirection quitte `middleware.ts` et rejoint les pages `/connexion` et `/inscription`, où `getCurrentUser()` lit la base : compte disparu → `null` → le formulaire s'affiche, et la boucle est structurellement impossible.

Le middleware garde son seul rôle légitime : **protéger les routes privées**. Il ne décide plus rien qui dépende de l'existence d'un compte.

C'est la même leçon qu'au §8 decies, transposée : quand deux couches se prononcent sur la même question avec des informations différentes, on n'arbitre pas — **on retire la question à celle qui ne peut pas y répondre.**

### Diagnostic — ce qui a fait perdre du temps

Trois hypothèses ont été formulées et **écartées par la mesure** avant la bonne : rendu serveur en échec (la page répondait 200 avec 804 caractères), fichiers JavaScript périmés après reconstruction (simulé en renvoyant 404 sur `/_next/**` : Next se rattrape), et redirection cassée au préchargement RSC (les requêtes `?_rsc=` abandonnées étaient une conséquence, pas la cause). La piste utile est venue du contexte : le compte de l'utilisateur avait été créé **avant** un rejeu du seed.
