import "server-only";

import { z } from "zod";

import {
  addDays,
  addMonthsToMonth,
  diffDays,
  isISODate,
  isISOMonth,
  monthOf,
  monthRange,
  monthsBetween,
  previousRange,
  type DateRange,
} from "@/domain/dates";
import {
  balanceSeries,
  expensesByCategory,
  filterByRange,
  monthlyTotals,
  relativeChange,
  summarize,
} from "@/domain/ledger";
import type { AuthContext } from "@/server/auth";
import { dbDate } from "@/server/db";

import { currentInvoiceMonth, invoiceTotals, listInvoices, summarizeInvoice } from "./cards";
import type { LedgerContext } from "./context";
import { transactionsBetween } from "./transactions";

export const periodSchema = z.object({
  mes: z.string().refine(isISOMonth).optional().catch(undefined),
  de: z.string().refine(isISODate).optional().catch(undefined),
  ate: z.string().refine(isISODate).optional().catch(undefined),
  conta: z.uuid().optional().catch(undefined),
});

export type Period = { range: DateRange; month: string | null; accountId: string | null };

/** Período escolhido na URL: intervalo de datas, mês, ou o mês atual. */
export function resolvePeriod(params: Record<string, string | string[] | undefined>, today: string): Period {
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const p = periodSchema.parse(flat);
  const accountId = p.conta ?? null;
  if (p.de && p.ate && p.de <= p.ate && diffDays(p.de, p.ate) <= 731) {
    return { range: { from: p.de, to: p.ate }, month: null, accountId };
  }
  const month = p.mes ?? monthOf(today);
  return { range: monthRange(month), month, accountId };
}

const TREND_MONTHS = 6;

export async function loadDashboard(ctx: AuthContext, ledger: LedgerContext, period: Period) {
  const { range, accountId } = period;
  const prev = previousRange(range);
  const today = ledger.today;

  const accounts = accountId
    ? ledger.accounts.filter((a) => a.id === accountId)
    : ledger.activeAccounts;
  const accountIds = new Set(accounts.map((a) => a.id));
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance_cents, 0);

  // Uma única busca cobre o período, o anterior, a tendência e a evolução do saldo.
  const trendStart = addMonthsToMonth(monthOf(range.to), -(TREND_MONTHS - 1));
  const fetchFrom = [prev.from, `${trendStart}-01`].sort()[0];
  const all = await transactionsBetween(ctx, { from: fetchFrom }, { accountId: accountId ?? undefined });

  const current = filterByRange(all, range);
  const previous = filterByRange(all, prev);
  const summary = summarize(current);
  const previousSummary = summarize(previous);
  // Gastos à vista (saíram da conta): débito, Pix, boleto, dinheiro. O cartão fica na fatura.
  const fromAccount = (list: typeof current) => list.filter((t) => !t.credit_card_id);
  const accountSpend = summarize(fromAccount(current)).netExpenseCents;
  const previousAccountSpend = summarize(fromAccount(previous)).netExpenseCents;
  const methodTotals = new Map<string, number>();
  for (const t of fromAccount(current)) {
    if (t.kind !== "expense" || t.status !== "paid") continue;
    const key = t.payment_method ?? "other";
    methodTotals.set(key, (methodTotals.get(key) ?? 0) + t.amount_cents);
  }
  const accountSpendByMethod = [...methodTotals]
    .map(([method, cents]) => ({ method, cents }))
    .sort((a, b) => b.cents - a.cents);

  const months = monthsBetween(trendStart, monthOf(range.to));
  const trend = monthlyTotals(
    all.filter((t) => t.occurred_on <= monthRange(monthOf(range.to)).to),
    months,
  );

  // Evolução do saldo: até hoje, nunca além (o futuro ainda não aconteceu).
  const seriesEnd = range.to < today ? range.to : today;
  const balance =
    range.from <= seriesEnd ? balanceSeries(totalBalance, all, accountIds, { from: range.from, to: seriesEnd }) : [];

  const byCategory = expensesByCategory(current).map((c) => ({
    ...c,
    name: c.categoryId ? (ledger.lookups.categories[c.categoryId]?.name ?? "Sem categoria") : "Sem categoria",
    color: c.categoryId ? (ledger.lookups.categories[c.categoryId]?.color ?? "#94a3b8") : "#94a3b8",
  }));

  const recent = [...all]
    .filter((t) => t.occurred_on <= today)
    .sort((a, b) => (a.occurred_on === b.occurred_on ? b.created_at.localeCompare(a.created_at) : b.occurred_on.localeCompare(a.occurred_on)))
    .slice(0, 9);

  const [upcoming, invoices, goals, billsToPay] = await Promise.all([
    loadUpcoming(ctx, today, accountId),
    accountId ? Promise.resolve([]) : loadOpenInvoices(ctx, ledger, today),
    loadGoals(ctx),
    accountId ? Promise.resolve([]) : loadBillsToPay(ctx, ledger, today),
  ]);

  // Média diária sobre os dias já decorridos do período (período futuro: o período inteiro).
  const elapsedEnd = seriesEnd < range.from ? range.to : seriesEnd;
  const days = diffDays(range.from, elapsedEnd) + 1;
  const expenseCount = current.filter((t) => t.kind === "expense" && t.status === "paid").length;
  const cardExpense = current
    .filter((t) => t.kind === "expense" && t.credit_card_id && t.status === "paid")
    .reduce((s, t) => s + t.amount_cents, 0);

  const cardDebt = accountId ? 0 : ledger.activeCards.reduce((s, c) => s + Math.max(0, c.used_cents), 0);

  return {
    range,
    previousRange: prev,
    totalBalance,
    accounts,
    cards: accountId ? [] : ledger.activeCards,
    summary,
    previousSummary,
    accountSpend,
    accountSpendByMethod,
    billsToPay,
    billsToPayCents: billsToPay.reduce((s, b) => s + b.remainingCents, 0),
    changes: {
      accountSpend: relativeChange(accountSpend, previousAccountSpend),
      income: relativeChange(summary.incomeCents, previousSummary.incomeCents),
      expense: relativeChange(summary.netExpenseCents, previousSummary.netExpenseCents),
      result: relativeChange(summary.resultCents, previousSummary.resultCents),
    },
    trend,
    balance,
    byCategory,
    recent,
    upcoming,
    invoices,
    goals,
    cardDebt,
    habits: {
      dailyAverageCents: Math.round(summary.netExpenseCents / days),
      averageTicketCents: expenseCount > 0 ? Math.round(summary.expenseCents / expenseCount) : null,
      expenseCount,
      cardShare: summary.expenseCents > 0 ? cardExpense / summary.expenseCents : null,
      topCategory: byCategory[0]
        ? { name: byCategory[0].name, share: summary.netExpenseCents > 0 ? byCategory[0].cents / summary.netExpenseCents : 0 }
        : null,
      savingsRate: summary.savingsRate,
    },
    hasAnyData: all.length > 0 || ledger.accounts.length > 0,
  };
}

