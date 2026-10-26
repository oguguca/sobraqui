import { Plus, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { ColorDot, EmptyState, Money, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMonth, todayIn } from "@/domain/dates";
import { formatPercent } from "@/domain/money";
import { requireAuth } from "@/server/auth";
import { resolvePeriod } from "@/server/queries/dashboard";
import { investmentSummary } from "@/server/queries/investments";

export const metadata: Metadata = { title: "Investimentos" };

export default async function InvestmentsPage({ searchParams }: PageProps<"/investimentos">) {
  const ctx = await requireAuth();
  const params = await searchParams;
  const today = todayIn(ctx.user.timezone);
  const period = resolvePeriod(params, today);
  const summary = await investmentSummary(ctx, period.range);
  const periodLabel = period.month ? formatMonth(period.month) : `${formatDate(period.range.from)} a ${formatDate(period.range.to)}`;

  const newButton = (
    <AccountFormDialog
      defaultType="investment"
      trigger={
        <Button>
          <Plus /> Nova conta de investimento
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Investimentos"
        description="Contas do tipo Investimentos. Aportes e resgates são transferências entre elas e suas outras contas."
        actions={
          <>
            <PeriodFilter
              key={`${period.range.from}:${period.range.to}`}
              month={period.month}
              range={period.range}
              today={today}
              accounts={[]}
              accountId={null}
              showAccount={false}
            />
            {newButton}
          </>
        }
      />

      {summary.accounts.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Nenhuma conta de investimento"
          description="Crie uma conta do tipo Investimentos para cada corretora, caixinha ou CDB. Registre aportes como transferência da sua conta corrente para ela."
          action={newButton}
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Figure
              label="Total investido"
              cents={summary.totalCents}
              hint="Saldo atual somado"
              className="col-span-2 sm:col-span-1"
            />
            <Figure label={`Aportes em ${periodLabel}`} cents={summary.depositsCents} tone="positive" />
            <Figure label={`Resgates em ${periodLabel}`} cents={summary.withdrawalsCents} tone="negative" />
            <Figure
              label={`Rendimentos em ${periodLabel}`}
              cents={summary.earningsCents}
              tone="positive"
              hint="Receitas lançadas nas contas de investimento"
              className="col-span-2 sm:col-span-1"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {summary.accounts.map((account) => {
              const share = summary.totalCents > 0 ? Math.max(account.balance_cents, 0) / summary.totalCents : 0;
              return (
                <Link
                  key={account.id}
                  href={`/contas/${account.id}`}
                  className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Card className="h-full transition-shadow group-hover:shadow-md">
                    <CardContent className="flex h-full flex-col gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <ColorDot color={account.color} />
                        <span className="truncate font-medium">{account.name}</span>
                      </div>
                      <Money cents={account.balance_cents} tone="auto" className="text-2xl font-semibold tracking-tight" />
                      <div className="grid gap-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Da carteira</span>
                          <span className="tabular">{formatPercent(share)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-chart-3" style={{ width: `${share * 100}%` }} />
                        </div>
                      </div>
                      <dl className="mt-auto grid grid-cols-3 gap-2 text-xs">
                        <Flow label="Aportes" cents={account.depositsCents} />
                        <Flow label="Resgates" cents={account.withdrawalsCents} />
                        <Flow label="Rendimentos" cents={account.earningsCents} />
                      </dl>
                      {account.institution && <p className="text-xs text-muted-foreground">{account.institution}</p>}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function Figure({
  label,
  cents,
  tone,
  hint,
  className,
}: {
  label: string;
  cents: number;
  tone?: "positive" | "negative";
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent>
        <p className="text-sm text-muted-foreground first-letter:uppercase">{label}</p>
        <Money
          cents={cents}
          tone={cents === 0 ? undefined : tone}
          className="mt-1 block text-xl font-semibold tracking-tight sm:text-2xl"
        />
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Flow({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        <Money cents={cents} className="font-medium" />
      </dd>
    </div>
  );
}
