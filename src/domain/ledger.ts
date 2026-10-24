import type { DateRange, ISODate, ISOMonth } from "./dates";
import { addDays, isWithin, monthOf } from "./dates";

// Regras contábeis do sistema. Espelham a view `account_balances` do banco.
//
// | tipo            | conta origem | conta destino | cartão          | relatório      |
// |-----------------|--------------|---------------|-----------------|----------------|
// | income          | +valor       |               |                 | receita        |
// | expense         | -valor       |               | +fatura         | despesa        |
// | refund          | +valor       |               | -fatura         | reduz despesa  |
// | transfer        | -valor       | +valor        |                 | não entra      |
// | invoice_payment | -valor       |               | -saldo devedor  | não entra      |
//
// A despesa do cartão é reconhecida na compra (por parcela). O pagamento da
// fatura só move dinheiro da conta para o cartão, por isso não é despesa.

export type TransactionKind = "income" | "expense" | "refund" | "transfer" | "invoice_payment";
export type TransactionStatus = "paid" | "pending";

export type LedgerEntry = {
  kind: TransactionKind;
  status: TransactionStatus;
  amount_cents: number;
  occurred_on: ISODate;
  account_id: string | null;
  destination_account_id: string | null;
  credit_card_id: string | null;
  category_id: string | null;
};

/** Efeito do lançamento no saldo de uma conta. Pendentes não mexem no saldo. */
export function accountDelta(entry: LedgerEntry, accountId: string): number {
  if (entry.status !== "paid") return 0;
  const { kind, amount_cents: amount } = entry;
  if (entry.account_id === accountId) {
    if (kind === "income" || kind === "refund") return amount;
    if (kind === "expense" || kind === "invoice_payment" || kind === "transfer") return -amount;
  }
  if (kind === "transfer" && entry.destination_account_id === accountId) return amount;
  return 0;
}

/** Efeito no total de todas as contas selecionadas (transferências internas se anulam). */
export function totalDelta(entry: LedgerEntry, accountIds: ReadonlySet<string>): number {
  let delta = 0;
  if (entry.account_id && accountIds.has(entry.account_id)) {
    delta += accountDelta(entry, entry.account_id);
  }
  if (
    entry.destination_account_id &&
    entry.destination_account_id !== entry.account_id &&
    accountIds.has(entry.destination_account_id)
  ) {
    delta += accountDelta(entry, entry.destination_account_id);
  }
  return delta;
}

export function computeBalance(
  initialBalanceCents: number,
  entries: readonly LedgerEntry[],
  accountId: string,
): number {
  return entries.reduce((sum, e) => sum + accountDelta(e, accountId), initialBalanceCents);
}

/** Saldo devedor do cartão: compras - estornos - pagamentos efetivados. */
export function cardOutstanding(entries: readonly LedgerEntry[], cardId: string): number {
  let total = 0;
  for (const e of entries) {
    if (e.credit_card_id !== cardId) continue;
    if (e.kind === "expense") total += e.amount_cents;
    else if (e.kind === "refund") total -= e.amount_cents;
    else if (e.kind === "invoice_payment" && e.status === "paid") total -= e.amount_cents;
  }
  return total;
}

export type PeriodSummary = {
  incomeCents: number;
  /** Despesas brutas (conta + cartão). */
  expenseCents: number;
  refundCents: number;
  /** Despesas menos estornos. */
  netExpenseCents: number;
  resultCents: number;
  /** Fração da receita que sobrou; null sem receita. */
  savingsRate: number | null;
};

export type SummaryOptions = {
  /** Considera lançamentos pendentes (previstos). Padrão: só efetivados. */
  includePending?: boolean;
};

/** Receitas e despesas do conjunto. Transferências e pagamentos de fatura não entram. */
export function summarize(
  entries: readonly LedgerEntry[],
  options: SummaryOptions = {},
): PeriodSummary {
  let income = 0;
  let expense = 0;
  let refund = 0;
  for (const e of entries) {
    if (!options.includePending && e.status !== "paid") continue;
    if (e.kind === "income") income += e.amount_cents;
    else if (e.kind === "expense") expense += e.amount_cents;
    else if (e.kind === "refund") refund += e.amount_cents;
  }
  const netExpense = expense - refund;
  const result = income - netExpense;
  return {
    incomeCents: income,
    expenseCents: expense,
    refundCents: refund,
    netExpenseCents: netExpense,
    resultCents: result,
    savingsRate: income > 0 ? result / income : null,
  };
}

export function filterByRange<T extends { occurred_on: ISODate }>(
  entries: readonly T[],
  range: DateRange,
): T[] {
  return entries.filter((e) => isWithin(e.occurred_on, range));
}

