# KOLI — Document technique (Phase 0)

Produit conformément à `docs/koli-plan.md` §79 et §87 : architecture, arborescence, schéma de base de données, rôles/permissions, workflows, routes, composants principaux — à valider avant le début de la Phase 1.

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
DELIVERED → CUSTOMER_CONFIRMED | DISPUTE_OPEN
CUSTOMER_CONFIRMED → FUNDS_RELEASED
FUNDS_RELEASED → COMPLETED
DISPUTE_OPEN → ADMIN_REVIEW
ADMIN_REVIEW → (décision) → SELLER_WINS → FUNDS_RELEASED
ADMIN_REVIEW → (décision) → CUSTOMER_WINS → REFUND_PENDING → REFUNDED
```

Toute tentative de transition hors de cette table est rejetée côté serveur (`lib/orders/statusMachine.ts`). Tant qu'un litige est ouvert, aucun chemin ne mène à `FUNDS_RELEASED` (§33).

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

## 9. Prochaine étape

Une fois ce document validé : démarrage de la **Phase 1 — Initialisation du projet** (installation Prisma/Zod/bcrypt/jose/Vitest, mise en place de `middleware.ts`, création du schéma Prisma et première migration), suivie immédiatement de la **Phase 2 — Base de données**, en conservant à chaque étape le principe du §1 de `koli-plan.md` : implémenter → tester → vérifier erreurs/responsive/permissions/régressions → seulement ensuite avancer.

**Dépendant de la réponse sur Antigravity :** si l'implémentation se fait dans un autre outil, cette section devient un simple pense-bête pour cet outil plutôt qu'une instruction pour cette session.
