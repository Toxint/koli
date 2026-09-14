-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "holderName" TEXT;

-- CreateTable
CREATE TABLE "PayoutAccount" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "label" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutAccount_sellerId_idx" ON "PayoutAccount"("sellerId");

-- AddForeignKey
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
