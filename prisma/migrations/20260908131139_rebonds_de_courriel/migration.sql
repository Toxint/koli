-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "providerMessageId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailBounceReason" TEXT,
ADD COLUMN     "emailBouncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_providerMessageId_key" ON "Notification"("providerMessageId");

