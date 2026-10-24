import { describe, expect, it } from "vitest";

import {
  accountDelta,
  balanceSeries,
  cardOutstanding,
  computeBalance,
  expensesByCategory,
  filterByRange,
  monthlyTotals,
  netWorthAt,
  summarize,
  type LedgerEntry,
} from "@/domain/ledger";

const CHECKING = "acc-checking";
const SAVINGS = "acc-savings";
const CARD = "card-1";

function entry(partial: Partial<LedgerEntry> & Pick<LedgerEntry, "kind" | "amount_cents">): LedgerEntry {
  return {
    status: "paid",
    occurred_on: "2026-10-10",
    account_id: CHECKING,
    destination_account_id: null,
    credit_card_id: null,
    category_id: null,
    ...partial,
  };
}

describe("saldo de conta", () => {
  it("soma saldo inicial, receitas e despesas", () => {
    const entries = [
      entry({ kind: "income", amount_cents: 500000 }),
      entry({ kind: "expense", amount_cents: 12345 }),
      entry({ kind: "refund", amount_cents: 2345 }),
    ];
    expect(computeBalance(10000, entries, CHECKING)).toBe(10000 + 500000 - 12345 + 2345);
  });

  it("ignora lançamentos pendentes", () => {
    const entries = [entry({ kind: "expense", amount_cents: 9999, status: "pending" })];
    expect(computeBalance(0, entries, CHECKING)).toBe(0);
  });

  it("transferência sai de uma conta e entra na outra, sem mudar o total", () => {
    const transfer = entry({ kind: "transfer", amount_cents: 30000, destination_account_id: SAVINGS });
    expect(accountDelta(transfer, CHECKING)).toBe(-30000);
    expect(accountDelta(transfer, SAVINGS)).toBe(30000);
    expect(accountDelta(transfer, "outra")).toBe(0);
  });

  it("compra no cartão não mexe no saldo da conta", () => {
    const purchase = entry({ kind: "expense", amount_cents: 15000, account_id: null, credit_card_id: CARD });
    expect(accountDelta(purchase, CHECKING)).toBe(0);
  });

  it("pagamento de fatura sai da conta", () => {
    const payment = entry({ kind: "invoice_payment", amount_cents: 15000, credit_card_id: CARD });
    expect(accountDelta(payment, CHECKING)).toBe(-15000);
  });
});

describe("resumo do período", () => {
  it("transferências e pagamentos de fatura não são receita nem despesa", () => {
    const entries = [
      entry({ kind: "income", amount_cents: 100000 }),
      entry({ kind: "transfer", amount_cents: 50000, destination_account_id: SAVINGS }),
      entry({ kind: "expense", amount_cents: 20000, account_id: null, credit_card_id: CARD }),
      entry({ kind: "invoice_payment", amount_cents: 20000, credit_card_id: CARD }),
    ];
    const s = summarize(entries);
    expect(s.incomeCents).toBe(100000);
    // A compra no cartão é a única despesa; o pagamento da fatura não duplica.
    expect(s.netExpenseCents).toBe(20000);
    expect(s.resultCents).toBe(80000);
    expect(s.savingsRate).toBeCloseTo(0.8);
  });

  it("estorno reduz a despesa", () => {
    const s = summarize([
      entry({ kind: "expense", amount_cents: 10000 }),
      entry({ kind: "refund", amount_cents: 4000 }),
    ]);
    expect(s.expenseCents).toBe(10000);
    expect(s.refundCents).toBe(4000);
    expect(s.netExpenseCents).toBe(6000);
    expect(s.savingsRate).toBeNull();
  });

  it("pendentes só entram quando pedido", () => {
    const entries = [entry({ kind: "expense", amount_cents: 7000, status: "pending" })];
    expect(summarize(entries).netExpenseCents).toBe(0);
    expect(summarize(entries, { includePending: true }).netExpenseCents).toBe(7000);
  });

  it("agrupa despesas por categoria descontando estornos", () => {
    const totals = expensesByCategory([
      entry({ kind: "expense", amount_cents: 10000, category_id: "food" }),
      entry({ kind: "expense", amount_cents: 3000, category_id: "fun" }),
      entry({ kind: "refund", amount_cents: 2500, category_id: "food" }),
      entry({ kind: "income", amount_cents: 99999, category_id: "salary" }),
    ]);
    expect(totals).toEqual([
      { categoryId: "food", cents: 7500 },
      { categoryId: "fun", cents: 3000 },
    ]);
  });

  it("separa totais por mês", () => {
    const series = monthlyTotals(
      [
        entry({ kind: "income", amount_cents: 1000, occurred_on: "2026-09-30" }),
        entry({ kind: "expense", amount_cents: 400, occurred_on: "2026-10-01" }),
        entry({ kind: "expense", amount_cents: 100, occurred_on: "2026-12-01" }),
      ],
      ["2026-09", "2026-10"],
    );
    expect(series).toEqual([
      { month: "2026-09", incomeCents: 1000, expenseCents: 0, resultCents: 1000 },
      { month: "2026-10", incomeCents: 0, expenseCents: 400, resultCents: -400 },
    ]);
  });

  it("filtra por intervalo de datas", () => {
    const entries = [
      entry({ kind: "income", amount_cents: 1, occurred_on: "2026-09-30" }),
      entry({ kind: "income", amount_cents: 2, occurred_on: "2026-10-01" }),
      entry({ kind: "income", amount_cents: 3, occurred_on: "2026-10-31" }),
    ];
    expect(filterByRange(entries, { from: "2026-10-01", to: "2026-10-31" }).map((e) => e.amount_cents)).toEqual([2, 3]);
  });
});