/** Contas a pagar/receber: pendentes vencidas e dos próximos 15 dias. */
async function loadUpcoming(ctx: AuthContext, today: string, accountId: string | null) {
  const rows = await ctx.db((tx) =>
    tx.transaction.findMany({
      where: {
        user_id: ctx.user.id,
        status: "pending",
        occurred_on: { lte: dbDate(addDays(today, 15)) },
        ...(accountId ? { account_id: accountId } : {}),
      },
      orderBy: { occurred_on: "asc" },
      take: 8,
    }),
  );
  return rows.map((t) => ({ ...t, overdue: t.occurred_on < today }));
}

/** Faturas com saldo em aberto que vencem até 40 dias (ou venceram nos últimos 90). */
async function loadOpenInvoices(ctx: AuthContext, ledger: LedgerContext, today: string) {
  const userId = ctx.user.id;
  const summaries = await ctx.db(async (tx) => {
    const invoices = await tx.creditCardInvoice.findMany({
      where: { user_id: userId, due_date: { lte: dbDate(addDays(today, 40)), gte: dbDate(addDays(today, -90)) } },
      orderBy: { due_date: "asc" },
    });
    const totals = await invoiceTotals(tx, userId, invoices.map((i) => i.id));
    return invoices.map((inv) => summarizeInvoice(inv, totals.get(inv.id), today));
  });
  return summaries
    .map((inv) => ({ ...inv, cardName: ledger.lookups.cards[inv.credit_card_id] ?? "Cartão" }))
    .filter((i) => i.remainingCents > 0);
}

/**
 * O que falta pagar dos cartões: fatura aberta de cada cartão e faturas
 * fechadas ainda não quitadas (inclui vencidas).
 */
async function loadBillsToPay(ctx: AuthContext, ledger: LedgerContext, today: string) {
  const bills = await Promise.all(
    ledger.activeCards.map(async (card) => {
      const invoices = await listInvoices(ctx, card.id, today);
      const openMonth = currentInvoiceMonth(card, today);
      return invoices
        .filter((i) => i.remainingCents > 0 && monthOf(i.reference_month) <= openMonth)
        .map((i) => ({
          cardId: card.id,
          cardName: card.name,
          remainingCents: i.remainingCents,
          dueDate: i.due_date,
          closingDate: i.closing_date,
          status: i.status,
          month: monthOf(i.reference_month),
        }));
    }),
  );
  return bills.flat().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

async function loadGoals(ctx: AuthContext) {
  return ctx.db((tx) =>
    tx.financialGoal.findMany({
      where: { user_id: ctx.user.id, archived_at: null },
      orderBy: [{ target_date: { sort: "asc", nulls: "last" } }, { created_at: "asc" }],
      take: 4,
    }),
  );
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>;
