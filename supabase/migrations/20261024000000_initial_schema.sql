-- Sobraqui: esquema inicial.
--
-- Convenções:
-- * Valores monetários em centavos (bigint). Nunca ponto flutuante.
-- * Datas de competência em `date` (sem fuso); instantes técnicos em `timestamptz`.
-- * Toda tabela de domínio tem `user_id` e RLS restrita a `auth.uid()`.
-- * Chaves estrangeiras compostas (user_id, id) garantem que um registro só
--   referencie registros do mesmo usuário, mesmo que a aplicação erre.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.account_type as enum (
  'checking',    -- conta corrente
  'payment',     -- conta de pagamento
  'cash',        -- dinheiro em espécie
  'savings',     -- poupança
  'investment',  -- investimentos
  'other'
);

create type public.category_kind as enum ('income', 'expense', 'transfer');

-- income:          entrada em conta.
-- expense:         saída de conta ou compra no cartão.
-- refund:          estorno; reduz despesa, entra em conta ou abate fatura.
-- transfer:        movimentação entre contas próprias; não é receita nem despesa.
-- invoice_payment: pagamento de fatura; sai da conta, quita o cartão;
--                  não é despesa (a despesa já foi a compra no cartão).
create type public.transaction_kind as enum (
  'income', 'expense', 'refund', 'transfer', 'invoice_payment'
);

create type public.transaction_status as enum ('paid', 'pending');

create type public.recurrence_frequency as enum ('weekly', 'monthly', 'yearly');

create type public.import_format as enum (
  'nubank_account_csv', 'nubank_card_csv', 'ofx', 'generic_csv'
);

create type public.import_status as enum ('completed', 'undone');

create type public.goal_kind as enum ('emergency', 'purchase', 'debt', 'other');

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  timezone text not null default 'America/Sao_Paulo',
  currency char(3) not null default 'BRL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contas
-- ---------------------------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  type public.account_type not null,
  institution text check (char_length(institution) <= 80),
  currency char(3) not null default 'BRL',
  initial_balance_cents bigint not null default 0,
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create index accounts_user_idx on public.accounts (user_id) where archived_at is null;

-- ---------------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind public.category_kind not null,
  icon text not null default 'circle' check (char_length(icon) <= 40),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create unique index categories_user_kind_name_key
  on public.categories (user_id, kind, lower(name));

-- ---------------------------------------------------------------------------
-- Cartões de crédito e faturas
-- ---------------------------------------------------------------------------

create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  brand text check (char_length(brand) <= 40),
  limit_cents bigint not null check (limit_cents >= 0),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  payment_account_id uuid,
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, payment_account_id)
    references public.accounts (user_id, id) on delete set null (payment_account_id)
);

create index credit_cards_user_idx on public.credit_cards (user_id);

create table public.credit_card_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  credit_card_id uuid not null,
  -- Primeiro dia do mês em que a fatura fecha.
  reference_month date not null check (extract(day from reference_month) = 1),
  closing_date date not null,
  due_date date not null check (due_date >= closing_date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (credit_card_id, reference_month),
  foreign key (user_id, credit_card_id)
    references public.credit_cards (user_id, id) on delete cascade
);

create index credit_card_invoices_user_due_idx
  on public.credit_card_invoices (user_id, due_date);

-- ---------------------------------------------------------------------------
-- Recorrências
-- ---------------------------------------------------------------------------

create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.transaction_kind not null check (kind in ('income', 'expense')),
  description text not null check (char_length(description) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0),
  category_id uuid,
  account_id uuid not null,
  frequency public.recurrence_frequency not null default 'monthly',
  start_on date not null,
  end_on date check (end_on is null or end_on >= start_on),
  -- Próxima ocorrência ainda não materializada como transação.
  next_occurrence_on date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete set null (category_id),
  foreign key (user_id, account_id)
    references public.accounts (user_id, id) on delete cascade
);

create index recurring_transactions_due_idx
  on public.recurring_transactions (user_id, next_occurrence_on) where active;

-- ---------------------------------------------------------------------------
-- Importações
-- ---------------------------------------------------------------------------

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  format public.import_format not null,
  file_name text not null check (char_length(file_name) <= 255),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  account_id uuid,
  credit_card_id uuid,
  invoice_id uuid,
  total_rows integer not null default 0 check (total_rows >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  -- Somente metadados de erros (linha, motivo). Nunca o conteúdo do arquivo.
  errors jsonb not null default '[]'::jsonb,
  status public.import_status not null default 'completed',
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  check (num_nonnulls(account_id, credit_card_id) = 1),
  foreign key (user_id, account_id)
    references public.accounts (user_id, id) on delete cascade,
  foreign key (user_id, credit_card_id)
    references public.credit_cards (user_id, id) on delete cascade,
  foreign key (user_id, invoice_id)
    references public.credit_card_invoices (user_id, id) on delete set null (invoice_id)
);

