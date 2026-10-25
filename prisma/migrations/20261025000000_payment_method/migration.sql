-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('pix', 'debit_card', 'credit_card', 'boleto', 'cash', 'transfer', 'other');

-- AlterTable
ALTER TABLE "recurring_transactions" ADD COLUMN     "payment_method" "payment_method";

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "payment_method" "payment_method";

-- Escrito à mão ---------------------------------------------------------------

-- Forma de pagamento só para saídas; crédito sempre no cartão e vice-versa.
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_payment_method_kind" CHECK (payment_method IS NULL OR kind = 'expense'),
  ADD CONSTRAINT "transactions_payment_method_card" CHECK (
    payment_method IS NULL OR (payment_method = 'credit_card') = (credit_card_id IS NOT NULL)
  );

ALTER TABLE "recurring_transactions"
  ADD CONSTRAINT "recurring_payment_method_check" CHECK (
    payment_method IS NULL OR (kind = 'expense' AND payment_method <> 'credit_card')
  );

-- Compras já registradas no cartão passam a ter forma de pagamento "crédito".
UPDATE "transactions" SET payment_method = 'credit_card'
WHERE kind = 'expense' AND credit_card_id IS NOT NULL AND payment_method IS NULL;

-- Categoria "Freelance" para quem já tem conta (novos usuários recebem no cadastro).
INSERT INTO "categories" (id, user_id, name, kind, icon, color, created_at, updated_at)
SELECT gen_random_uuid(), u.id, 'Freelance', 'income', 'hand-coins', '#0d9488', now(), now()
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "categories" c WHERE c.user_id = u.id AND c.kind = 'income' AND lower(c.name) = 'freelance'
);
