-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'XOF';

-- CreateIndex
CREATE INDEX "Transaction_type_currency_idx" ON "Transaction"("type", "currency");

-- Reprise des ecritures existantes.
--
-- La valeur par defaut « XOF » convient a ce qui existe aujourd hui — tous les
-- marches desservis jusqu ici etaient en franc CFA — mais s en contenter serait
-- poser une valeur choisie plutot que la valeur vraie. On la LIT sur la
-- commande, qui l a toujours portee.
--
-- Sans cela, une ecriture d une commande en CDF creee entre le deploiement du
-- champ `Order.currency` et celui-ci porterait « XOF » pour toujours, sans que
-- rien ne le signale.
UPDATE "Transaction" t
   SET "currency" = o."currency"
  FROM "Order" o
 WHERE o."id" = t."orderId"
   AND o."currency" <> t."currency";
