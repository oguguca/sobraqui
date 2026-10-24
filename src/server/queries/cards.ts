import "server-only";

import {
  invoiceAmount,
  invoiceDatesFor,
  invoiceForPurchase,
  invoiceStatus,
  type InvoiceStatus,
} from "@/domain/credit-card";
import { monthOf } from "@/domain/dates";
import type { Tables } from "@/lib/supabase/database.types";
import type { AuthContext } from "@/server/auth";

import { fetchAll } from "./core";

export type InvoiceSummary = Tables<"credit_card_invoices"> & {
  chargesCents: number;
  refundsCents: number;
  paidCents: number;
  amountCents: number;
  remainingCents: number;
  status: InvoiceStatus;
};

export async function listInvoices(ctx: AuthContext, cardId: string, today: string): Promise<InvoiceSummary[]> {
  const [invoices, totals] = await Promise.all([
    fetchAll((from, to) =>
      ctx.supabase
        .from("credit_card_invoices")
        .select("*")
        .eq("credit_card_id", cardId)
        .order("reference_month", { ascending: false })
        .range(from, to),
    ),
    fetchAll((from, to) =>
      ctx.supabase.from("invoice_totals").select("*").eq("credit_card_id", cardId).range(from, to),
    ),
  ]);
  const byId = new Map(totals.map((t) => [t.invoice_id, t]));
  return invoices.map((inv) => {
    const t = byId.get(inv.id) ?? { charges_cents: 0, refunds_cents: 0, paid_cents: 0 };
    const amount = invoiceAmount(t);
    return {
      ...inv,
      chargesCents: t.charges_cents,
      refundsCents: t.refunds_cents,
      paidCents: t.paid_cents,
      amountCents: amount,
      remainingCents: amount - t.paid_cents,
      status: invoiceStatus(inv, t, today),
    };
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
  return fetchAll((from, to) =>
    ctx.supabase
      .from("transactions")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to),
  );
}