create index import_batches_user_created_idx
  on public.import_batches (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Transações
-- ---------------------------------------------------------------------------

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.transaction_kind not null,
  status public.transaction_status not null default 'paid',
  amount_cents bigint not null check (amount_cents > 0),
  -- Data em que a movimentação aconteceu (ou vence, se pendente).
  occurred_on date not null,
  description text not null check (char_length(description) between 1 and 200),
  notes text check (char_length(notes) <= 2000),
  category_id uuid,
  account_id uuid,
  destination_account_id uuid,
  credit_card_id uuid,
  invoice_id uuid,
  installment_group_id uuid,
  installment_number smallint,
  installment_total smallint,
  recurring_transaction_id uuid,
  import_batch_id uuid,
  -- Identificador fornecido pelo banco (FITID no OFX, "Identificador" no CSV do Nubank).
  external_id text check (char_length(external_id) <= 255),
  -- Chave de deduplicação de importação, calculada no servidor.
  dedupe_key text check (char_length(dedupe_key) <= 512),
  -- created_at é a data de cadastro/importação; occurred_on é a data do fato.
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete set null (category_id),
  foreign key (user_id, account_id)
    references public.accounts (user_id, id) on delete restrict,
  foreign key (user_id, destination_account_id)
    references public.accounts (user_id, id) on delete restrict,
  foreign key (user_id, credit_card_id)
    references public.credit_cards (user_id, id) on delete restrict,
  foreign key (user_id, invoice_id)
    references public.credit_card_invoices (user_id, id) on delete restrict,
  foreign key (user_id, recurring_transaction_id)
    references public.recurring_transactions (user_id, id) on delete set null (recurring_transaction_id),
  foreign key (user_id, import_batch_id)
    references public.import_batches (user_id, id) on delete restrict,

  -- Regras por tipo de lançamento.
  constraint transactions_kind_shape check (
    case kind
      when 'income' then
        account_id is not null and destination_account_id is null
        and credit_card_id is null and invoice_id is null
      when 'expense' then
        destination_account_id is null
        and num_nonnulls(account_id, credit_card_id) = 1
        and (credit_card_id is null) = (invoice_id is null)
      when 'refund' then
        destination_account_id is null
        and num_nonnulls(account_id, credit_card_id) = 1
        and (credit_card_id is null) = (invoice_id is null)
      when 'transfer' then
        account_id is not null and destination_account_id is not null
        and account_id <> destination_account_id
        and credit_card_id is null and invoice_id is null
      when 'invoice_payment' then
        account_id is not null and destination_account_id is null
        and credit_card_id is not null and invoice_id is not null
    end
  ),
  -- Compras no cartão são sempre efetivadas; o que fica pendente é a fatura.
  constraint transactions_card_status check (
    credit_card_id is null or kind = 'invoice_payment' or status = 'paid'
  ),
  constraint transactions_installments check (
    (installment_group_id is null and installment_number is null and installment_total is null)
    or (
      installment_group_id is not null
      and installment_total between 2 and 72
      and installment_number between 1 and installment_total
    )
  )
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_account_idx on public.transactions (account_id) where account_id is not null;
create index transactions_destination_idx on public.transactions (destination_account_id)
  where destination_account_id is not null;
create index transactions_card_idx on public.transactions (credit_card_id) where credit_card_id is not null;
create index transactions_invoice_idx on public.transactions (invoice_id) where invoice_id is not null;
create index transactions_category_idx on public.transactions (category_id) where category_id is not null;
create index transactions_import_idx on public.transactions (import_batch_id) where import_batch_id is not null;
create index transactions_installment_group_idx on public.transactions (installment_group_id)
  where installment_group_id is not null;
-- Índices únicos sem WHERE (NULLs são distintos), para servirem de alvo a
-- ON CONFLICT via PostgREST. Lançamentos manuais têm dedupe_key nulo.
create unique index transactions_dedupe_key
  on public.transactions (user_id, dedupe_key);
-- Torna a materialização de recorrências idempotente.
create unique index transactions_recurring_occurrence_key
  on public.transactions (recurring_transaction_id, occurred_on);

-- ---------------------------------------------------------------------------
-- Orçamentos e metas
-- ---------------------------------------------------------------------------

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  month date not null check (extract(day from month) = 1),
  limit_cents bigint not null check (limit_cents > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month),
  foreign key (user_id, category_id)
    references public.categories (user_id, id) on delete cascade
);

create table public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind public.goal_kind not null default 'other',
  target_cents bigint not null check (target_cents > 0),
  saved_cents bigint not null default 0 check (saved_cents >= 0),
  target_date date,
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index financial_goals_user_idx on public.financial_goals (user_id);

