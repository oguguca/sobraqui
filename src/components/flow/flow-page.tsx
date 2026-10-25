import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";

import { CategoryBreakdown } from "@/components/charts/category-breakdown";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { Pagination } from "@/components/pagination";
import { EmptyState, Money, PageHeader } from "@/components/shared";
import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatMonth } from "@/domain/dates";
import { PAYMENT_METHOD_LABEL } from "@/domain/labels";
import { formatMoney, formatPercent } from "@/domain/money";
import { cn } from "@/lib/utils";
import { requireAuth } from "@/server/auth";
import { loadLedgerContext } from "@/server/queries/context";
import { resolvePeriod } from "@/server/queries/dashboard";
import { flowSummary, type FlowKind } from "@/server/queries/flow";
import { listTransactions, parseTransactionFilters } from "@/server/queries/transactions";
import { materializeRecurring } from "@/server/recurring";

const COPY = {
  income: {
    title: "Entradas",
    description: "Salário, freelance e tudo o que entrou nas suas contas.",
    newLabel: "Nova entrada",
    paid: "Recebido",
    pending: "A receber",
    empty: "Nenhuma entrada no período",
    emptyHint: "Registre seu salário (pode repetir todo mês), um freelance ou qualquer valor recebido.",
    icon: ArrowDownLeft,
  },
  expense: {
    title: "Saídas",
    description: "Seus gastos por forma de pagamento: Pix, débito, crédito, boleto e dinheiro.",
    newLabel: "Nova saída",
    paid: "Pago",
    pending: "A pagar",
    empty: "Nenhuma saída no período",
    emptyHint: "Registre um gasto e escolha como pagou. No crédito, informe as parcelas.",
    icon: ArrowUpRight,
  },
} as const;

/** Página compartilhada pelas abas Entradas e Saídas. */
export async function FlowPage({
  kind,
  basePath,
  searchParams,
}: {
  kind: FlowKind;
  basePath: "/entradas" | "/saidas";
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const copy = COPY[kind];
  const ctx = await requireAuth();
  await materializeRecurring(ctx);
  const ledger = await loadLedgerContext(ctx);
  const period = resolvePeriod(searchParams, ledger.today);
  const filters = {
    ...parseTransactionFilters(searchParams),
    kind,
    from: period.range.from,
    to: period.range.to,
    account: undefined,
  };
  const [summary, result] = await Promise.all([
    flowSummary(ctx, kind, period.range),
    listTransactions(ctx, filters),
  ]);

  const total = summary.paidCents + summary.pendingCents;
  const periodLabel = period.month ? formatMonth(period.month) : `${formatDate(period.range.from)} a ${formatDate(period.range.to)}`;
  const statusLink = (status: "paid" | "pending" | null) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && k !== "status" && k !== "page") params.set(k, v);
    if (status) params.set("status", status);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const newButton = (
    <TransactionFormDialog
      options={ledger.formOptions}
      today={ledger.today}
      lockMode
      title={copy.newLabel}
      defaults={{ mode: kind, paymentMethod: "pix" }}
      trigger={
        <Button>
          <Plus /> {copy.newLabel}
        </Button>
      }
    />
  );

  const categories = summary.byCategory.map((c) => ({
    ...c,
    name: c.categoryId ? (ledger.lookups.categories[c.categoryId]?.name ?? "Sem categoria") : "Sem categoria",
    color: c.categoryId ? (ledger.lookups.categories[c.categoryId]?.color ?? "#94a3b8") : "#94a3b8",
  }));

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <>
            <PeriodFilter
              key={`${period.range.from}:${period.range.to}`}
              month={period.month}
              range={period.range}
              today={ledger.today}
              accounts={[]}
              accountId={null}
              showAccount={false}
            />
            {newButton}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Figure label={copy.paid} cents={summary.paidCents} tone={kind === "income" ? "positive" : "negative"} />
        <Figure label={copy.pending} cents={summary.pendingCents} />
        <Figure label={`Total em ${periodLabel}`} cents={total} hint={`${summary.count} lançamento(s)`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="py-4 lg:col-span-2">
          <CardHeader>
            <CardTitle>Lançamentos</CardTitle>
            <div className="flex flex-wrap gap-1 pt-1" role="tablist" aria-label="Situação">
              {(
                [
                  [null, "Todos"],
                  ["paid", copy.paid],
                  ["pending", copy.pending],
                ] as const
              ).map(([status, label]) => (
                <Button
                  key={label}
                  asChild
                  size="sm"
                  variant={(filters.status ?? null) === status ? "secondary" : "ghost"}
                  role="tab"
                  aria-selected={(filters.status ?? null) === status}
                >
                  <Link href={statusLink(status)} scroll={false}>
                    {label}
                  </Link>
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-4">
            {result.rows.length === 0 ? (
              <EmptyState icon={copy.icon} title={copy.empty} description={copy.emptyHint} action={newButton} className="border-0" />
            ) : (
              <>
                <TransactionsTable rows={result.rows} lookups={ledger.lookups} />
                <Pagination
                  page={filters.page}
                  total={result.total}
                  pageSize={result.pageSize}
                  basePath={basePath}
                  params={searchParams}
                />
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          {kind === "expense" && (
            <Card>
              <CardHeader>
                <CardTitle>Por forma de pagamento</CardTitle>
                <CardDescription>No crédito, conta cada parcela no mês dela.</CardDescription>
              </CardHeader>
              <CardContent>
                {summary.byMethod.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem saídas no período.</p>
                ) : (
                  <ul className="grid gap-3 text-sm">
                    {summary.byMethod.map((m) => {
                      const share = total > 0 ? m.cents / total : 0;
                      return (
                        <li key={m.method ?? "none"} className="grid gap-1">
                          <div className="flex items-center justify-between gap-3">
                            <span>{m.method ? PAYMENT_METHOD_LABEL[m.method] : "Não informado"}</span>
                            <span className="flex items-baseline gap-2">
                              <span className="tabular text-xs text-muted-foreground">{formatPercent(share)}</span>
                              <span className="tabular font-medium">{formatMoney(m.cents)}</span>
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn("h-full rounded-full", m.method === "credit_card" ? "bg-chart-5" : "bg-chart-3")}
                              style={{ width: `${share * 100}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Por categoria</CardTitle>
            </CardHeader>
            <CardContent>
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nada no período.</p>
              ) : (
                <CategoryBreakdown data={categories} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Figure({
  label,
  cents,
  tone,
  hint,
}: {
  label: string;
  cents: number;
  tone?: "positive" | "negative";
  hint?: string;
}) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted-foreground first-letter:uppercase">{label}</p>
        <Money cents={cents} tone={tone} className="mt-1 block text-2xl font-semibold tracking-tight" />
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
