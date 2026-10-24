// Tipos do banco no formato de `supabase gen types typescript`.
// Escrito a partir de supabase/migrations. Depois de conectar um projeto,
// regenere com `npm run db:types` e confira o diff.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Timestamps = { created_at: string; updated_at: string };
type OptionalTimestamps = { created_at?: string; updated_at?: string };

type AccountRow = {
  id: string;
  user_id: string;
  name: string;
  type: Database["public"]["Enums"]["account_type"];
  institution: string | null;
  currency: string;
  initial_balance_cents: number;
  color: string | null;
  archived_at: string | null;
} & Timestamps;

type CategoryRow = {
  id: string;
  user_id: string;
  name: string;
  kind: Database["public"]["Enums"]["category_kind"];
  icon: string;
  color: string;
  archived_at: string | null;
} & Timestamps;

type CreditCardRow = {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  limit_cents: number;
  closing_day: number;
  due_day: number;
  payment_account_id: string | null;
  color: string | null;
  archived_at: string | null;
} & Timestamps;

type InvoiceRow = {
  id: string;
  user_id: string;
  credit_card_id: string;
  reference_month: string;
  closing_date: string;
  due_date: string;
} & Timestamps;

type RecurringRow = {
  id: string;
  user_id: string;
  kind: Database["public"]["Enums"]["transaction_kind"];
  description: string;
  amount_cents: number;
  category_id: string | null;
  account_id: string;
  frequency: Database["public"]["Enums"]["recurrence_frequency"];
  start_on: string;
  end_on: string | null;
  next_occurrence_on: string;
  active: boolean;
} & Timestamps;

type ImportBatchRow = {
  id: string;
  user_id: string;
  format: Database["public"]["Enums"]["import_format"];
  file_name: string;
  file_sha256: string;
  account_id: string | null;
  credit_card_id: string | null;
  invoice_id: string | null;
  total_rows: number;
  imported_count: number;
  duplicate_count: number;
  skipped_count: number;
  error_count: number;
  errors: Json;
  status: Database["public"]["Enums"]["import_status"];
  undone_at: string | null;
  created_at: string;
};

type TransactionRow = {
  id: string;
  user_id: string;
  kind: Database["public"]["Enums"]["transaction_kind"];
  status: Database["public"]["Enums"]["transaction_status"];
  amount_cents: number;
  occurred_on: string;
  description: string;
  notes: string | null;
  category_id: string | null;
  account_id: string | null;
  destination_account_id: string | null;
  credit_card_id: string | null;
  invoice_id: string | null;
  installment_group_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  recurring_transaction_id: string | null;
  import_batch_id: string | null;
  external_id: string | null;
  dedupe_key: string | null;
} & Timestamps;

type BudgetRow = {
  id: string;
  user_id: string;
  category_id: string;
  month: string;
  limit_cents: number;
} & Timestamps;

type GoalRow = {
  id: string;
  user_id: string;
  name: string;
  kind: Database["public"]["Enums"]["goal_kind"];
  target_cents: number;
  saved_cents: number;
  target_date: string | null;
  color: string | null;
  archived_at: string | null;
} & Timestamps;

type ProfileRow = {
  id: string;
  display_name: string | null;
  timezone: string;
  currency: string;
} & Timestamps;

// Insert: colunas com default ficam opcionais; user_id usa auth.uid().
type InsertOf<Row, Required extends keyof Row> = Pick<Row, Required> &
  Partial<Omit<Row, Required>> &
  OptionalTimestamps;

type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: InsertOf<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  __InternalSupabase: { PostgrestVersion: "13" };
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: never;
        Update: Partial<Pick<ProfileRow, "display_name" | "timezone" | "currency">>;
        Relationships: [];
      };
      accounts: Table<AccountRow, "name" | "type">;
      categories: Table<CategoryRow, "name" | "kind">;
      credit_cards: Table<CreditCardRow, "name" | "limit_cents" | "closing_day" | "due_day">;
      credit_card_invoices: Table<
        InvoiceRow,
        "credit_card_id" | "reference_month" | "closing_date" | "due_date"
      >;
      recurring_transactions: Table<
        RecurringRow,
        "kind" | "description" | "amount_cents" | "account_id" | "start_on" | "next_occurrence_on"
      >;
      import_batches: Omit<
        Table<ImportBatchRow, "format" | "file_name" | "file_sha256">,
        "Insert"
      > & {
        Insert: Pick<ImportBatchRow, "format" | "file_name" | "file_sha256"> &
          Partial<Omit<ImportBatchRow, "format" | "file_name" | "file_sha256">>;
      };
      transactions: Table<TransactionRow, "kind" | "amount_cents" | "occurred_on" | "description">;
      budgets: Table<BudgetRow, "category_id" | "month" | "limit_cents">;
      financial_goals: Table<GoalRow, "name" | "target_cents">;
    };
    Views: {
      account_balances: {
        Row: { account_id: string; user_id: string; balance_cents: number };
        Relationships: [];
      };
      invoice_totals: {
        Row: {
          invoice_id: string;
          user_id: string;
          credit_card_id: string;
          charges_cents: number;
          refunds_cents: number;
          paid_cents: number;
        };
        Relationships: [];
      };
      credit_card_usage: {
        Row: {
          credit_card_id: string;
          user_id: string;
          limit_cents: number;
          used_cents: number;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: {
      account_type: "checking" | "payment" | "cash" | "savings" | "investment" | "other";
      category_kind: "income" | "expense" | "transfer";
      transaction_kind: "income" | "expense" | "refund" | "transfer" | "invoice_payment";
      transaction_status: "paid" | "pending";
      recurrence_frequency: "weekly" | "monthly" | "yearly";
      import_format: "nubank_account_csv" | "nubank_card_csv" | "ofx" | "generic_csv";
      import_status: "completed" | "undone";
      goal_kind: "emergency" | "purchase" | "debt" | "other";
    };
    CompositeTypes: Record<string, never>;
  };
};

type PublicSchema = Database["public"];
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];