-- ---------------------------------------------------------------------------
-- Gatilhos de updated_at
-- ---------------------------------------------------------------------------

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger credit_cards_updated_at before update on public.credit_cards
  for each row execute function public.set_updated_at();
create trigger credit_card_invoices_updated_at before update on public.credit_card_invoices
  for each row execute function public.set_updated_at();
create trigger recurring_transactions_updated_at before update on public.recurring_transactions
  for each row execute function public.set_updated_at();
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();
create trigger budgets_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();
create trigger financial_goals_updated_at before update on public.financial_goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Views de saldo (security_invoker: aplicam o RLS de quem consulta)
-- ---------------------------------------------------------------------------

-- Saldo atual = saldo inicial + efeito das movimentações efetivadas.
create view public.account_balances
with (security_invoker = true) as
select
  a.id as account_id,
  a.user_id,
  a.initial_balance_cents + coalesce(m.delta, 0) as balance_cents
from public.accounts a
left join lateral (
  select sum(
    case
      when t.kind in ('income', 'refund') and t.account_id = a.id then t.amount_cents
      when t.kind in ('expense', 'invoice_payment') and t.account_id = a.id then -t.amount_cents
      when t.kind = 'transfer' and t.account_id = a.id then -t.amount_cents
      when t.kind = 'transfer' and t.destination_account_id = a.id then t.amount_cents
      else 0
    end
  ) as delta
  from public.transactions t
  where t.status = 'paid'
    and (t.account_id = a.id or t.destination_account_id = a.id)
) m on true;

-- Totais por fatura: compras menos estornos, e quanto já foi pago.
create view public.invoice_totals
with (security_invoker = true) as
select
  i.id as invoice_id,
  i.user_id,
  i.credit_card_id,
  coalesce(sum(t.amount_cents) filter (where t.kind = 'expense'), 0) as charges_cents,
  coalesce(sum(t.amount_cents) filter (where t.kind = 'refund'), 0) as refunds_cents,
  coalesce(sum(t.amount_cents) filter (where t.kind = 'invoice_payment' and t.status = 'paid'), 0) as paid_cents
from public.credit_card_invoices i
left join public.transactions t on t.invoice_id = i.id
group by i.id, i.user_id, i.credit_card_id;

-- Limite comprometido = compras - estornos - pagamentos (inclui parcelas futuras).
create view public.credit_card_usage
with (security_invoker = true) as
select
  c.id as credit_card_id,
  c.user_id,
  c.limit_cents,
  coalesce(sum(
    case
      when t.kind = 'expense' then t.amount_cents
      when t.kind = 'refund' then -t.amount_cents
      when t.kind = 'invoice_payment' and t.status = 'paid' then -t.amount_cents
      else 0
    end
  ), 0) as used_cents
from public.credit_cards c
left join public.transactions t on t.credit_card_id = c.id
group by c.id, c.user_id, c.limit_cents;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.credit_cards enable row level security;
alter table public.credit_card_invoices enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.import_batches enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.financial_goals enable row level security;

create policy "profiles: dono lê" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: dono altera" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Mesma política para todas as tabelas com user_id.
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'credit_cards', 'credit_card_invoices',
    'recurring_transactions', 'import_batches', 'transactions',
    'budgets', 'financial_goals'
  ]
  loop
    execute format(
      'create policy "%1$s: somente o dono" on public.%1$I
         for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end;
$$;

-- Privilégios explícitos: anon não acessa nada; authenticated passa pelo RLS.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, delete on public.profiles from authenticated;
grant select on public.account_balances, public.invoice_totals, public.credit_card_usage to authenticated;

-- ---------------------------------------------------------------------------
-- Novo usuário: perfil e categorias iniciais
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);

  insert into public.categories (user_id, name, kind, icon, color) values
    (new.id, 'Alimentação',    'expense',  'utensils',         '#f97316'),
    (new.id, 'Moradia',        'expense',  'house',            '#8b5cf6'),
    (new.id, 'Transporte',     'expense',  'car',              '#0ea5e9'),
    (new.id, 'Saúde',          'expense',  'heart-pulse',      '#ef4444'),
    (new.id, 'Educação',       'expense',  'graduation-cap',   '#6366f1'),
    (new.id, 'Lazer',          'expense',  'party-popper',     '#ec4899'),
    (new.id, 'Assinaturas',    'expense',  'repeat',           '#14b8a6'),
    (new.id, 'Compras',        'expense',  'shopping-bag',     '#eab308'),
    (new.id, 'Outros gastos',  'expense',  'circle',           '#64748b'),
    (new.id, 'Salário',        'income',   'briefcase',        '#16a34a'),
    (new.id, 'Investimentos',  'income',   'trending-up',      '#059669'),
    (new.id, 'Outras receitas','income',   'circle-plus',      '#22c55e'),
    (new.id, 'Transferências', 'transfer', 'arrow-left-right', '#94a3b8');

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
