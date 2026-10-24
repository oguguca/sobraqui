import "server-only";

import { z } from "zod";

import { addMonthsToMonth, diffDays, isISODate, monthEnd, monthOf, monthStart, monthsBetween } from "@/domain/dates";
import { expensesByCategory, monthlyTotals, netWorthAt, summarize } from "@/domain/ledger";
import type { AuthContext } from "@/server/auth";

import type { LedgerContext } from "./context";
import { transactionsBetween } from "./transactions";

const filtersSchema = z.object({
  de: z.string().refine(isISODate).optional().catch(undefined),
  ate: z.string().refine(isISODate).optional().catch(undefined),
  conta: z.uuid().optional().catch(undefined),
  cartao: z.uuid().optional().catch(undefined),
  categoria: z.uuid().optional().catch(undefined),
});

export type ReportFilters = { from: string; to: string; accountId?: string; cardId?: string; categoryId?: string };

export function parseReportFilters(params: Record<string, string | string[] | undefined>, today: string): ReportFilters {
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const f = filtersSchema.parse(flat);
  const defaultTo = monthEnd(monthOf(today));
  const defaultFrom = monthStart(addMonthsToMonth(monthOf(today), -11));
  let from = f.de ?? defaultFrom;
  let to = f.ate ?? defaultTo;
  if (from > to || diffDays(from, to) > 366 * 5) {
    from = defaultFrom;
    to = defaultTo;
  }
  return { from, to, accountId: f.conta, cardId: f.cartao, categoryId: f.categoria };
}

export async function loadReport(ctx: AuthContext, ledger: LedgerContext, f: ReportFilters) {
  // Para reconstruir saldos no passado precisamos de tudo que veio depois de `from`.
  const all = await transactionsBetween(ctx, { from: f.from }, { accountId: f.accountId, cardId: f.cardId });
  const inRange = all.filter(
    (t) => t.occurred_on <= f.to && (!f.categoryId || t.category_id === f.categoryId),
  );

  const months = monthsBetween(monthOf(f.from), monthOf(f.to));
  const monthly = monthlyTotals(inRange, months);
  const summary = summarize(inRange);

  const filtered = Boolean(f.accountId || f.cardId || f.categoryId);
  const accountIds = new Set(ledger.activeAccounts.map((a) => a.id));
  const cardDebt = ledger.activeCards.reduce((s, c) => s + c.used_cents, 0);
  const accountsTotal = ledger.activeAccounts.reduce((s, a) => s + a.balance_cents, 0);
  // Patrimônio só faz sentido sem filtros (precisa de todas as contas e cartões).
  const netWorth = filtered
    ? null
    : netWorthAt(
        months.map((m) => (monthEnd(m) < ledger.today ? monthEnd(m) : ledger.today)),
        { accountsCents: accountsTotal, cardDebtCents: cardDebt },
        all,
        accountIds,
      );

  const cashFlow = monthly.map((m, i) => ({
    ...m,
    accountsCents: netWorth?.[i]?.accountsCents ?? null,
    netWorthCents: netWorth?.[i]?.netWorthCents ?? null,
  }));

  const byCategory = expensesByCategory(inRange).map((c) => ({
    ...c,
    name: c.categoryId ? (ledger.lookups.categories[c.categoryId]?.name ?? "Sem categoria") : "Sem categoria",
    color: c.categoryId ? (ledger.lookups.categories[c.categoryId]?.color ?? "#94a3b8") : "#94a3b8",
  }));

  // Comparação: último mês do período contra o anterior, por categoria.
  const lastMonth = months[months.length - 1];
  const prevMonth = months.length > 1 ? months[months.length - 2] : null;
  const catIn = (m: string | null) =>
    new Map(m ? expensesByCategory(inRange.filter((t) => monthOf(t.occurred_on) === m)).map((c) => [c.categoryId, c.cents]) : []);
  const last = catIn(lastMonth);
  const prev = catIn(prevMonth);
  const comparison = [...new Set([...last.keys(), ...prev.keys()])]
    .map((id) => ({
      categoryId: id,
      name: id ? (ledger.lookups.categories[id]?.name ?? "Sem categoria") : "Sem categoria",
      currentCents: last.get(id) ?? 0,
      previousCents: prev.get(id) ?? 0,
    }))
    .sort((a, b) => Math.abs(b.currentCents - b.previousCents) - Math.abs(a.currentCents - a.previousCents))
    .slice(0, 10);

  const topExpenses = inRange
    .filter((t) => t.kind === "expense" && t.status === "paid")
    .sort((a, b) => b.amount_cents - a.amount_cents)
    .slice(0, 10);

  const bySource = new Map<string, { name: string; kind: "account" | "card"; income: number; expense: number }>();
  for (const t of inRange) {
    if (t.status !== "paid" || !["income", "expense", "refund"].includes(t.kind)) continue;
    const key = t.credit_card_id ? `card:${t.credit_card_id}` : `acc:${t.account_id}`;
    const name = t.credit_card_id ? ledger.lookups.cards[t.credit_card_id] : ledger.lookups.accounts[t.account_id ?? ""];
    const row = bySource.get(key) ?? { name: name ?? "—", kind: t.credit_card_id ? "card" : "account", income: 0, expense: 0 };
    if (t.kind === "income") row.income += t.amount_cents;
    else if (t.kind === "expense") row.expense += t.amount_cents;
    else row.expense -= t.amount_cents;
    bySource.set(key, row);
  }

  return {
    months,
    monthly,
    summary,
    cashFlow,
    netWorth,
    byCategory,
    comparison: { lastMonth, prevMonth, rows: comparison },
    topExpenses,
    bySource: [...bySource.values()].sort((a, b) => b.expense - a.expense),
    count: inRange.length,
  };
}
