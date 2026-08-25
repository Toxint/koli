-- Paiement asynchrone (§29, §52).
--
-- Un vrai paiement Mobile Money n est pas une reponse immediate : le payeur
-- valide sur son telephone, et l agregateur rappelle ensuite. Ces colonnes
-- portent ce que ce mode exige et qui manquait entierement.
--
-- Ajout de colonnes NULLABLE uniquement : aucune ligne existante n est
-- touchee, et SQLite accepte plusieurs NULL dans un index unique.

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "expiresAt" DATETIME;
ALTER TABLE "Payment" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Payment" ADD COLUMN "lastCheckedAt" DATETIME;
ALTER TABLE "Payment" ADD COLUMN "payerMsisdn" TEXT;
ALTER TABLE "Payment" ADD COLUMN "payerOperator" TEXT;
ALTER TABLE "Payment" ADD COLUMN "providerRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_status_expiresAt_idx" ON "Payment"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Payment_status_lastCheckedAt_idx" ON "Payment"("status", "lastCheckedAt");

