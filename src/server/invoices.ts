import "server-only";

import { invoiceForPurchase, type InvoiceDates } from "@/domain/credit-card";
import type { ISODate } from "@/domain/dates";
import { ActionError } from "@/server/action";
import { dbDate, type Tx } from "@/server/db";

export type CardRules = { id: string; closing_day: number; due_day: number; archived_at: string | null };

export async function getCardRules(tx: Tx, userId: string, cardId: string): Promise<CardRules> {
  const card = await tx.creditCard.findFirst({
    where: { id: cardId, user_id: userId },
    select: { id: true, closing_day: true, due_day: true, archived_at: true },
  });
  if (!card) throw new ActionError("Cartão não encontrado.");
  return card;
}

/** Garante que as faturas existem e devolve o id de cada uma, na mesma ordem. */
export async function ensureInvoices(
  tx: Tx,
  userId: string,
  cardId: string,
  invoices: InvoiceDates[],
): Promise<string[]> {
  const unique = [...new Map(invoices.map((i) => [i.referenceMonth, i])).values()];
  await tx.creditCardInvoice.createMany({
    data: unique.map((i) => ({
      user_id: userId,
      credit_card_id: cardId,
      reference_month: dbDate(i.referenceMonth),
      closing_date: dbDate(i.closingDate),
      due_date: dbDate(i.dueDate),
    })),
    skipDuplicates: true,
  });
  const rows = await tx.creditCardInvoice.findMany({
    where: { user_id: userId, credit_card_id: cardId, reference_month: { in: unique.map((i) => dbDate(i.referenceMonth)) } },
    select: { id: true, reference_month: true },
  });
  const byMonth = new Map(rows.map((r) => [r.reference_month, r.id]));
  return invoices.map((i) => {
    const id = byMonth.get(i.referenceMonth);
    if (!id) throw new ActionError("Não foi possível localizar a fatura.");
    return id;
  });
}

export async function invoiceIdForPurchase(tx: Tx, userId: string, card: CardRules, date: ISODate): Promise<string> {
  const [id] = await ensureInvoices(tx, userId, card.id, [invoiceForPurchase(date, card.closing_day, card.due_day)]);
  return id;
}
