-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "account_type" AS ENUM ('checking', 'payment', 'cash', 'savings', 'investment', 'other');

-- CreateEnum
CREATE TYPE "category_kind" AS ENUM ('income', 'expense', 'transfer');

-- CreateEnum
CREATE TYPE "transaction_kind" AS ENUM ('income', 'expense', 'refund', 'transfer', 'invoice_payment');

-- CreateEnum
CREATE TYPE "transaction_status" AS ENUM ('paid', 'pending');

-- CreateEnum
CREATE TYPE "recurrence_frequency" AS ENUM ('weekly', 'monthly', 'yearly');

-- CreateEnum
CREATE TYPE "import_format" AS ENUM ('nubank_account_csv', 'nubank_card_csv', 'ofx', 'generic_csv');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('completed', 'undone');

-- CreateEnum
CREATE TYPE "goal_kind" AS ENUM ('emergency', 'purchase', 'debt', 'other');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(3),
    "refreshTokenExpiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "display_name" VARCHAR(80),
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "type" "account_type" NOT NULL,
    "institution" VARCHAR(80),
    "currency" CHAR(3) NOT NULL DEFAULT 'BRL',
    "initial_balance_cents" BIGINT NOT NULL DEFAULT 0,
    "color" CHAR(7),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "kind" "category_kind" NOT NULL,
    "icon" VARCHAR(40) NOT NULL DEFAULT 'circle',
    "color" CHAR(7) NOT NULL DEFAULT '#64748b',
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_cards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "brand" VARCHAR(40),
    "limit_cents" BIGINT NOT NULL,
    "closing_day" SMALLINT NOT NULL,
    "due_day" SMALLINT NOT NULL,
    "payment_account_id" UUID,
    "color" CHAR(7),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "credit_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_card_invoices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "credit_card_id" UUID NOT NULL,
    "reference_month" DATE NOT NULL,
    "closing_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "credit_card_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "transaction_kind" NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "category_id" UUID,
    "account_id" UUID NOT NULL,
    "frequency" "recurrence_frequency" NOT NULL DEFAULT 'monthly',
    "start_on" DATE NOT NULL,
    "end_on" DATE,
    "next_occurrence_on" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recurring_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "format" "import_format" NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_sha256" CHAR(64) NOT NULL,
    "account_id" UUID,
    "credit_card_id" UUID,
    "invoice_id" UUID,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "status" "import_status" NOT NULL DEFAULT 'completed',
    "undone_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "transaction_kind" NOT NULL,
    "status" "transaction_status" NOT NULL DEFAULT 'paid',
    "amount_cents" BIGINT NOT NULL,
    "occurred_on" DATE NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "notes" VARCHAR(2000),
    "category_id" UUID,
    "account_id" UUID,
    "destination_account_id" UUID,
    "credit_card_id" UUID,
    "invoice_id" UUID,
    "installment_group_id" UUID,
    "installment_number" SMALLINT,
    "installment_total" SMALLINT,
    "recurring_transaction_id" UUID,
    "import_batch_id" UUID,
    "external_id" VARCHAR(255),
    "dedupe_key" VARCHAR(512),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "limit_cents" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" "goal_kind" NOT NULL DEFAULT 'other',
    "target_cents" BIGINT NOT NULL,
    "saved_cents" BIGINT NOT NULL DEFAULT 0,
    "target_date" DATE,
    "color" CHAR(7),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "financial_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "auth_accounts_userId_idx" ON "auth_accounts"("userId");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_id_key" ON "accounts"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_id_key" ON "categories"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_kind_name_key" ON "categories"("user_id", "kind", "name");

-- CreateIndex
CREATE INDEX "credit_cards_user_id_idx" ON "credit_cards"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_cards_user_id_id_key" ON "credit_cards"("user_id", "id");

