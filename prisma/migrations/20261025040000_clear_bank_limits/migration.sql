-- A sincronização pelo Open Finance foi removida. Os limites que o banco
-- informou ficariam congelados; o limite volta a ser calculado pelos
-- lançamentos. As colunas ficam para uma integração futura.
UPDATE "credit_cards"
SET "bank_available_cents" = NULL, "bank_used_cents" = NULL, "bank_synced_at" = NULL
WHERE "bank_synced_at" IS NOT NULL OR "bank_available_cents" IS NOT NULL OR "bank_used_cents" IS NOT NULL;
