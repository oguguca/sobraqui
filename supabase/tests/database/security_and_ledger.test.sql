-- Testes de banco (pgTAP). Rode com: npx supabase test db  (exige Docker).
-- Cobrem isolamento entre usuários (RLS + FKs compostas), regras de
-- lançamento e as views de saldo.
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

-- Usuários de teste --------------------------------------------------------
insert into auth.users (id, email, aud, role)
values
  ('11111111-1111-1111-1111-111111111111', 'ana@example.test', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'bia@example.test', 'authenticated', 'authenticated');

select is(
  (select count(*)::int from public.categories where user_id = '11111111-1111-1111-1111-111111111111'),
  13,
  'novo usuário recebe as categorias iniciais'
);
select is(
  (select count(*)::int from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  1,
  'novo usuário recebe um perfil'
);

-- Como Ana -----------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.accounts (id, name, type, initial_balance_cents) values
  ('a0000000-0000-0000-0000-000000000001', 'Corrente Ana', 'checking', 100000),
  ('a0000000-0000-0000-0000-000000000002', 'Poupança Ana', 'savings', 0);
insert into public.credit_cards (id, name, limit_cents, closing_day, due_day)
values ('c0000000-0000-0000-0000-000000000001', 'Cartão Ana', 500000, 10, 17);
insert into public.credit_card_invoices (id, credit_card_id, reference_month, closing_date, due_date)
values ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '2026-10-01', '2026-10-10', '2026-10-17');

insert into public.transactions (kind, amount_cents, occurred_on, description, account_id) values
  ('income', 500000, '2026-10-01', 'Salário', 'a0000000-0000-0000-0000-000000000001'),
  ('expense', 12345, '2026-10-02', 'Mercado', 'a0000000-0000-0000-0000-000000000001');
