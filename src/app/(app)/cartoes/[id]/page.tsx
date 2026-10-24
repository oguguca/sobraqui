import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { CardActions } from "@/components/cards/card-actions";
import { PayInvoiceDialog } from "@/components/cards/pay-invoice-dialog";
import { ColorDot, EmptyState, Money, PageHeader } from "@/components/shared";
import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { INVOICE_STATUS_LABEL, type InvoiceStatus } from "@/domain/credit-card";
import { addMonthsToMonth, formatDate, formatMonth, isISOMonth, monthOf } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { cn } from "@/lib/utils";
import { requireAuth } from "@/server/auth";
import { currentInvoiceMonth, invoiceOrPlaceholder, invoiceTransactions, listInvoices } from "@/server/queries/cards";
import { loadLedgerContext } from "@/server/queries/context";

export const metadata: Metadata = { title: "Cartão" };

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  open: "border-chart-3/40 text-foreground",
  closed: "border-warning/50 text-warning",
  overdue: "border-negative/50 text-negative",
  paid: "border-positive/50 text-positive",
  empty: "text-muted-foreground",
};

export default async function CardPage({ params, searchParams }: PageProps<"/cartoes/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireAuth();
  const ledger = await loadLedgerContext(ctx);
  const card = ledger.cards.find((c) => c.id === id);
  if (!card) notFound();

  const today = ledger.today;
  const invoices = await listInvoices(ctx, card.id, today);
  const requested = (await searchParams).fatura;
  const currentMonth = currentInvoiceMonth(card, today);
  const month = typeof requested === "string" && isISOMonth(requested) ? requested : currentMonth;
  const invoice = invoiceOrPlaceholder(invoices, card, month, today);
  const rows = await invoiceTransactions(ctx, invoice.id);

  // Parcelas futuras: compras já lançadas em faturas posteriores à atual.
  const future = invoices
    .filter((i) => monthOf(i.reference_month) > currentMonth && i.amountCents > 0)
    .sort((a, b) => a.reference_month.localeCompare(b.reference_month));
  const futureTotal = future.reduce((s, i) => s + i.amountCents, 0);
  const history = invoices.filter((i) => i.amountCents > 0 || i.paidCents > 0).slice(0, 12);

  return (
    <>
      <Link href="/cartoes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Cartões
      </Link>
      <PageHeader
        title={card.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ColorDot color={card.color} />
            Fecha dia {card.closing_day} · vence dia {card.due_day}
            {card.brand ? ` · ${card.brand}` : ""}
            {card.archived_at && <Badge variant="secondary">Arquivado</Badge>}
          </span>
        }
        actions={
          <>
            <CardActions card={card} accounts={ledger.formOptions.accounts} />
            {!card.archived_at && (
              <TransactionFormDialog
                options={ledger.formOptions}
                today={today}
                defaults={{ source: "card", cardId: card.id }}
                trigger={
                  <Button>
                    <Plus /> Nova compra
                  </Button>
                }
              />
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Limite disponível</p>
            <Money cents={card.available_cents} tone={card.available_cents < 0 ? "negative" : "neutral"} className="mt-1 block text-2xl font-semibold" />
            <p className="mt-1 text-xs text-muted-foreground">de {formatMoney(card.limit_cents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Comprometido no cartão</p>
            <Money cents={Math.max(0, card.used_cents)} className="mt-1 block text-2xl font-semibold" />
            <p className="mt-1 text-xs text-muted-foreground">faturas em aberto e parcelas futuras</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Parcelas futuras</p>
            <Money cents={futureTotal} className="mt-1 block text-2xl font-semibold" />
            <p className="mt-1 text-xs text-muted-foreground">{future.length} fatura(s) à frente</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="py-4 lg:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" asChild aria-label="Fatura anterior">
                  <Link href={`/cartoes/${card.id}?fatura=${addMonthsToMonth(month, -1)}`}>
                    <ChevronLeft />
                  </Link>
                </Button>
                <div className="min-w-44 text-center">
                  <CardTitle className="capitalize">Fatura de {formatMonth(month)}</CardTitle>
                  <CardDescription>
                    Fecha {formatDate(invoice.closing_date)} · vence {formatDate(invoice.due_date)}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="icon" asChild aria-label="Próxima fatura">
                  <Link href={`/cartoes/${card.id}?fatura=${addMonthsToMonth(month, 1)}`}>
                    <ChevronRight />
                  </Link>
                </Button>
              </div>
              <Badge variant="outline" className={cn(STATUS_STYLE[invoice.status])}>
                {INVOICE_STATUS_LABEL[invoice.status]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 px-2 sm:px-4">
            <dl className="grid grid-cols-2 gap-4 px-2 text-sm sm:grid-cols-4">
              <Figure label="Compras" cents={invoice.chargesCents} />
              <Figure label="Estornos" cents={invoice.refundsCents} />
              <Figure label="Pago" cents={invoice.paidCents} />
              <Figure label="Em aberto" cents={Math.max(0, invoice.remainingCents)} strong />
            </dl>
            {invoice.id && invoice.remainingCents > 0 && month <= currentMonth && (
              <div className="px-2">
                <PayInvoiceDialog
                  invoiceId={invoice.id}
                  remainingCents={invoice.remainingCents}
                  accounts={ledger.formOptions.accounts}
                  defaultAccountId={card.payment_account_id}
                  today={today}
                  trigger={<Button>Pagar fatura</Button>}
                />
              </div>
            )}
            {rows.length === 0 ? (
              <EmptyState icon={Receipt} title="Nenhum lançamento nesta fatura" className="border-0" />
            ) : (
              <TransactionsTable rows={rows} lookups={ledger.lookups} compact />
            )}
          </CardContent>
        </Card>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Próximas faturas</CardTitle>
              <CardDescription>Parcelas já lançadas.</CardDescription>
            </CardHeader>
            <CardContent>
              {future.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma parcela futura.</p>
              ) : (
                <InvoiceList cardId={card.id} invoices={future} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Histórico</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem faturas ainda.</p>
              ) : (
                <InvoiceList cardId={card.id} invoices={history} showStatus />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Figure({ label, cents, strong }: { label: string; cents: number; strong?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular", strong ? "text-lg font-semibold" : "font-medium")}>{formatMoney(cents)}</dd>
    </div>
  );
}

function InvoiceList({
  cardId,
  invoices,
  showStatus,
}: {
  cardId: string;
  invoices: { id: string; reference_month: string; due_date: string; amountCents: number; status: InvoiceStatus }[];
  showStatus?: boolean;
}) {
  return (
    <ul className="grid gap-2 text-sm">
      {invoices.map((i) => (
        <li key={i.id}>
          <Link
            href={`/cartoes/${cardId}?fatura=${monthOf(i.reference_month)}`}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
          >
            <span>
              <span className="capitalize">{formatMonth(monthOf(i.reference_month))}</span>
              {showStatus && <span className="ml-2 text-xs text-muted-foreground">{INVOICE_STATUS_LABEL[i.status]}</span>}
            </span>
            <Money cents={i.amountCents} className="font-medium" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
