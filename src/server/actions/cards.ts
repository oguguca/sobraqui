"use server";

import { z } from "zod";

import { invoiceAmount } from "@/domain/credit-card";
import { cardSchema, invoicePaymentSchema } from "@/lib/schemas";
import { idInput } from "@/lib/validation";
import { ActionError, authedAction, check, found } from "@/server/action";

function toRow(input: z.output<typeof cardSchema>) {
  return {
    name: input.name,
    brand: input.brand,
    limit_cents: input.limit,
    closing_day: input.closingDay,
    due_day: input.dueDay,
    payment_account_id: input.paymentAccountId,
    color: input.color,
  };
}

export const createCard = authedAction(
  cardSchema,
  async (input, { supabase }) => {
    const { data, error } = await supabase.from("credit_cards").insert(toRow(input)).select("id").single();
    check(error, "criar o cartão");
    return found(data);
  },
  { message: "Cartão criado." },
);

/** Novos dias de fechamento/vencimento valem para faturas futuras; as já criadas mantêm as datas. */
export const updateCard = authedAction(
  cardSchema.extend({ id: z.uuid() }),
  async ({ id, ...input }, { supabase }) => {
    const { data, error } = await supabase.from("credit_cards").update(toRow(input)).eq("id", id).select("id").maybeSingle();
    check(error, "salvar o cartão");
    return found(data, "Cartão");
  },
  { message: "Cartão atualizado." },
);

export const setCardArchived = authedAction(
  idInput.extend({ archived: z.boolean() }),
  async ({ id, archived }, { supabase }) => {
    const { data, error } = await supabase
      .from("credit_cards")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    check(error, "arquivar o cartão");
    return found(data, "Cartão");
  },
);

export const deleteCard = authedAction(
  idInput,
  async ({ id }, { supabase }) => {
    const { data, error } = await supabase.from("credit_cards").delete().eq("id", id).select("id").maybeSingle();
    check(error, "excluir o cartão");
    return found(data, "Cartão");
  },
  { message: "Cartão excluído." },
);

/**
 * Pagamento de fatura: sai da conta e abate a fatura. Não é despesa — as
 * compras do cartão já foram contadas. Aceita pagamento parcial; recusa
 * pagar mais que o saldo em aberto.
 */
export const payInvoice = authedAction(
  invoicePaymentSchema,
  async (input, { supabase }) => {
    const { data: invoice } = await supabase
      .from("credit_card_invoices")
      .select("id, credit_card_id, reference_month")
      .eq("id", input.invoiceId)
      .maybeSingle();
    if (!invoice) throw new ActionError("Fatura não encontrada.");

    const { data: account } = await supabase
      .from("accounts")
      .select("id, archived_at")
      .eq("id", input.accountId)
      .maybeSingle();
    if (!account) throw new ActionError("Conta não encontrada.");
    if (account.archived_at) throw new ActionError("Esta conta está arquivada.");

    const { data: totals } = await supabase
      .from("invoice_totals")
      .select("charges_cents, refunds_cents, paid_cents")
      .eq("invoice_id", invoice.id)
      .maybeSingle();
    const remaining = totals ? invoiceAmount(totals) - totals.paid_cents : 0;
    if (remaining <= 0) throw new ActionError("Esta fatura não tem saldo em aberto.");
    if (input.amount > remaining) throw new ActionError("O valor é maior que o saldo em aberto da fatura.");

    const { data: card } = await supabase.from("credit_cards").select("name").eq("id", invoice.credit_card_id).maybeSingle();
    const [year, month] = invoice.reference_month.split("-");

    const { error } = await supabase.from("transactions").insert({
      kind: "invoice_payment",
      status: "paid",
      amount_cents: input.amount,
      occurred_on: input.paidOn,
      description: `Pagamento da fatura ${card?.name ?? "do cartão"} ${month}/${year}`,
      account_id: account.id,
      credit_card_id: invoice.credit_card_id,
      invoice_id: invoice.id,
    });
    check(error, "registrar o pagamento");
    return { remaining: remaining - input.amount };
  },
  { message: "Pagamento registrado." },
);
