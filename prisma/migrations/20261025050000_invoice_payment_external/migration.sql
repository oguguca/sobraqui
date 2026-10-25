-- Abater fatura com dinheiro de fora das contas (dinheiro vivo, cashback,
-- alguém pagou por você): o pagamento de fatura pode não ter conta de origem.
-- Sem conta, o pagamento só reduz a fatura; nenhum saldo de conta muda.
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_kind_shape";

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_kind_shape" CHECK (
    CASE kind
      WHEN 'income' THEN
        account_id IS NOT NULL AND destination_account_id IS NULL
        AND credit_card_id IS NULL AND invoice_id IS NULL
      WHEN 'expense' THEN
        destination_account_id IS NULL
        AND num_nonnulls(account_id, credit_card_id) = 1
        AND (credit_card_id IS NULL) = (invoice_id IS NULL)
      WHEN 'refund' THEN
        destination_account_id IS NULL
        AND num_nonnulls(account_id, credit_card_id) = 1
        AND (credit_card_id IS NULL) = (invoice_id IS NULL)
      WHEN 'transfer' THEN
        account_id IS NOT NULL AND destination_account_id IS NOT NULL
        AND account_id <> destination_account_id
        AND credit_card_id IS NULL AND invoice_id IS NULL
      WHEN 'invoice_payment' THEN
        destination_account_id IS NULL
        AND credit_card_id IS NOT NULL AND invoice_id IS NOT NULL
    END
  );