describe("cartão", () => {
  it("saldo devedor = compras - estornos - pagamentos", () => {
    const entries = [
      entry({ kind: "expense", amount_cents: 30000, account_id: null, credit_card_id: CARD }),
      entry({ kind: "refund", amount_cents: 5000, account_id: null, credit_card_id: CARD }),
      entry({ kind: "invoice_payment", amount_cents: 10000, credit_card_id: CARD }),
      entry({ kind: "invoice_payment", amount_cents: 99999, credit_card_id: CARD, status: "pending" }),
    ];
    expect(cardOutstanding(entries, CARD)).toBe(15000);
  });
});

describe("evolução do saldo", () => {
  it("reconstrói o saldo diário a partir do saldo atual", () => {
    const accounts = new Set([CHECKING, SAVINGS]);
    const entries = [
      entry({ kind: "income", amount_cents: 1000, occurred_on: "2026-10-02" }),
      entry({ kind: "expense", amount_cents: 300, occurred_on: "2026-10-03" }),
      // Transferência entre contas incluídas não muda o total.
      entry({ kind: "transfer", amount_cents: 500, occurred_on: "2026-10-03", destination_account_id: SAVINGS }),
      // Depois do período: precisa ser descontado do saldo atual.
      entry({ kind: "expense", amount_cents: 200, occurred_on: "2026-10-05" }),
    ];
    // Saldo atual 1500 => antes de tudo era 1500 + 200 + 300 - 1000 = 1000.
    const series = balanceSeries(1500, entries, accounts, { from: "2026-10-01", to: "2026-10-04" });
    expect(series).toEqual([
      { date: "2026-10-01", balanceCents: 1000 },
      { date: "2026-10-02", balanceCents: 2000 },
      { date: "2026-10-03", balanceCents: 1700 },
      { date: "2026-10-04", balanceCents: 1700 },
    ]);
  });
});

describe("patrimônio", () => {
  it("desconta o que aconteceu depois de cada data", () => {
    const accounts = new Set([CHECKING]);
    const entries = [
      entry({ kind: "income", amount_cents: 1000, occurred_on: "2026-10-05" }),
      entry({ kind: "expense", amount_cents: 300, occurred_on: "2026-10-06", account_id: null, credit_card_id: CARD }),
      entry({ kind: "invoice_payment", amount_cents: 300, occurred_on: "2026-11-10", credit_card_id: CARD }),
    ];
    // Hoje: conta 700 (1000 - 300 pagos), cartão 0.
    const points = netWorthAt(["2026-10-04", "2026-10-31", "2026-11-30"], { accountsCents: 700, cardDebtCents: 0 }, entries, accounts);
    expect(points.map((p) => [p.accountsCents, p.cardDebtCents, p.netWorthCents])).toEqual([
      [0, 0, 0],
      [1000, 300, 700],
      [700, 0, 700],
    ]);
  });
});
