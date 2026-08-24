-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Fund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "secured" BOOLEAN NOT NULL DEFAULT false,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "securedAt" DATETIME,
    "releasedAt" DATETIME,
    CONSTRAINT "Fund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Fund_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Fund" ("amount", "id", "orderId", "released", "releasedAt", "secured", "securedAt", "sellerId") SELECT "amount", "id", "orderId", "released", "releasedAt", "secured", "securedAt", "sellerId" FROM "Fund";
DROP TABLE "Fund";
ALTER TABLE "new_Fund" RENAME TO "Fund";
CREATE UNIQUE INDEX "Fund_orderId_key" ON "Fund"("orderId");
CREATE INDEX "Fund_sellerId_secured_released_idx" ON "Fund"("sellerId", "secured", "released");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