-- CreateIndex
CREATE INDEX "credit_card_invoices_user_id_due_date_idx" ON "credit_card_invoices"("user_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "credit_card_invoices_user_id_id_key" ON "credit_card_invoices"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_card_invoices_credit_card_id_reference_month_key" ON "credit_card_invoices"("credit_card_id", "reference_month");

-- CreateIndex
CREATE INDEX "recurring_transactions_user_id_next_occurrence_on_idx" ON "recurring_transactions"("user_id", "next_occurrence_on");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_transactions_user_id_id_key" ON "recurring_transactions"("user_id", "id");

-- CreateIndex
CREATE INDEX "import_batches_user_id_created_at_idx" ON "import_batches"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "import_batches_user_id_file_sha256_idx" ON "import_batches"("user_id", "file_sha256");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_user_id_id_key" ON "import_batches"("user_id", "id");

-- CreateIndex
CREATE INDEX "transactions_user_id_occurred_on_idx" ON "transactions"("user_id", "occurred_on" DESC);

-- CreateIndex
CREATE INDEX "transactions_account_id_idx" ON "transactions"("account_id");

-- CreateIndex
CREATE INDEX "transactions_destination_account_id_idx" ON "transactions"("destination_account_id");

-- CreateIndex
CREATE INDEX "transactions_credit_card_id_idx" ON "transactions"("credit_card_id");

-- CreateIndex
CREATE INDEX "transactions_invoice_id_idx" ON "transactions"("invoice_id");

-- CreateIndex
CREATE INDEX "transactions_category_id_idx" ON "transactions"("category_id");

-- CreateIndex
CREATE INDEX "transactions_import_batch_id_idx" ON "transactions"("import_batch_id");

-- CreateIndex
CREATE INDEX "transactions_installment_group_id_idx" ON "transactions"("installment_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_user_id_dedupe_key_key" ON "transactions"("user_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_recurring_transaction_id_occurred_on_key" ON "transactions"("recurring_transaction_id", "occurred_on");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_user_id_category_id_month_key" ON "budgets"("user_id", "category_id", "month");

-- CreateIndex
CREATE INDEX "financial_goals_user_id_idx" ON "financial_goals"("user_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_payment_account_id_fkey" FOREIGN KEY ("user_id", "payment_account_id") REFERENCES "accounts"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_invoices" ADD CONSTRAINT "credit_card_invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_card_invoices" ADD CONSTRAINT "credit_card_invoices_user_id_credit_card_id_fkey" FOREIGN KEY ("user_id", "credit_card_id") REFERENCES "credit_cards"("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_user_id_category_id_fkey" FOREIGN KEY ("user_id", "category_id") REFERENCES "categories"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_user_id_account_id_fkey" FOREIGN KEY ("user_id", "account_id") REFERENCES "accounts"("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_account_id_fkey" FOREIGN KEY ("user_id", "account_id") REFERENCES "accounts"("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_credit_card_id_fkey" FOREIGN KEY ("user_id", "credit_card_id") REFERENCES "credit_cards"("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_invoice_id_fkey" FOREIGN KEY ("user_id", "invoice_id") REFERENCES "credit_card_invoices"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_category_id_fkey" FOREIGN KEY ("user_id", "category_id") REFERENCES "categories"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_account_id_fkey" FOREIGN KEY ("user_id", "account_id") REFERENCES "accounts"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_destination_account_id_fkey" FOREIGN KEY ("user_id", "destination_account_id") REFERENCES "accounts"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_credit_card_id_fkey" FOREIGN KEY ("user_id", "credit_card_id") REFERENCES "credit_cards"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_invoice_id_fkey" FOREIGN KEY ("user_id", "invoice_id") REFERENCES "credit_card_invoices"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_recurring_transaction_id_fkey" FOREIGN KEY ("user_id", "recurring_transaction_id") REFERENCES "recurring_transactions"("user_id", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_import_batch_id_fkey" FOREIGN KEY ("user_id", "import_batch_id") REFERENCES "import_batches"("user_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_category_id_fkey" FOREIGN KEY ("user_id", "category_id") REFERENCES "categories"("user_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_goals" ADD CONSTRAINT "financial_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Regras que o Prisma não modela. Escritas à mão: não remova ao regenerar.
-- ===========================================================================

-- CHECKs de domínio ---------------------------------------------------------

ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_name_check" CHECK (char_length(btrim(name)) >= 1),
  ADD CONSTRAINT "accounts_color_check" CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$');

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_name_check" CHECK (char_length(btrim(name)) >= 1),
  ADD CONSTRAINT "categories_color_check" CHECK (color ~ '^#[0-9a-fA-F]{6}$');

ALTER TABLE "credit_cards"
  ADD CONSTRAINT "credit_cards_name_check" CHECK (char_length(btrim(name)) >= 1),
  ADD CONSTRAINT "credit_cards_limit_check" CHECK (limit_cents >= 0),
  ADD CONSTRAINT "credit_cards_days_check" CHECK (closing_day BETWEEN 1 AND 31 AND due_day BETWEEN 1 AND 31),
  ADD CONSTRAINT "credit_cards_color_check" CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$');

ALTER TABLE "credit_card_invoices"
  ADD CONSTRAINT "credit_card_invoices_month_check" CHECK (extract(day FROM reference_month) = 1),
  ADD CONSTRAINT "credit_card_invoices_dates_check" CHECK (due_date >= closing_date);

ALTER TABLE "recurring_transactions"
  ADD CONSTRAINT "recurring_kind_check" CHECK (kind IN ('income', 'expense')),
  ADD CONSTRAINT "recurring_amount_check" CHECK (amount_cents > 0),
  ADD CONSTRAINT "recurring_description_check" CHECK (char_length(btrim(description)) >= 1),
  ADD CONSTRAINT "recurring_end_check" CHECK (end_on IS NULL OR end_on >= start_on);

ALTER TABLE "import_batches"
  ADD CONSTRAINT "import_batches_target_check" CHECK (num_nonnulls(account_id, credit_card_id) = 1),
  ADD CONSTRAINT "import_batches_sha_check" CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "import_batches_counts_check" CHECK (
    total_rows >= 0 AND imported_count >= 0 AND duplicate_count >= 0 AND skipped_count >= 0 AND error_count >= 0
  );

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_amount_check" CHECK (amount_cents > 0),
  ADD CONSTRAINT "transactions_description_check" CHECK (char_length(btrim(description)) >= 1),
  -- Formato de cada tipo de lançamento.
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
        account_id IS NOT NULL AND destination_account_id IS NULL
        AND credit_card_id IS NOT NULL AND invoice_id IS NOT NULL
    END
  ),
  -- Compras no cartão são sempre efetivadas; o que fica pendente é a fatura.
  ADD CONSTRAINT "transactions_card_status" CHECK (
    credit_card_id IS NULL OR kind = 'invoice_payment' OR status = 'paid'
  ),
  ADD CONSTRAINT "transactions_installments" CHECK (
    (installment_group_id IS NULL AND installment_number IS NULL AND installment_total IS NULL)
    OR (
      installment_group_id IS NOT NULL
      AND installment_total BETWEEN 2 AND 72
      AND installment_number BETWEEN 1 AND installment_total
    )
  );

ALTER TABLE "budgets"
  ADD CONSTRAINT "budgets_month_check" CHECK (extract(day FROM month) = 1),
  ADD CONSTRAINT "budgets_limit_check" CHECK (limit_cents > 0);

ALTER TABLE "financial_goals"
  ADD CONSTRAINT "financial_goals_name_check" CHECK (char_length(btrim(name)) >= 1),
  ADD CONSTRAINT "financial_goals_target_check" CHECK (target_cents > 0),
  ADD CONSTRAINT "financial_goals_saved_check" CHECK (saved_cents >= 0);

-- Isolamento por usuário (RLS) -------------------------------------------------
--
-- A aplicação conecta como dono do banco, mas cada operação de dados do usuário
-- roda numa transação que faz:
--   SELECT set_config('app.user_id', '<uuid>', true);
--   SET LOCAL ROLE app_user;
-- app_user não é dono das tabelas, então o RLS vale. Sem app.user_id, nada é visível.
-- As tabelas de autenticação não têm grant para app_user.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN NOINHERIT;
  END IF;
END
$$;
GRANT app_user TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO app_user;

CREATE FUNCTION app_current_user_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION app_current_user_id() TO app_user;

GRANT SELECT, UPDATE ON "profiles" TO app_user;
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_owner" ON "profiles" FOR ALL TO app_user
  USING (id = app_current_user_id()) WITH CHECK (id = app_current_user_id());

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounts', 'categories', 'credit_cards', 'credit_card_invoices',
    'recurring_transactions', 'import_batches', 'transactions',
    'budgets', 'financial_goals'
  ]
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_user', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO app_user
         USING (user_id = app_current_user_id())
         WITH CHECK (user_id = app_current_user_id())',
      t || '_owner', t
    );
  END LOOP;
END
$$;
