import { ChartPie, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BalanceChart } from "@/components/charts/balance-chart";
import { CategoryBreakdown } from "@/components/charts/category-breakdown";
import { IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { ReportFilters } from "@/components/reports/report-filters";
import { EmptyState, Money, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMonth } from "@/domain/dates";
import { formatPercent } from "@/domain/money";
import { requireAuth } from "@/server/auth";
import { loadLedgerContext } from "@/server/queries/context";
import { loadReport, parseReportFilters } from "@/server/queries/reports";

export const metadata: Metadata = { title: "Relatórios" };

export default async function ReportsPage({ searchParams }: PageProps<"/relatorios">) {
  const ctx = await requireAuth();
  const ledger = await loadLedgerContext(ctx);
  const filters = parseReportFilters(await searchParams, ledger.today);
  const r = await loadReport(ctx, ledger, filters);

  const exportParams = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.accountId) exportParams.set("account", filters.accountId);
  if (filters.cardId) exportParams.set("card", filters.cardId);
  if (filters.categoryId) exportParams.set("category", filters.categoryId);

  return (
    <>
      <PageHeader
        title="Relatórios"
        description={`${formatDate(filters.from)} a ${formatDate(filters.to)} · transferências e pagamentos de fatura não contam como receita ou despesa.`}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/api/export/transactions?${exportParams.toString()}`} prefetch={false}>
              <Download /> Exportar CSV
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4">
        <ReportFilters options={ledger.formOptions} from={filters.from} to={filters.to} />

        {r.count === 0 ? (
          <EmptyState icon={ChartPie} title="Sem lançamentos no período" description="Ajuste os filtros ou registre movimentações." />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi label="Receitas" cents={r.summary.incomeCents} />
              <Kpi label="Despesas" cents={r.summary.netExpenseCents} />
              <Kpi label="Resultado" cents={r.summary.resultCents} tone="auto" />
              <Card>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Taxa de poupança</p>
                  <p className="mt-1 text-2xl font-semibold tabular">
                    {r.summary.savingsRate !== null ? formatPercent(r.summary.savingsRate) : "—"}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Receitas e despesas por mês</CardTitle>
              </CardHeader>
              <CardContent>
                <IncomeExpenseChart data={r.monthly} height={280} />
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              {r.netWorth && (
                <Card>
                  <CardHeader>
                    <CardTitle>Evolução patrimonial</CardTitle>
                    <CardDescription>Saldo das contas menos o devido nos cartões (inclui parcelas futuras), no fim de cada mês.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <BalanceChart data={r.netWorth.map((p) => ({ date: p.date, balanceCents: p.netWorthCents }))} />
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle>Gastos por categoria</CardTitle>
                </CardHeader>
                <CardContent>
                  {r.byCategory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma despesa.</p>
                  ) : (
                    <CategoryBreakdown data={r.byCategory} />
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Fluxo de caixa</CardTitle>
                <CardDescription>Efetivados, mês a mês.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto px-2 sm:px-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-right">Entradas</TableHead>
                      <TableHead className="text-right">Saídas</TableHead>
                      <TableHead className="text-right">Resultado</TableHead>
                      {r.netWorth && <TableHead className="text-right">Saldo em contas</TableHead>}
                      {r.netWorth && <TableHead className="text-right">Patrimônio</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.cashFlow.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell className="capitalize">{formatMonth(m.month, "short")}</TableCell>
                        <TableCell className="text-right">
                          <Money cents={m.incomeCents} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Money cents={m.expenseCents} />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          <Money cents={m.resultCents} tone="auto" signed />
                        </TableCell>
                        {r.netWorth && (
                          <TableCell className="text-right">
                            <Money cents={m.accountsCents ?? 0} />
                          </TableCell>
                        )}
                        {r.netWorth && (
                          <TableCell className="text-right">
                            <Money cents={m.netWorthCents ?? 0} tone="auto" />
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Comparação entre meses</CardTitle>
                  <CardDescription>
                    {r.comparison.prevMonth ? (
                      <span className="first-letter:uppercase">
                        {formatMonth(r.comparison.lastMonth)} contra {formatMonth(r.comparison.prevMonth)}, maiores variações.
                      </span>
                    ) : (
                      "Escolha um período com pelo menos dois meses."
                    )}
                  </CardDescription>
                </CardHeader>
                {r.comparison.prevMonth && (
                  <CardContent className="px-2 sm:px-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Categoria</TableHead>
                          <TableHead className="text-right">Anterior</TableHead>
                          <TableHead className="text-right">Atual</TableHead>
                          <TableHead className="text-right">Variação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {r.comparison.rows.map((c) => (
                          <TableRow key={c.categoryId ?? "none"}>
                            <TableCell className="max-w-40 truncate">{c.name}</TableCell>
                            <TableCell className="text-right">
                              <Money cents={c.previousCents} />
                            </TableCell>
                            <TableCell className="text-right">
                              <Money cents={c.currentCents} />
                            </TableCell>
                            <TableCell className="text-right">
                              {/* Gastar mais é ruim: aumento em vermelho. */}
                              <Money cents={c.currentCents - c.previousCents} tone={c.currentCents > c.previousCents ? "negative" : "positive"} signed />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Maiores despesas</CardTitle>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <Table>
                    <TableBody>
                      {r.topExpenses.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="max-w-56">
                            <p className="truncate font-medium">{t.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(t.occurred_on)} ·{" "}
                              {t.category_id ? (ledger.lookups.categories[t.category_id]?.name ?? "Sem categoria") : "Sem categoria"}
                            </p>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            <Money cents={t.amount_cents} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Por conta e cartão</CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Origem</TableHead>
                      <TableHead className="text-right">Receitas</TableHead>
                      <TableHead className="text-right">Despesas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {r.bySource.map((s) => (
                      <TableRow key={`${s.kind}:${s.name}`}>
                        <TableCell>
                          {s.name} <span className="text-xs text-muted-foreground">· {s.kind === "card" ? "cartão" : "conta"}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Money cents={s.income} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Money cents={s.expense} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function Kpi({ label, cents, tone }: { label: string; cents: number; tone?: "auto" }) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <Money cents={cents} tone={tone} className="mt-1 block text-2xl font-semibold tracking-tight" />
      </CardContent>
    </Card>
  );
}
