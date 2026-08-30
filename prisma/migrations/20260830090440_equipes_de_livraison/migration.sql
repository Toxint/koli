-- AlterTable
ALTER TABLE "DriverProfile" ADD COLUMN     "available" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "zone" TEXT;

-- CreateTable
CREATE TABLE "SellerDriver" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "inviteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerDriver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverInvite" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SellerDriver_driverId_idx" ON "SellerDriver"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerDriver_sellerId_driverId_key" ON "SellerDriver"("sellerId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverInvite_token_key" ON "DriverInvite"("token");

-- CreateIndex
CREATE INDEX "DriverInvite_sellerId_idx" ON "DriverInvite"("sellerId");

-- AddForeignKey
ALTER TABLE "SellerDriver" ADD CONSTRAINT "SellerDriver_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerDriver" ADD CONSTRAINT "SellerDriver_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerDriver" ADD CONSTRAINT "SellerDriver_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "DriverInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverInvite" ADD CONSTRAINT "DriverInvite_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
