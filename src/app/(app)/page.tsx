import { AlertCircle, ArrowDownLeft, ArrowUpRight, CalendarClock, CreditCard, Landmark, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { BalanceChart } from "@/components/charts/balance-chart";
import { CategorySpending } from "@/components/dashboard/category-spending";
import { PayInvoiceDialog } from "@/components/cards/pay-invoice-dialog";
import { CreditCardVisual } from "@/components/dashboard/credit-card-visual";
import { MoneyCountUp } from "@/components/motion/money-count-up";
import { Reveal } from "@/components/motion/reveal";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { EmptyState, Money } from "@/components/shared";
import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { INVOICE_STATUS_LABEL } from "@/domain/credit-card";
import { formatDate, formatDateShort, formatMonth } from "@/domain/dates";
import { PAYMENT_METHOD_LABEL } from "@/domain/labels";
import { formatMoney } from "@/domain/money";
import { cn } from "@/lib/utils";
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

  const firstName = ctx.user.displayName?.split(" ")[0] ?? null;
  const periodLabel = period.month ? formatMonth(period.month) : `${formatDate(d.range.from)} a ${formatDate(d.range.to)}`;

  const quickAdd = (mode: "income" | "expense", label: string, icon: React.ReactNode, variant: "default" | "outline") => (
    <TransactionFormDialog
      options={ledger.formOptions}
      today={ledger.today}
      lockMode
      title={mode === "income" ? "Nova entrada" : "Nova saída"}
      defaults={{ mode, paymentMethod: "pix" }}
      trigger={
        <Button variant={variant} className="rounded-full">
          {label} {icon}
        </Button>
      }
    />
  );

  if (!d.hasAnyData) {
    return (
      <>
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">Bem-vindo{firstName ? `, ${firstName}` : ""}</h1>
        <EmptyState
          icon={Landmark}
          title="Comece cadastrando sua conta"
          description="O dashboard é montado a partir dos seus lançamentos. Cadastre uma conta e lance à mão ou importe o extrato do banco (CSV ou OFX)."
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

  // Cartão em destaque: o primeiro cartão ativo e o que falta pagar dele.
  const card = d.cards[0];
  const cardBills = card ? d.billsToPay.filter((b) => b.cardId === card.id) : [];
  const leftover = d.summary.incomeCents - d.accountSpend - d.billsToPayCents;

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{periodLabel}</p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {firstName ? (
              <>
                Olá, <span className="text-muted-foreground">{firstName}</span>
              </>
            ) : (
              "Suas finanças"
            )}
          </h1>
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
          {/* No celular o lançamento fica no botão "+" da barra inferior. */}
          <div className="max-md:hidden">
            <TransactionFormDialog
              options={ledger.formOptions}
              today={ledger.today}
              trigger={
                <Button className="rounded-full">
                  <Plus /> Novo lançamento
                </Button>
              }
            />
          </div>
        </div>
      </div>

      <Reveal
        trigger="mount"
        stagger={0.08}
        distance={18}
        className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,1fr)]"
      >
        {/* Coluna 1: cartão e saldo */}
        <div className="grid content-start gap-5">
          <Card>
            <CardContent className="grid gap-4">
              <PanelTitle title="Cartão de crédito" subtitle="Fatura e limite" href={card ? `/cartoes/${card.id}` : "/cartoes"} />
              {card ? (
                <>
                  <CreditCardVisual
                    cardId={card.id}
                    name={card.name}
                    brand={card.brand}
                    billCents={cardBills.reduce((s, b) => s + b.remainingCents, 0)}
                    dueDate={cardBills[0]?.dueDate ?? null}
                    overdue={cardBills.some((b) => b.status === "overdue")}
                    availableCents={card.available_cents}
                    limitCents={card.limit_cents}
                  />
                  {cardBills[0]?.invoiceId && (
                    <div className="grid grid-cols-2 gap-2">
                      {(["pay", "reduce"] as const).map((variant) => (
                        <PayInvoiceDialog
                          key={variant}
                          variant={variant}
                          invoiceId={cardBills[0].invoiceId!}
                          remainingCents={cardBills[0].remainingCents}
                          accounts={ledger.formOptions.accounts}
                          defaultAccountId={card.payment_account_id}
                          today={ledger.today}
                          trigger={
                            <Button size="sm" variant={variant === "pay" ? "default" : "outline"} className="rounded-full">
                              {variant === "pay" ? "Pagar fatura" : "Abater valor"}
                            </Button>
                          }
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <EmptyState
                  icon={CreditCard}
                  title="Nenhum cartão"
                  className="py-8"
                  action={
                    <Button size="sm" variant="outline" asChild>
                      <Link href="/cartoes">Cadastrar cartão</Link>
                    </Button>
                  }
                />
              )}
            </CardContent>
          </Card>
          {/* No celular o saldo vem antes do cartão. */}
          <Card className="max-lg:order-first">
            <CardContent>
              <p className="text-sm text-muted-foreground">Saldo em conta</p>
              <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                <Money
                  cents={d.totalBalance}
                  tone={d.totalBalance < 0 ? "negative" : "neutral"}
                  animate
                  className="text-3xl font-semibold tracking-tight"
                />
                <Pill tone={leftover >= 0 ? "positive" : "negative"}>Sobra {formatMoney(leftover, { signed: true })}</Pill>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coluna 2: gastos por categoria */}
        <Card>
          <CardContent className="grid gap-4">
            <PanelTitle
              title="Maiores categorias"
              subtitle={`Total ${formatMoney(d.summary.netExpenseCents)} · cartão + débito e Pix`}
              href="/relatorios"
            />
            {d.byCategory.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Nenhum gasto no período.</p>
            ) : (
              <CategorySpending
                totalCents={d.summary.netExpenseCents}
                data={d.byCategory.map((c) => ({
                  ...c,
                  icon: c.categoryId ? (ledger.lookups.categories[c.categoryId]?.icon ?? null) : null,
                }))}
              />
            )}
          </CardContent>
        </Card>

        {/* Coluna 3: saldo e ações rápidas */}
        <Card>
          <CardContent className="grid gap-3">
            <PanelTitle title="Evolução do saldo" subtitle="Saldo em conta no fim de cada dia" href="/contas" />
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Saldo hoje</p>
              <Money cents={d.totalBalance} animate className="text-3xl font-semibold tracking-tight" />
            </div>
            {d.balance.length < 2 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">O período ainda não começou.</p>
            ) : (
              <div className="-mx-5">
                <BalanceChart data={d.balance} height={290} compact />
              </div>
            )}
            <div className="flex justify-center gap-2">
              {quickAdd("expense", "Saída", <ArrowUpRight />, "default")}
              {quickAdd("income", "Entrada", <ArrowDownLeft />, "outline")}
            </div>
          </CardContent>
        </Card>
      </Reveal>

      <Reveal
        trigger="mount"
        delay={0.2}
        stagger={0.08}
        distance={18}
        className="grid gap-5 lg:grid-cols-[minmax(0,2.45fr)_minmax(0,1fr)]"
      >
        <Card>
          <CardContent className="grid gap-2">
            <PanelTitle title="Últimas transações" subtitle="Movimentações mais recentes" href="/transacoes" />
            {d.recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma transação registrada.</p>
            ) : (
              <TransactionsTable rows={d.recent} lookups={ledger.lookups} />
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-5">
          <Card>
            <CardContent className="grid gap-4">
              <PanelTitle title="Resumo do mês" subtitle="O que entrou, o que saiu e o que falta pagar" href="/entradas" />
              <dl className="grid gap-3 text-sm">
                <SummaryRow label="Entradas" cents={d.summary.incomeCents} />
                <SummaryRow
                  label="Débito e Pix"
                  cents={-d.accountSpend}
                  detail={d.accountSpendByMethod
                    .slice(0, 2)
                    .map((m) => PAYMENT_METHOD_LABEL[m.method as keyof typeof PAYMENT_METHOD_LABEL] ?? "Outro")
                    .join(" · ")}
                />
                <SummaryRow label="Fatura a pagar" cents={-d.billsToPayCents} />
                <div className="border-t pt-3">
                  <SummaryRow label="Sobra do mês" cents={leftover} strong />
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-3">
              <PanelTitle title="A pagar" subtitle="Faturas e contas pendentes" href="/saidas?status=pending" />
              {d.upcoming.length === 0 && d.billsToPay.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CalendarClock className="size-4" /> Nada pendente.
                </p>
              ) : (
                <ul className="grid gap-2.5 text-sm">
                  {d.billsToPay.map((b) => (
                    <li key={`${b.cardId}:${b.month}`} className="flex items-center justify-between gap-3">
                      <Link href={`/cartoes/${b.cardId}?fatura=${b.month}`} className="min-w-0 hover:underline">
                        <p className="truncate font-medium">Fatura {b.cardName}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.status === "overdue" ? "Venceu" : "Vence"} {formatDateShort(b.dueDate)} ·{" "}
                          {INVOICE_STATUS_LABEL[b.status].toLowerCase()}
                        </p>
                      </Link>
                      <Money
                        cents={b.remainingCents}
                        tone={b.status === "overdue" ? "negative" : "neutral"}
                        className="font-medium"
                      />
                    </li>
                  ))}
                  {d.upcoming.slice(0, 4).map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-medium">
                          {u.overdue && <AlertCircle className="size-3.5 shrink-0 text-negative" aria-label="Vencido" />}
                          <span className="truncate">{u.description}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {u.overdue ? "Venceu" : "Vence"} {formatDateShort(u.occurred_on)}
                        </p>
                      </div>
                      <Money
                        cents={u.kind === "income" ? u.amount_cents : -u.amount_cents}
                        tone="auto"
                        signed
                        className="font-medium"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

        </div>
      </Reveal>
    </div>
  );
}

function PanelTitle({ title, subtitle, href }: { title: string; subtitle?: string; href?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {href && (
        <Link
          href={href}
          aria-label={`Abrir ${title}`}
          className="flex size-9 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowUpRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

function Pill({ tone, children }: { tone: "positive" | "negative"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap tabular",
        tone === "positive" ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative",
      )}
    >
      {children}
    </span>
  );
}

/** Linha do resumo: entradas positivas, saídas negativas, sobra destacada pelo sinal. */
function SummaryRow({ label, cents, detail, strong }: { label: string; cents: number; detail?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn("text-muted-foreground", strong && "font-medium text-foreground")}>
        {label}
        {detail && <span className="block text-xs">{detail}</span>}
      </dt>
      <dd
        className={cn(
          "tabular",
          strong ? "text-lg font-semibold" : "font-medium",
          strong && cents < 0 && "text-negative",
          strong && cents > 0 && "text-positive",
        )}
      >
        {strong ? <MoneyCountUp cents={cents} signed /> : formatMoney(cents, { signed: cents !== 0 })}
      </dd>
    </div>
  );
}
