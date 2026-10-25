import "server-only";

import {
  invoiceAmount,
  invoiceDatesFor,
  invoiceForPurchase,
  invoiceStatus,
  type InvoiceStatus,
} from "@/domain/credit-card";
import { monthOf } from "@/domain/dates";
import type { Tables } from "@/lib/db/types";
import type { AuthContext } from "@/server/auth";
import type { Tx } from "@/server/db";

export type InvoiceSummary = Tables<"credit_card_invoices"> & {
  chargesCents: number;
  refundsCents: number;
  paidCents: number;
  amountCents: number;
  remainingCents: number;
  status: InvoiceStatus;
};

export type InvoiceTotals = { charges_cents: number; refunds_cents: number; paid_cents: number };

/** Compras, estornos e pagamentos efetivados por fatura (agregado no banco). */
export async function invoiceTotals(
  tx: Tx,
  userId: string,
  invoiceIds: string[],
): Promise<Map<string, InvoiceTotals>> {
  const totals = new Map<string, InvoiceTotals>();
  if (invoiceIds.length === 0) return totals;
  const groups = await tx.transaction.groupBy({
    by: ["invoice_id", "kind", "status"],
    where: { user_id: userId, invoice_id: { in: invoiceIds } },
    _sum: { amount_cents: true },
  });
  for (const g of groups) {
    const t = totals.get(g.invoice_id!) ?? { charges_cents: 0, refunds_cents: 0, paid_cents: 0 };
    const cents = Number(g._sum.amount_cents ?? 0);
    if (g.kind === "expense") t.charges_cents += cents;
    else if (g.kind === "refund") t.refunds_cents += cents;
    else if (g.kind === "invoice_payment" && g.status === "paid") t.paid_cents += cents;
    totals.set(g.invoice_id!, t);
  }
  return totals;
}

export function summarizeInvoice(
  inv: Tables<"credit_card_invoices">,
  t: InvoiceTotals | undefined,
  today: string,
): InvoiceSummary {
  const totals = t ?? { charges_cents: 0, refunds_cents: 0, paid_cents: 0 };
  const amount = invoiceAmount(totals);
  return {
    ...inv,
    chargesCents: totals.charges_cents,
    refundsCents: totals.refunds_cents,
    paidCents: totals.paid_cents,
    amountCents: amount,
    remainingCents: amount - totals.paid_cents,
    status: invoiceStatus(inv, totals, today),
  };
}

export async function listInvoices(ctx: AuthContext, cardId: string, today: string): Promise<InvoiceSummary[]> {
  const userId = ctx.user.id;
  return ctx.db(async (tx) => {
    const invoices = await tx.creditCardInvoice.findMany({
      where: { user_id: userId, credit_card_id: cardId },
      orderBy: { reference_month: "desc" },
    });
    const totals = await invoiceTotals(tx, userId, invoices.map((i) => i.id));
    return invoices.map((inv) => summarizeInvoice(inv, totals.get(inv.id), today));
  });
}

/** Mês de referência da fatura aberta hoje para o cartão. */
export function currentInvoiceMonth(card: { closing_day: number; due_day: number }, today: string): string {
  return monthOf(invoiceForPurchase(today, card.closing_day, card.due_day).referenceMonth);
}

/** Fatura do mês escolhido; se ainda não existe, mostra as datas previstas sem criar nada. */
export function invoiceOrPlaceholder(
  invoices: InvoiceSummary[],
  card: { id: string; closing_day: number; due_day: number },
  month: string,
  today: string,
): InvoiceSummary {
  const found = invoices.find((i) => monthOf(i.reference_month) === month);
  if (found) return found;
  const dates = invoiceDatesFor(month, card.closing_day, card.due_day);
  return {
    id: "",
    user_id: "",
    credit_card_id: card.id,
    reference_month: dates.referenceMonth,
    closing_date: dates.closingDate,
    due_date: dates.dueDate,
    bank_amount_cents: null,
    created_at: "",
    updated_at: "",
    chargesCents: 0,
    refundsCents: 0,
    paidCents: 0,
    amountCents: 0,
    remainingCents: 0,
    status: invoiceStatus(
      { closing_date: dates.closingDate, due_date: dates.dueDate },
      { charges_cents: 0, refunds_cents: 0, paid_cents: 0 },
      today,
    ),
  };
}

export async function invoiceTransactions(ctx: AuthContext, invoiceId: string) {
  if (!invoiceId) return [];
  return ctx.db((tx) =>
    tx.transaction.findMany({
      where: { user_id: ctx.user.id, invoice_id: invoiceId },
      orderBy: [{ occurred_on: "desc" }, { created_at: "desc" }],
    }),
  );
}
