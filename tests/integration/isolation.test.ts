// Testes contra o banco real (Neon). Rodam com: npm run test:integration
// Criam dois usuários descartáveis (@example.test) e apagam tudo no final
// (exclusão em cascata a partir de "users").
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local", quiet: true });

const hasDb = Boolean(process.env.DATABASE_URL);
const { adminDb, withUser, dbDate } = await import("@/server/db");
const { accountBalances, cardUsage } = await import("@/server/queries/core");
const { invoiceTotals } = await import("@/server/queries/cards");
const { sqlState } = await import("@/server/action");

const ANA = crypto.randomUUID();
const BIA = crypto.randomUUID();
const TEST_DOMAIN = "@isolation.example.test";

async function cleanup() {
  await adminDb.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
}

/** Espera falha do banco com o SQLSTATE informado. */
async function expectSqlState(promise: Promise<unknown>, state: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, `esperava erro ${state}`).not.toBeNull();
  expect(sqlState(err)).toBe(state);
}

describe.skipIf(!hasDb)("isolamento e regras no banco", () => {
  let anaChecking = "";
  let anaSavings = "";
  let anaCard = "";
  let anaInvoice = "";

  beforeAll(async () => {
    await cleanup();
    for (const [id, name] of [
      [ANA, "ana"],
      [BIA, "bia"],
    ]) {
      await adminDb.user.create({ data: { id, name, email: `${name}${TEST_DOMAIN}` } });
      await adminDb.profile.create({ data: { id } });
    }

    await withUser(ANA, async (tx) => {
      anaChecking = (
        await tx.bankAccount.create({ data: { user_id: ANA, name: "Corrente", type: "checking", initial_balance_cents: 100_000 } })
      ).id;
      anaSavings = (await tx.bankAccount.create({ data: { user_id: ANA, name: "Poupança", type: "savings" } })).id;
      anaCard = (
        await tx.creditCard.create({ data: { user_id: ANA, name: "Cartão", limit_cents: 500_000, closing_day: 10, due_day: 17 } })
      ).id;
      anaInvoice = (
        await tx.creditCardInvoice.create({
          data: {
            user_id: ANA,
            credit_card_id: anaCard,
            reference_month: dbDate("2026-10-01"),
            closing_date: dbDate("2026-10-10"),
            due_date: dbDate("2026-10-17"),
          },
        })
      ).id;
      const base = { user_id: ANA, occurred_on: dbDate("2026-10-05") };
      await tx.transaction.createMany({
        data: [
          { ...base, kind: "income", amount_cents: 500_000, description: "Salário", account_id: anaChecking },
          { ...base, kind: "expense", amount_cents: 12_345, description: "Mercado", account_id: anaChecking },
          { ...base, kind: "expense", status: "pending", amount_cents: 99_999, description: "Aluguel", account_id: anaChecking },
          {
            ...base,
            kind: "transfer",
            amount_cents: 50_000,
            description: "Guardar",
            account_id: anaChecking,
            destination_account_id: anaSavings,
          },
          { ...base, kind: "expense", amount_cents: 30_000, description: "Loja", credit_card_id: anaCard, invoice_id: anaInvoice },
          { ...base, kind: "refund", amount_cents: 5_000, description: "Estorno", credit_card_id: anaCard, invoice_id: anaInvoice },
          {
            ...base,
            kind: "invoice_payment",
            amount_cents: 25_000,
            description: "Pagamento",
            account_id: anaChecking,
            credit_card_id: anaCard,
            invoice_id: anaInvoice,
          },
        ],
      });
    });
  });

  afterAll(async () => {
    await cleanup();
    await adminDb.$disconnect();
  });

  it("calcula saldos com receitas, despesas, transferências e pagamento de fatura", async () => {
    const balances = await withUser(ANA, (tx) => accountBalances(tx, ANA));
    // 500000 - 12345 - 50000 - 25000; o aluguel pendente não conta.
    expect(100_000 + (balances.get(anaChecking) ?? 0)).toBe(512_655);
    expect(balances.get(anaSavings)).toBe(50_000);
  });

  it("fatura = compras - estornos; o pagamento zera o limite comprometido", async () => {
    const [totals, usage] = await withUser(ANA, async (tx) => [
      await invoiceTotals(tx, ANA, [anaInvoice]),
      await cardUsage(tx, ANA),
    ]);
    expect(totals.get(anaInvoice)).toEqual({ charges_cents: 30_000, refunds_cents: 5_000, paid_cents: 25_000 });
    expect(usage.get(anaCard)).toBe(0);
  });

  it("RLS: sem filtro por usuário, Bia não vê nada da Ana", async () => {
    const [accounts, transactions, cards] = await withUser(BIA, async (tx) => [
      await tx.bankAccount.findMany(),
      await tx.transaction.findMany(),
      await tx.creditCard.findMany(),
    ]);
    expect(accounts).toHaveLength(0);
    expect(transactions).toHaveLength(0);
    expect(cards).toHaveLength(0);
  });

  it("RLS: Bia não altera nem apaga dados da Ana", async () => {
    const updated = await withUser(BIA, (tx) => tx.bankAccount.updateMany({ where: { id: anaChecking }, data: { name: "x" } }));
    const deleted = await withUser(BIA, (tx) => tx.transaction.deleteMany({}));
    expect(updated.count).toBe(0);
    expect(deleted.count).toBe(0);
    const still = await withUser(ANA, (tx) => tx.bankAccount.findFirst({ where: { id: anaChecking } }));
    expect(still?.name).toBe("Corrente");
  });

  it("RLS: Bia não grava em nome da Ana nem usa a conta dela", async () => {
    await expectSqlState(
      withUser(BIA, (tx) => tx.bankAccount.create({ data: { user_id: ANA, name: "Falsa", type: "checking" } })),
      "42501",
    );
    // Com o próprio user_id, a FK composta (user_id, account_id) recusa a conta alheia.
    await expectSqlState(
      withUser(BIA, (tx) =>
        tx.transaction.create({
          data: {
            user_id: BIA,
            kind: "income",
            amount_cents: 100,
            occurred_on: dbDate("2026-10-01"),
            description: "Invasão",
            account_id: anaChecking,
          },
        }),
      ),
      "23503",
    );
  });

  it("sem app.user_id, o role app_user não enxerga linhas", async () => {
    const rows = await adminDb.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE app_user");
      return tx.$queryRawUnsafe<{ n: bigint }[]>("SELECT count(*) AS n FROM transactions");
    });
    expect(Number(rows[0].n)).toBe(0);
  });

  it("app_user não acessa tabelas de autenticação", async () => {
    await expectSqlState(
      withUser(ANA, (tx) => tx.$queryRawUnsafe("SELECT count(*) FROM sessions")),
      "42501",
    );
  });

  it("CHECKs: transferência para a mesma conta e compra no cartão sem fatura são recusadas", async () => {
    const base = { user_id: ANA, amount_cents: 100, occurred_on: dbDate("2026-10-01"), description: "x" };
    await expectSqlState(
      withUser(ANA, (tx) =>
        tx.transaction.create({
          data: { ...base, kind: "transfer", account_id: anaChecking, destination_account_id: anaChecking },
        }),
      ),
      "23514",
    );
    await expectSqlState(
      withUser(ANA, (tx) => tx.transaction.create({ data: { ...base, kind: "expense", credit_card_id: anaCard } })),
      "23514",
    );
  });

  it("forma de pagamento: crédito exige cartão e só vale para saídas", async () => {
    const base = { user_id: ANA, amount_cents: 100, occurred_on: dbDate("2026-10-01"), description: "x" };
    await expectSqlState(
      withUser(ANA, (tx) =>
        tx.transaction.create({ data: { ...base, kind: "expense", payment_method: "credit_card", account_id: anaChecking } }),
      ),
      "23514",
    );
    await expectSqlState(
      withUser(ANA, (tx) => tx.transaction.create({ data: { ...base, kind: "income", payment_method: "pix", account_id: anaChecking } })),
      "23514",
    );
    const ok = await withUser(ANA, (tx) =>
      tx.transaction.create({ data: { ...base, kind: "expense", payment_method: "pix", account_id: anaChecking } }),
    );
    expect(ok.payment_method).toBe("pix");
  });

  it("deduplicação: chave repetida é recusada; lançamentos manuais idênticos coexistem", async () => {
    const base = {
      user_id: ANA,
      kind: "expense" as const,
      amount_cents: 100,
      occurred_on: dbDate("2026-10-01"),
      description: "Igual",
      account_id: anaChecking,
    };
    await withUser(ANA, (tx) => tx.transaction.create({ data: { ...base, dedupe_key: "ext:teste:1" } }));
    await expectSqlState(
      withUser(ANA, (tx) => tx.transaction.create({ data: { ...base, dedupe_key: "ext:teste:1" } })),
      "23505",
    );
    const manual = await withUser(ANA, (tx) => tx.transaction.createMany({ data: [base, base] }));
    expect(manual.count).toBe(2);
  });

  it("conta com lançamentos não pode ser excluída", async () => {
    await expectSqlState(
      withUser(ANA, (tx) => tx.bankAccount.deleteMany({ where: { id: anaChecking } })),
      "23001",
    );
  });
});
