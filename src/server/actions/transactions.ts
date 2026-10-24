"use server";

import { z } from "zod";

import { planInstallments } from "@/domain/credit-card";
import { nextOccurrence } from "@/domain/recurrence";
import { parts } from "@/domain/dates";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
import { transactionFormSchema, transactionUpdateSchema } from "@/lib/transaction-schema";
import { idInput } from "@/lib/validation";
import { ActionError, authedAction, check, found } from "@/server/action";
import type { AuthContext } from "@/server/auth";
import { ensureInvoices, getCardRules, invoiceIdForPurchase } from "@/server/invoices";

type Kind = "income" | "expense" | "refund" | "transfer";

/** Categoria precisa existir, estar ativa e combinar com o tipo do lançamento. */
async function assertCategory(ctx: AuthContext, categoryId: string | null, kind: Kind) {
  if (!categoryId) return;
  const { data } = await ctx.supabase
    .from("categories")
    .select("kind, archived_at")
    .eq("id", categoryId)
    .maybeSingle();
  if (!data) throw new ActionError("Categoria não encontrada.");
  const expected = kind === "refund" ? "expense" : kind;
  if (data.kind !== expected) throw new ActionError("A categoria não combina com o tipo do lançamento.");
}

async function assertActiveAccount(ctx: AuthContext, accountId: string) {
  const { data } = await ctx.supabase.from("accounts").select("archived_at").eq("id", accountId).maybeSingle();
  if (!data) throw new ActionError("Conta não encontrada.");
  if (data.archived_at) throw new ActionError("Esta conta está arquivada.");
}

export const createTransaction = authedAction(
  transactionFormSchema,
  async (v, ctx) => {
    const { supabase } = ctx;
    const kind: Kind = v.mode;
    await assertCategory(ctx, v.categoryId, kind);

    const base = {
      kind,
      description: v.description,
      amount_cents: v.amount,
      occurred_on: v.occurredOn,
      category_id: v.categoryId,
      notes: v.notes,
    } satisfies Partial<TablesInsert<"transactions">>;

    // Compra/estorno no cartão: vai para a fatura da data; parcelas em faturas seguintes.
    if ((kind === "expense" || kind === "refund") && v.source === "card") {
      const card = await getCardRules(ctx, v.cardId!);
      if (card.archived_at) throw new ActionError("Este cartão está arquivado.");

      if (kind === "expense" && v.installments > 1) {
        const plan = planInstallments(v.occurredOn, v.amount, v.installments, card);
        const invoiceIds = await ensureInvoices(ctx, card.id, plan.map((p) => p.invoice));
        const group = crypto.randomUUID();
        const { error } = await supabase.from("transactions").insert(
          plan.map((p, i) => ({
            ...base,
            amount_cents: p.amountCents,
            occurred_on: p.occurredOn,
            status: "paid" as const,
            credit_card_id: card.id,
            invoice_id: invoiceIds[i],
            installment_group_id: group,
            installment_number: p.number,
            installment_total: p.total,
          })),
        );
        check(error, "registrar a compra parcelada");
        return { count: plan.length };
      }

      const invoiceId = await invoiceIdForPurchase(ctx, card, v.occurredOn);
      const { error } = await supabase
        .from("transactions")
        .insert({ ...base, status: "paid", credit_card_id: card.id, invoice_id: invoiceId });
      check(error, "registrar a compra");
      return { count: 1 };
    }

    await assertActiveAccount(ctx, v.accountId!);

    if (kind === "transfer") {
      await assertActiveAccount(ctx, v.destinationAccountId!);
      const { error } = await supabase.from("transactions").insert({
        ...base,
        status: v.status,
        account_id: v.accountId,
        destination_account_id: v.destinationAccountId,
      });
      check(error, "registrar a transferência");
      return { count: 1 };
    }

    let recurringId: string | null = null;
    if (v.repeat !== "none" && (kind === "income" || kind === "expense")) {
      const { data, error } = await supabase
        .from("recurring_transactions")
        .insert({
          kind,
          description: v.description,
          amount_cents: v.amount,
          category_id: v.categoryId,
          account_id: v.accountId!,
          frequency: v.repeat,
          start_on: v.occurredOn,
          next_occurrence_on: nextOccurrence(v.occurredOn, v.repeat, parts(v.occurredOn).day),
        })
        .select("id")
        .single();
      check(error, "criar a recorrência");
      recurringId = found(data).id;
    }

    const { error } = await supabase.from("transactions").insert({
      ...base,
      status: v.status,
      account_id: v.accountId,
      recurring_transaction_id: recurringId,
    });
    check(error, "registrar o lançamento");
    return { count: 1 };
  },
  { message: "Lançamento registrado." },
);

export const updateTransaction = authedAction(
  transactionUpdateSchema,
  async (v, ctx) => {
    const { supabase } = ctx;
    const { data: current } = await supabase
      .from("transactions")
      .select("kind, credit_card_id, installment_group_id, occurred_on")
      .eq("id", v.id)
      .maybeSingle();
    if (!current) throw new ActionError("Lançamento não encontrado.");
    if (current.kind === "invoice_payment") {
      throw new ActionError("Pagamentos de fatura são editados pela tela do cartão.");
    }
    await assertCategory(ctx, v.categoryId, current.kind as Kind);

    const patch: TablesUpdate<"transactions"> = {
      description: v.description,
      amount_cents: v.amount,
      category_id: v.categoryId,
      notes: v.notes,
      status: v.status,
      occurred_on: v.occurredOn,
    };

    if (current.credit_card_id) {
      patch.status = "paid";
      if (current.installment_group_id) {
        // Parcelas ficam presas à fatura original; data não muda.
        patch.occurred_on = current.occurred_on;
      } else if (v.occurredOn !== current.occurred_on) {
        const card = await getCardRules(ctx, current.credit_card_id);
        patch.invoice_id = await invoiceIdForPurchase(ctx, card, v.occurredOn);
      }
    }

    const { data, error } = await supabase.from("transactions").update(patch).eq("id", v.id).select("id").maybeSingle();
    check(error, "salvar o lançamento");
    return found(data, "Lançamento");
  },
  { message: "Lançamento atualizado." },
);

export const markTransactionPaid = authedAction(
  idInput,
  async ({ id }, { supabase }) => {
    const { data, error } = await supabase
      .from("transactions")
      .update({ status: "paid" })
      .eq("id", id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    check(error, "marcar como pago");
    return found(data, "Lançamento pendente");
  },
  { message: "Marcado como efetivado." },
);

export const deleteTransaction = authedAction(
  idInput.extend({ wholeGroup: z.boolean().default(false) }),
  async ({ id, wholeGroup }, { supabase }) => {
    const { data: current } = await supabase
      .from("transactions")
      .select("installment_group_id")
      .eq("id", id)
      .maybeSingle();
    if (!current) throw new ActionError("Lançamento não encontrado.");

    const query = supabase.from("transactions").delete({ count: "exact" });
    const { error, count } =
      wholeGroup && current.installment_group_id
        ? await query.eq("installment_group_id", current.installment_group_id)
        : await query.eq("id", id);
    check(error, "excluir o lançamento");
    return { count: count ?? 0 };
  },
  { message: "Lançamento excluído." },
);
