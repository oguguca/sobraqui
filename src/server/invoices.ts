import "server-only";

import { invoiceForPurchase, type InvoiceDates } from "@/domain/credit-card";
import type { ISODate } from "@/domain/dates";
import { ActionError, check } from "@/server/action";
import type { AuthContext } from "@/server/auth";

export type CardRules = { id: string; closing_day: number; due_day: number; archived_at: string | null };

export async function getCardRules({ supabase }: AuthContext, cardId: string): Promise<CardRules> {
  const { data } = await supabase
    .from("credit_cards")
    .select("id, closing_day, due_day, archived_at")
    .eq("id", cardId)
    .maybeSingle();
  if (!data) throw new ActionError("Cartão não encontrado.");
  return data;
}

/** Garante que as faturas existem e devolve o id de cada uma, na mesma ordem. */
export async function ensureInvoices(
  { supabase }: AuthContext,
  cardId: string,
  invoices: InvoiceDates[],
): Promise<string[]> {
  const unique = [...new Map(invoices.map((i) => [i.referenceMonth, i])).values()];
  const { error } = await supabase.from("credit_card_invoices").upsert(
    unique.map((i) => ({
      credit_card_id: cardId,
      reference_month: i.referenceMonth,
      closing_date: i.closingDate,
      due_date: i.dueDate,
    })),
    { onConflict: "credit_card_id,reference_month", ignoreDuplicates: true },
  );
  check(error, "criar a fatura");

  const { data, error: selectError } = await supabase
    .from("credit_card_invoices")
    .select("id, reference_month")
    .eq("credit_card_id", cardId)
    .in(
      "reference_month",
      unique.map((i) => i.referenceMonth),
    );
  check(selectError, "carregar a fatura");
  const byMonth = new Map((data ?? []).map((row) => [row.reference_month, row.id]));
  return invoices.map((i) => {
    const id = byMonth.get(i.referenceMonth);
    if (!id) throw new ActionError("Não foi possível localizar a fatura.");
    return id;
  });
}

export async function invoiceIdForPurchase(ctx: AuthContext, card: CardRules, date: ISODate): Promise<string> {
  const [id] = await ensureInvoices(ctx, card.id, [invoiceForPurchase(date, card.closing_day, card.due_day)]);
  return id;
}