export type CategoryTotal = { categoryId: string | null; cents: number };

/** Despesa líquida por categoria (estornos abatem a própria categoria). */
export function expensesByCategory(
  entries: readonly LedgerEntry[],
  options: SummaryOptions = {},
): CategoryTotal[] {
  const totals = new Map<string | null, number>();
  for (const e of entries) {
    if (!options.includePending && e.status !== "paid") continue;
    const sign = e.kind === "expense" ? 1 : e.kind === "refund" ? -1 : 0;
    if (sign === 0) continue;
    totals.set(e.category_id, (totals.get(e.category_id) ?? 0) + sign * e.amount_cents);
  }
  return [...totals]
    .map(([categoryId, cents]) => ({ categoryId, cents }))
    .filter((t) => t.cents > 0)
    .sort((a, b) => b.cents - a.cents);
}

export type MonthlyTotals = {
  month: ISOMonth;
  incomeCents: number;
  expenseCents: number;
  resultCents: number;
};

export function monthlyTotals(
  entries: readonly LedgerEntry[],
  months: readonly ISOMonth[],
  options: SummaryOptions = {},
): MonthlyTotals[] {
  const buckets = new Map<ISOMonth, LedgerEntry[]>(months.map((m) => [m, []]));
  for (const e of entries) buckets.get(monthOf(e.occurred_on))?.push(e);
  return months.map((month) => {
    const s = summarize(buckets.get(month) ?? [], options);
    return {
      month,
      incomeCents: s.incomeCents,
      expenseCents: s.netExpenseCents,
      resultCents: s.resultCents,
    };
  });
}

export type BalancePoint = { date: ISODate; balanceCents: number };

/**
 * Evolução diária do saldo das contas no período, reconstruída a partir do
 * saldo atual: saldo(d) = saldo atual - efeito de tudo que ocorreu depois de d.
 * `entries` precisa conter todos os lançamentos efetivados posteriores a `range.from`.
 */
export function balanceSeries(
  currentBalanceCents: number,
  entries: readonly LedgerEntry[],
  accountIds: ReadonlySet<string>,
  range: DateRange,
): BalancePoint[] {
  const deltaByDate = new Map<ISODate, number>();
  let afterRange = 0;
  for (const e of entries) {
    const d = totalDelta(e, accountIds);
    if (d === 0) continue;
    if (e.occurred_on > range.to) afterRange += d;
    else if (e.occurred_on >= range.from) {
      deltaByDate.set(e.occurred_on, (deltaByDate.get(e.occurred_on) ?? 0) + d);
    }
  }

  const days: ISODate[] = [];
  for (let d = range.from; d <= range.to && days.length < 4000; d = addDays(d, 1)) days.push(d);

  // Saldo no fim de cada dia, de trás para frente.
  const points: BalancePoint[] = new Array(days.length);
  let balance = currentBalanceCents - afterRange;
  for (let i = days.length - 1; i >= 0; i--) {
    points[i] = { date: days[i], balanceCents: balance };
    balance -= deltaByDate.get(days[i]) ?? 0;
  }
  return points;
}

/** Variação relativa entre dois valores; null quando a base é zero. */
export function relativeChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/** Efeito no saldo devedor do cartão (compras aumentam, estornos e pagamentos reduzem). */
export function cardDelta(entry: LedgerEntry): number {
  if (!entry.credit_card_id) return 0;
  if (entry.kind === "expense") return entry.amount_cents;
  if (entry.kind === "refund") return -entry.amount_cents;
  if (entry.kind === "invoice_payment" && entry.status === "paid") return -entry.amount_cents;
  return 0;
}

export type NetWorthPoint = { date: ISODate; accountsCents: number; cardDebtCents: number; netWorthCents: number };

/**
 * Patrimônio simplificado em cada data: saldo das contas menos o saldo devedor
 * dos cartões (inclui parcelas futuras já lançadas). Reconstruído a partir dos
 * valores atuais descontando o que aconteceu depois de cada data.
 */
export function netWorthAt(
  dates: readonly ISODate[],
  current: { accountsCents: number; cardDebtCents: number },
  entries: readonly LedgerEntry[],
  accountIds: ReadonlySet<string>,
): NetWorthPoint[] {
  return dates.map((date) => {
    let accounts = current.accountsCents;
    let debt = current.cardDebtCents;
    for (const e of entries) {
      if (e.occurred_on <= date) continue;
      accounts -= totalDelta(e, accountIds);
      debt -= cardDelta(e);
    }
    return { date, accountsCents: accounts, cardDebtCents: debt, netWorthCents: accounts - debt };
  });
}
