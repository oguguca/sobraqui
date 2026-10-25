-- AlterTable
ALTER TABLE "credit_card_invoices" ADD COLUMN     "bank_amount_cents" BIGINT;

-- AlterTable
ALTER TABLE "credit_cards" ADD COLUMN     "bank_available_cents" BIGINT,
ADD COLUMN     "bank_synced_at" TIMESTAMPTZ(3),
ADD COLUMN     "bank_used_cents" BIGINT;
