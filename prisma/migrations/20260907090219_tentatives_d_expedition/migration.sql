-- DropIndex
DROP INDEX "Notification_sentAt_createdAt_idx";

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "sendAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Notification_sentAt_sendAttempts_createdAt_idx" ON "Notification"("sentAt", "sendAttempts", "createdAt");
