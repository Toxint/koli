-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DisputeMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT,
    "attachmentUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisputeMessage_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DisputeMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DisputeMessage" ("attachmentUrl", "authorUserId", "body", "createdAt", "disputeId", "id") SELECT "attachmentUrl", "authorUserId", "body", "createdAt", "disputeId", "id" FROM "DisputeMessage";
DROP TABLE "DisputeMessage";
ALTER TABLE "new_DisputeMessage" RENAME TO "DisputeMessage";
CREATE INDEX "DisputeMessage_disputeId_createdAt_idx" ON "DisputeMessage"("disputeId", "createdAt");
CREATE TABLE "new_OrderStatusHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderStatusHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderStatusHistory" ("actorUserId", "createdAt", "fromStatus", "id", "orderId", "toStatus") SELECT "actorUserId", "createdAt", "fromStatus", "id", "orderId", "toStatus" FROM "OrderStatusHistory";
DROP TABLE "OrderStatusHistory";
ALTER TABLE "new_OrderStatusHistory" RENAME TO "OrderStatusHistory";
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
