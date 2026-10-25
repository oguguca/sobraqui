import { AlertTriangle, CircleCheck, OctagonAlert, Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { CategoryBadgeIcon } from "@/components/category-icon";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { BudgetDialog } from "@/components/planning/budget-dialog";
import { BudgetRowActions, CopyBudgetsButton } from "@/components/planning/budget-row-actions";
import { EmptyState, Money, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { budgetUsage, type BudgetLevel } from "@/domain/budget";
import { addMonthsToMonth, formatMonth, isISOMonth, monthOf, monthRange, monthStart, monthsBetween } from "@/domain/dates";
import { expensesByCategory } from "@/domain/ledger";
import { formatMoney, formatPercent } from "@/domain/money";
import { cn } from "@/lib/utils";
import { requireAuth } from "@/server/auth";
import { dbDate } from "@/server/db";
import { loadLedgerContext } from "@/server/queries/context";
import { transactionsBetween } from "@/server/queries/transactions";

export const metadata: Metadata = { title: "Orçamento" };

const LEVEL: Record<BudgetLevel, { label: string; icon: typeof CircleCheck; bar: string; text: string }> = {
  ok: { label: "Dentro do limite", icon: CircleCheck, bar: "bg-positive", text: "text-positive" },
  warning: { label: "Perto do limite", icon: AlertTriangle, bar: "bg-warning", text: "text-warning" },
  exceeded: { label: "Limite estourado", icon: OctagonAlert, bar: "bg-negative", text: "text-negative" },
};

export default async function BudgetPage({ searchParams }: PageProps<"/orcamento">) {
  const ctx = await requireAuth();
  const ledger = await loadLedgerContext(ctx);
  const requested = (await searchParams).mes;
  const month = typeof requested === "string" && isISOMonth(requested) ? requested : monthOf(ledger.today);
  const historyMonths = monthsBetween(addMonthsToMonth(month, -5), month);

  const [budgets, transactions] = await Promise.all([
    ctx.db((tx) =>
      tx.budget.findMany({
        where: {
          user_id: ctx.user.id,
          month: { gte: dbDate(monthStart(historyMonths[0])), lte: dbDate(monthStart(month)) },
        },
      }),
    ),
    transactionsBetween(ctx, { from: monthStart(historyMonths[0]), to: monthRange(month).to }),
  ]);

  const spentIn = (m: string) =>
    new Map(
      expensesByCategory(transactions.filter((t) => monthOf(t.occurred_on) === m)).map((c) => [c.categoryId, c.cents]),
    );
  const spent = spentIn(month);
  const current = budgets
    .filter((b) => monthOf(b.month) === month)
    .map((b) => ({ budget: b, category: ledger.lookups.categories[b.category_id], usage: budgetUsage(b.limit_cents, spent.get(b.category_id) ?? 0) }))
    .sort((a, b) => b.usage.ratio - a.usage.ratio);

  const totalLimit = current.reduce((s, r) => s + r.usage.limitCents, 0);
  const totalSpent = current.reduce((s, r) => s + r.usage.spentCents, 0);
  const alerts = current.filter((r) => r.usage.level !== "ok").length;

  const used = new Set(current.map((r) => r.budget.category_id));
  const available = ledger.activeCategories
    .filter((c) => c.kind === "expense" && !used.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }));

  const history = historyMonths
    .map((m) => {
      const monthBudgets = budgets.filter((b) => monthOf(b.month) === m);
      const s = spentIn(m);
      return {
        month: m,
        planned: monthBudgets.reduce((sum, b) => sum + b.limit_cents, 0),
        actual: monthBudgets.reduce((sum, b) => sum + (s.get(b.category_id) ?? 0), 0),
        count: monthBudgets.length,
      };
    })
    .reverse();

  const addButton = (
    <BudgetDialog
      month={month}
      categories={available}
      trigger={
        <Button disabled={available.length === 0}>
          <Plus /> Definir limite
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Orçamento"
        description="Limites mensais por categoria de despesa, comparados com o gasto real (conta e cartão, já descontados estornos)."
        actions={
          <>
            <PeriodFilter
              key={month}
              month={month}
              range={monthRange(month)}
              today={ledger.today}
              accounts={[]}
              accountId={null}
              showAccount={false}
              allowRange={false}
            />
            {current.length === 0 && <CopyBudgetsButton month={month} />}
            {addButton}
          </>
        }
      />

      {current.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhum limite neste mês"
          description="Defina quanto quer gastar em cada categoria e acompanhe ao longo do mês. Alertas aparecem a partir de 80% do limite."
          action={addButton}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="first-letter:uppercase">{formatMonth(month)}</CardTitle>
              <CardDescription>
                {formatMoney(totalSpent)} de {formatMoney(totalLimit)} planejados
                {alerts > 0 && ` · ${alerts} categoria(s) em alerta`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-5">
                {current.map(({ budget, category, usage }) => {
                  const level = LEVEL[usage.level];
                  return (
                    <li key={budget.id} className="grid gap-2">
                      <div className="flex items-center gap-3">
                        <CategoryBadgeIcon icon={category?.icon} color={category?.color} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{category?.name ?? "Categoria removida"}</p>
                          <p className={cn("flex items-center gap-1 text-xs", level.text)}>
                            <level.icon className="size-3.5" aria-hidden />
                            {level.label} · {formatPercent(usage.ratio)}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="tabular font-medium">
                            {formatMoney(usage.spentCents)} <span className="text-muted-foreground">/ {formatMoney(usage.limitCents)}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {usage.remainingCents >= 0 ? (
                              <>Restam {formatMoney(usage.remainingCents)}</>
                            ) : (
                              <>Passou {formatMoney(-usage.remainingCents)}</>
                            )}
                          </p>
                        </div>
                        <BudgetRowActions
                          budgetId={budget.id}
                          month={month}
                          category={{ id: budget.category_id, name: category?.name ?? "Categoria" }}
                          limitCents={budget.limit_cents}
                        />
                      </div>
                      <div
                        className="h-2 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(Math.min(1, usage.ratio) * 100)}
                        aria-label={`Uso do limite de ${category?.name ?? "categoria"}`}
                      >
                        <div className={cn("h-full rounded-full transition-all", level.bar)} style={{ width: `${Math.min(1, usage.ratio) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Planejado x real</CardTitle>
              <CardDescription>Últimos 6 meses, só categorias com limite.</CardDescription>
            </CardHeader>
            <CardContent className="px-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Planejado</TableHead>
                    <TableHead className="text-right">Real</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.month}>
                      <TableCell className="capitalize">{formatMonth(h.month, "short")}</TableCell>
                      <TableCell className="text-right">{h.count ? <Money cents={h.planned} /> : "—"}</TableCell>
                      <TableCell className="text-right">
                        {h.count ? <Money cents={h.actual} tone={h.actual > h.planned ? "negative" : "neutral"} /> : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
