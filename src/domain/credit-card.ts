import type { ISODate, ISOMonth } from "./dates";
import {
  addMonthsToMonth,
  daysInMonth,
  monthOf,
  monthStart,
  parts,
  toISODate,
} from "./dates";

export type InvoiceDates = {
  /** AAAA-MM-01 do mês em que a fatura fecha. */
  referenceMonth: ISODate;
  closingDate: ISODate;
  dueDate: ISODate;
};

function clampDay(month: ISOMonth, day: number): ISODate {
  const [y, m] = month.split("-").map(Number);
  return toISODate(y, m, Math.min(day, daysInMonth(y, m)));
}

/** Datas da fatura que fecha em `closingMonth`. */
export function invoiceDatesFor(
  closingMonth: ISOMonth,
  closingDay: number,
  dueDay: number,
): InvoiceDates {
  const closingDate = clampDay(closingMonth, closingDay);
  // Vencimento depois do fechamento: mesmo mês; senão, mês seguinte.
  const dueMonth = dueDay > closingDay ? closingMonth : addMonthsToMonth(closingMonth, 1);
  return {
    referenceMonth: monthStart(closingMonth),
    closingDate,
    dueDate: clampDay(dueMonth, dueDay),
  };
}

/**
 * Fatura em que cai uma compra. Compras no dia do fechamento ou depois vão
 * para a fatura seguinte (o dia do fechamento é o "melhor dia de compra").
 */
export function invoiceForPurchase(
  purchaseDate: ISODate,
  closingDay: number,
  dueDay: number,
): InvoiceDates {
  const month = monthOf(purchaseDate);
  const closingThisMonth = clampDay(month, closingDay);
  const closingMonth = purchaseDate < closingThisMonth ? month : addMonthsToMonth(month, 1);
  return invoiceDatesFor(closingMonth, closingDay, dueDay);
}

/** Divide o total em parcelas inteiras; a primeira absorve os centavos que sobram. */
export function splitInstallments(totalCents: number, count: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error("O total deve ser um inteiro positivo de centavos.");
  }
  if (!Number.isInteger(count) || count < 1) throw new Error("Quantidade de parcelas inválida.");
  if (totalCents < count) throw new Error("Cada parcela precisa ter pelo menos R$ 0,01.");
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base));
}

export type InstallmentPlan = {
  number: number;
  total: number;
  amountCents: number;
  /** Data de competência da parcela (compra + n meses). */
  occurredOn: ISODate;
  invoice: InvoiceDates;
};

export function planInstallments(
  purchaseDate: ISODate,
  totalCents: number,
  count: number,
  card: { closing_day: number; due_day: number },
): InstallmentPlan[] {
  const amounts = splitInstallments(totalCents, count);
  const first = invoiceForPurchase(purchaseDate, card.closing_day, card.due_day);
  const firstMonth = monthOf(first.referenceMonth);
  const { day } = parts(purchaseDate);
  return amounts.map((amountCents, i) => {
    const month = addMonthsToMonth(monthOf(purchaseDate), i);
    return {
      number: i + 1,
      total: count,
      amountCents,
      occurredOn: clampDay(month, day),
      invoice: invoiceDatesFor(addMonthsToMonth(firstMonth, i), card.closing_day, card.due_day),
    };
  });
}

export type InvoiceStatus = "open" | "closed" | "overdue" | "paid" | "empty";

export function invoiceStatus(
  invoice: { closing_date: ISODate; due_date: ISODate },
  totals: { charges_cents: number; refunds_cents: number; paid_cents: number },
  today: ISODate,
): InvoiceStatus {
  const amount = totals.charges_cents - totals.refunds_cents;
  const remaining = amount - totals.paid_cents;
  if (today < invoice.closing_date) return amount <= 0 && totals.charges_cents === 0 ? "empty" : "open";
  if (amount <= 0 && totals.charges_cents === 0) return "empty";
  if (remaining <= 0) return "paid";
  return today > invoice.due_date ? "overdue" : "closed";
}

export function invoiceAmount(totals: { charges_cents: number; refunds_cents: number }): number {
  return totals.charges_cents - totals.refunds_cents;
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  open: "Aberta",
  closed: "Fechada",
  overdue: "Vencida",
  paid: "Paga",
  empty: "Sem lançamentos",
};

/**
 * Ciclo da fatura aberta hoje: do último fechamento (compras desse dia já
 * entram nela) até o vencimento dela. É o período padrão das sincronizações.
 */
export function openInvoiceCycle(
  today: ISODate,
  closingDay: number,
  dueDay: number,
): { from: ISODate; to: ISODate; closingDate: ISODate; dueDate: ISODate } {
  const open = invoiceForPurchase(today, closingDay, dueDay);
  const previous = invoiceDatesFor(addMonthsToMonth(monthOf(open.referenceMonth), -1), closingDay, dueDay);
  return { from: previous.closingDate, to: open.dueDate, closingDate: open.closingDate, dueDate: open.dueDate };
}
