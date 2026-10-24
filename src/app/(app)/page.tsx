import { AlertCircle, ArrowRight, CalendarClock, Landmark, Plus, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BalanceChart } from "@/components/charts/balance-chart";
import { CategoryBreakdown } from "@/components/charts/category-breakdown";
import { IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { StatCard } from "@/components/dashboard/stat-card";
import { ColorDot, EmptyState, Money } from "@/components/shared";
import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { goalProgress } from "@/domain/budget";
import { INVOICE_STATUS_LABEL } from "@/domain/credit-card";
import { formatDate, formatMonth } from "@/domain/dates";
import { formatMoney, formatPercent } from "@/domain/money";
import { requireAuth } from "@/server/auth";
import { loadLedgerContext } from "@/server/queries/context";
import { loadDashboard, resolvePeriod } from "@/server/queries/dashboard";
import { materializeRecurring } from "@/server/recurring";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const ctx = await requireAuth();
  await materializeRecurring(ctx);
  const ledger = await loadLedgerContext(ctx);
  const period = resolvePeriod(await searchParams, ledger.today);
  const d = await loadDashboard(ctx, ledger, period);

  const periodLabel = period.month ? formatMonth(period.month) : `${formatDate(d.range.from)} a ${formatDate(d.range.to)}`;
  const newTransaction = (
    <TransactionFormDialog
      options={ledger.formOptions}
      today={ledger.today}
      trigger={
        <Button>
          <Plus /> Novo lançamento
        </Button>
      }
    />
  );

  if (!d.hasAnyData) {
    return (
      <>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Dashboard</h1>
        <EmptyState
          icon={Landmark}
          title="Comece cadastrando uma conta"
          description="O dashboard é montado a partir dos seus lançamentos. Cadastre suas contas e registre movimentações ou importe um extrato do Nubank."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/contas">Cadastrar conta</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/importacao">Importar extrato</Link>
              </Button>
            </div>
          }
        />
      </>
    );
  }

  const committed = d.cardDebt + d.upcoming.filter((u) => u.kind !== "income").reduce((s, u) => s + u.amount_cents, 0);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {ctx.user.displayName ? `Olá, ${ctx.user.displayName}` : "Visão geral"} · <span className="capitalize">{periodLabel}</span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Saldo em contas</p>
          <Money cents={d.totalBalance} tone={d.totalBalance < 0 ? "negative" : "neutral"} className="block text-5xl font-semibold tracking-tight" />
          {committed > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              <Money cents={committed} className="font-medium text-foreground" /> comprometidos com cartões e contas a pagar
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter
            key={`${d.range.from}:${d.range.to}`}
            month={period.month}
            range={d.range}
            today={ledger.today}
            accounts={ledger.formOptions.accounts}
            accountId={period.accountId}
          />
          {newTransaction}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Receitas" cents={d.summary.incomeCents} change={d.changes.income} upIsGood />
        <StatCard
          label="Despesas"
          cents={d.summary.netExpenseCents}
          change={d.changes.expense}
          upIsGood={false}
          hint={d.summary.refundCents > 0 ? `Já descontados ${formatMoney(d.summary.refundCents)} de estornos` : undefined}
        />
        <StatCard
          label="Resultado"
          cents={d.summary.resultCents}
          change={d.changes.result}
          upIsGood
          tone="auto"
          hint={d.summary.savingsRate !== null ? `Você guardou ${formatPercent(Math.max(0, d.summary.savingsRate))} da receita` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Receitas e despesas</CardTitle>
            <CardDescription>Últimos 6 meses, sem transferências nem pagamentos de fatura.</CardDescription>
          </CardHeader>
          <CardContent>
            <IncomeExpenseChart data={d.trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Para onde foi o dinheiro</CardTitle>
            <CardDescription>Despesas por categoria no período.</CardDescription>
          </CardHeader>
          <CardContent>
            {d.byCategory.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma despesa no período.</p>
            ) : (
              <CategoryBreakdown data={d.byCategory} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Evolução do saldo</CardTitle>
            <CardDescription>Saldo somado das contas no fim de cada dia.</CardDescription>
          </CardHeader>
          <CardContent>
            {d.balance.length < 2 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">O período ainda não começou.</p>
            ) : (
              <BalanceChart data={d.balance} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>A pagar e a receber</CardTitle>
            <CardDescription>Vencidos e próximos 15 dias.</CardDescription>
          </CardHeader>
          <CardContent>
            {d.upcoming.length === 0 && d.invoices.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Nada pendente" className="border-0 py-6" />
            ) : (
              <ul className="grid gap-3 text-sm">
                {d.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3">
                    <Link href={`/cartoes/${inv.credit_card_id}?fatura=${inv.reference_month.slice(0, 7)}`} className="min-w-0 hover:underline">
                      <p className="truncate font-medium">Fatura {inv.cardName}</p>
                      <p className="text-xs text-muted-foreground">
                        Vence {formatDate(inv.due_date)} · {INVOICE_STATUS_LABEL[inv.status]}
                      </p>
                    </Link>
                    <Money cents={-inv.remainingCents} tone={inv.status === "overdue" ? "negative" : "neutral"} />
                  </li>
                ))}
                {d.upcoming.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-medium">
                        {u.overdue && <AlertCircle className="size-3.5 shrink-0 text-negative" aria-label="Vencido" />}
                        <span className="truncate">{u.description}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {u.overdue ? "Venceu" : "Vence"} {formatDate(u.occurred_on)}
                      </p>
                    </div>
                    <Money cents={u.kind === "income" ? u.amount_cents : -u.amount_cents} tone="auto" signed />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="py-4 lg:col-span-2">
          <CardHeader>
            <CardTitle>Últimas transações</CardTitle>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/transacoes">
                  Ver todas <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-2 sm:px-4">
            {d.recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma transação registrada.</p>
            ) : (
              <TransactionsTable rows={d.recent} lookups={ledger.lookups} compact />
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Contas e cartões</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3 text-sm">
                {d.accounts.map((a) => (
                  <li key={a.id}>
                    <Link href={`/contas/${a.id}`} className="flex items-center justify-between gap-3 hover:underline">
                      <span className="flex min-w-0 items-center gap-2">
                        <ColorDot color={a.color} />
                        <span className="truncate">{a.name}</span>
                      </span>
                      <Money cents={a.balance_cents} tone="auto" className="font-medium" />
                    </Link>
                  </li>
                ))}
                {d.cards.map((c) => (
                  <li key={c.id}>
                    <Link href={`/cartoes/${c.id}`} className="grid gap-1.5 hover:underline">
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <ColorDot color={c.color} />
                          <span className="truncate">{c.name}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          disponível <Money cents={c.available_cents} className="font-medium text-foreground" />
                        </span>
                      </span>
                      {c.limit_cents > 0 && (
                        <Progress value={Math.min(100, (Math.max(0, c.used_cents) / c.limit_cents) * 100)} aria-label={`Limite usado de ${c.name}`} />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metas</CardTitle>
              <CardAction>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/metas">
                    Ver <ArrowRight />
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {d.goals.length === 0 ? (
                <EmptyState icon={Target} title="Nenhuma meta" className="border-0 py-4" />
              ) : (
                <ul className="grid gap-4 text-sm">
                  {d.goals.map((g) => {
                    const p = goalProgress(g.saved_cents, g.target_cents);
                    return (
                      <li key={g.id} className="grid gap-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-medium">{g.name}</span>
                          <span className="tabular text-xs text-muted-foreground">{formatPercent(p)}</span>
                        </div>
                        <Progress value={p * 100} aria-label={`Progresso de ${g.name}`} />
                        <p className="text-xs text-muted-foreground">
                          {formatMoney(g.saved_cents)} de {formatMoney(g.target_cents)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Seus hábitos no período</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Habit label="Gasto médio por dia" value={formatMoney(d.habits.dailyAverageCents)} />
            <Habit
              label="Ticket médio"
              value={d.habits.averageTicketCents !== null ? formatMoney(d.habits.averageTicketCents) : "—"}
              detail={`${d.habits.expenseCount} despesa(s)`}
            />
            <Habit
              label="Maior categoria"
              value={d.habits.topCategory?.name ?? "—"}
              detail={d.habits.topCategory ? `${formatPercent(d.habits.topCategory.share)} das despesas` : undefined}
            />
            <Habit
              label="Gasto no cartão"
              value={d.habits.cardShare !== null ? formatPercent(d.habits.cardShare) : "—"}
              detail="das despesas brutas"
            />
          </dl>
          {d.cards.length > 0 && d.habits.cardShare !== null && d.habits.cardShare > 0.6 && (
            <Badge variant="outline" className="mt-4">
              Mais da metade dos gastos passou pelo cartão: acompanhe as faturas futuras.
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Habit({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-lg font-semibold tracking-tight tabular">{value}</dd>
      {detail && <dd className="text-xs text-muted-foreground">{detail}</dd>}
    </div>
  );
}
