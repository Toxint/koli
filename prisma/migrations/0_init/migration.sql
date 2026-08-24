-- Base de reference (baseline) du schema KOLI.
--
-- Ce fichier N EST PAS une migration ordinaire : il decrit la base telle
-- qu elle existait deja quand la gestion des migrations a ete mise en place.
-- Il a ete produit par lecture de la base elle-meme, et non du schema Prisma,
-- pour qu il en soit le reflet exact.
--
-- Il est marque comme DEJA APPLIQUE sur les bases existantes
-- (prisma migrate resolve --applied 0_init) ; il ne sera reellement execute
-- que sur une base neuve.
--
-- Avant cette mise en place, le schema etait pousse directement avec
-- prisma db push : aucune trace des changements, et un deploiement revenait
-- a modifier la structure a la main, sans savoir ce qui allait etre altere.

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorName" TEXT,
    "actorRole" TEXT,
    FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ratePercent" REAL NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CustomerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickedUpAt" DATETIME,
    "arrivedAt" DATETIME,
    "deliveredAt" DATETIME,
    FOREIGN KEY ("driverId") REFERENCES "DriverProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryProof" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "otpCode" TEXT NOT NULL,
    "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureUrl" TEXT,
    "photoUrl" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    FOREIGN KEY ("deliveryId") REFERENCES "Delivery" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "decision" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DisputeMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT,
    "attachmentUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DriverProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "vehicle" TEXT,
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "secured" BOOLEAN NOT NULL DEFAULT false,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "securedAt" DATETIME,
    "releasedAt" DATETIME,
    FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KycDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedAt" DATETIME,
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("sellerId") REFERENCES "SellerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "readAt" DATETIME,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reference" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "customerId" TEXT,
    "buyerName" TEXT NOT NULL,
    "buyerPhone" TEXT NOT NULL,
    "buyerCountry" TEXT NOT NULL,
    "buyerCity" TEXT NOT NULL,
    "buyerAddress" TEXT NOT NULL,
    "buyerLandmark" TEXT,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "buyerEmail" TEXT,
    FOREIGN KEY ("customerId") REFERENCES "CustomerProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("sellerId") REFERENCES "SellerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("deliveryId") REFERENCES "Delivery" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'TEST',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "simulatedOutcome" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "weightKg" REAL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("sellerId") REFERENCES "SellerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SellerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "businessName" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "commissionRateOverride" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kycSubmittedAt" DATETIME,
    "legalName" TEXT,
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rate" REAL,
    FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "photoUrl" TEXT,
    "googleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resetTokenExpiry" DATETIME,
    "resetTokenHash" TEXT
);

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProfile_userId_key" ON "CustomerProfile"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_orderId_key" ON "Delivery"("orderId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryProof_deliveryId_key" ON "DeliveryProof"("deliveryId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_orderId_key" ON "Dispute"("orderId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DriverProfile_userId_key" ON "DriverProfile"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Fund_orderId_key" ON "Fund"("orderId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId" ASC);

-- CreateIndex
CREATE INDEX "KycDocument_status_createdAt_idx" ON "KycDocument"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "KycDocument_sellerId_status_idx" ON "KycDocument"("sellerId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId" ASC, "readAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Refund_orderId_key" ON "Refund"("orderId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SellerProfile_userId_key" ON "SellerProfile"("userId" ASC);

-- CreateIndex
CREATE INDEX "Transaction_type_createdAt_idx" ON "Transaction"("type" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Transaction_orderId_idx" ON "Transaction"("orderId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone" ASC);

