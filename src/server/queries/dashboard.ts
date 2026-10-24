import "server-only";

import { z } from "zod";

import { invoiceAmount, invoiceStatus } from "@/domain/credit-card";
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

import type { LedgerContext } from "./context";
import { fetchAll } from "./core";
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
    .slice(0, 6);

  const [upcoming, invoices, goals] = await Promise.all([
    loadUpcoming(ctx, today, accountId),
    accountId ? Promise.resolve([]) : loadOpenInvoices(ctx, ledger, today),
    loadGoals(ctx),
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
    changes: {
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
  let q = ctx.supabase
    .from("transactions")
    .select("*")
    .eq("status", "pending")
    .lte("occurred_on", addDays(today, 15))
    .order("occurred_on")
    .limit(8);
  if (accountId) q = q.eq("account_id", accountId);
  const { data } = await q;
  return (data ?? []).map((t) => ({ ...t, overdue: t.occurred_on < today }));
}

/** Faturas com saldo em aberto que vencem até 40 dias (ou já venceram). */
async function loadOpenInvoices(ctx: AuthContext, ledger: LedgerContext, today: string) {
  const { data: invoices } = await ctx.supabase
    .from("credit_card_invoices")
    .select("*")
    .lte("due_date", addDays(today, 40))
    .gte("due_date", addDays(today, -90))
    .order("due_date");
  if (!invoices?.length) return [];
  const totals = await fetchAll((from, to) =>
    ctx.supabase
      .from("invoice_totals")
      .select("*")
      .in(
        "invoice_id",
        invoices.map((i) => i.id),
      )
      .range(from, to),
  );
  const byId = new Map(totals.map((t) => [t.invoice_id, t]));
  return invoices
    .map((inv) => {
      const t = byId.get(inv.id) ?? { charges_cents: 0, refunds_cents: 0, paid_cents: 0 };
      return {
        ...inv,
        cardName: ledger.lookups.cards[inv.credit_card_id] ?? "Cartão",
        amountCents: invoiceAmount(t),
        remainingCents: invoiceAmount(t) - t.paid_cents,
        status: invoiceStatus(inv, t, today),
      };
    })
    .filter((i) => i.remainingCents > 0);
}

async function loadGoals(ctx: AuthContext) {
  const { data } = await ctx.supabase
    .from("financial_goals")
    .select("*")
    .is("archived_at", null)
    .order("target_date", { ascending: true, nullsFirst: false })
    .limit(4);
  return data ?? [];
}

export type DashboardData = Awaited<ReturnType<typeof loadDashboard>>;