insert into public.transactions (kind, status, amount_cents, occurred_on, description, account_id)
values ('expense', 'pending', 99999, '2026-10-20', 'Aluguel', 'a0000000-0000-0000-0000-000000000001');
insert into public.transactions (kind, amount_cents, occurred_on, description, account_id, destination_account_id)
values ('transfer', 50000, '2026-10-03', 'Guardar', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002');
insert into public.transactions (kind, amount_cents, occurred_on, description, credit_card_id, invoice_id) values
  ('expense', 30000, '2026-10-05', 'Loja', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001'),
  ('refund', 5000, '2026-10-06', 'Estorno loja', 'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001');
insert into public.transactions (kind, amount_cents, occurred_on, description, account_id, credit_card_id, invoice_id)
values ('invoice_payment', 25000, '2026-10-15', 'Pagamento fatura', 'a0000000-0000-0000-0000-000000000001',
        'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001');

-- Saldo: 100000 + 500000 - 12345 - 50000 (transferência) - 25000 (fatura). Pendente não conta.
select is(
  (select balance_cents from public.account_balances where account_id = 'a0000000-0000-0000-0000-000000000001'),
  512655::bigint,
  'saldo da conta corrente considera receitas, despesas, transferências e pagamento de fatura'
);
select is(
  (select balance_cents from public.account_balances where account_id = 'a0000000-0000-0000-0000-000000000002'),
  50000::bigint,
  'transferência entra na conta de destino'
);
select is(
  (select charges_cents - refunds_cents from public.invoice_totals where invoice_id = 'f0000000-0000-0000-0000-000000000001'),
  25000::bigint,
  'fatura = compras - estornos'
);
select is(
  (select paid_cents from public.invoice_totals where invoice_id = 'f0000000-0000-0000-0000-000000000001'),
  25000::bigint,
  'pagamento abate a fatura'
);
select is(
  (select used_cents from public.credit_card_usage where credit_card_id = 'c0000000-0000-0000-0000-000000000001'),
  0::bigint,
  'limite comprometido volta a zero depois do pagamento'
);

-- Regras de formato do lançamento
select throws_ok(
  $$insert into public.transactions (kind, amount_cents, occurred_on, description, account_id, destination_account_id)
    values ('transfer', 100, '2026-10-01', 'x', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001')$$,
  '23514', null, 'transferência para a mesma conta é recusada'
);
select throws_ok(
  $$insert into public.transactions (kind, amount_cents, occurred_on, description, credit_card_id)
    values ('expense', 100, '2026-10-01', 'x', 'c0000000-0000-0000-0000-000000000001')$$,
  '23514', null, 'compra no cartão exige fatura'
);
select throws_ok(
  $$insert into public.transactions (kind, amount_cents, occurred_on, description, account_id)
    values ('expense', 0, '2026-10-01', 'x', 'a0000000-0000-0000-0000-000000000001')$$,
  '23514', null, 'valor zero é recusado'
);
select throws_ok(
  $$insert into public.transactions (kind, amount_cents, occurred_on, description, account_id, credit_card_id, invoice_id)
    values ('expense', 100, '2026-10-01', 'x', 'a0000000-0000-0000-0000-000000000001',
            'c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001')$$,
  '23514', null, 'despesa não pode sair da conta e do cartão ao mesmo tempo'
);
select throws_ok(
  $$delete from public.accounts where id = 'a0000000-0000-0000-0000-000000000001'$$,
  '23503', null, 'conta com lançamentos não pode ser excluída'
);

-- Deduplicação: mesma chave duas vezes é recusada; chaves nulas (manuais) não colidem.
insert into public.transactions (kind, amount_cents, occurred_on, description, account_id, dedupe_key)
values ('expense', 100, '2026-10-01', 'Importada', 'a0000000-0000-0000-0000-000000000001', 'ext:acc:x:1');
select throws_ok(
  $$insert into public.transactions (kind, amount_cents, occurred_on, description, account_id, dedupe_key)
    values ('expense', 100, '2026-10-01', 'Importada', 'a0000000-0000-0000-0000-000000000001', 'ext:acc:x:1')$$,
  '23505', null, 'chave de deduplicação repetida é recusada'
);
select lives_ok(
  $$insert into public.transactions (kind, amount_cents, occurred_on, description, account_id) values
    ('expense', 100, '2026-10-01', 'Igual', 'a0000000-0000-0000-0000-000000000001'),
    ('expense', 100, '2026-10-01', 'Igual', 'a0000000-0000-0000-0000-000000000001')$$,
  'lançamentos manuais idênticos coexistem'
);

-- Como Bia -----------------------------------------------------------------
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*)::int from public.accounts), 0, 'Bia não vê contas da Ana');
select is((select count(*)::int from public.transactions), 0, 'Bia não vê transações da Ana');
select is((select count(*)::int from public.account_balances), 0, 'views de saldo respeitam o RLS');
select is((select count(*)::int from public.categories), 13, 'Bia vê só as próprias categorias');

select throws_ok(
  $$insert into public.transactions (kind, amount_cents, occurred_on, description, account_id)
    values ('income', 100, '2026-10-01', 'invasão', 'a0000000-0000-0000-0000-000000000001')$$,
  '23503', null, 'Bia não consegue lançar na conta da Ana (FK composta)'
);
select throws_ok(
  $$insert into public.accounts (user_id, name, type)
    values ('11111111-1111-1111-1111-111111111111', 'Conta falsa', 'checking')$$,
  '42501', null, 'Bia não consegue criar registro em nome da Ana'
);

update public.accounts set name = 'Hackeada' where id = 'a0000000-0000-0000-0000-000000000001';
delete from public.transactions where account_id = 'a0000000-0000-0000-0000-000000000001';

-- Volta a Ana para conferir que nada mudou.
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select is(
  (select name from public.accounts where id = 'a0000000-0000-0000-0000-000000000001'),
  'Corrente Ana',
  'update da Bia não alterou a conta da Ana'
);
select ok(
  (select count(*) from public.transactions where account_id = 'a0000000-0000-0000-0000-000000000001') > 0,
  'delete da Bia não apagou transações da Ana'
);

-- Visitante anônimo ----------------------------------------------------------
reset role;
set local role anon;
select throws_ok($$select count(*) from public.accounts$$, '42501', null, 'anon não lê contas');
select throws_ok($$select count(*) from public.transactions$$, '42501', null, 'anon não lê transações');

select * from finish();
rollback;
