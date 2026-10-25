"use server";

import { z } from "zod";

import { planInstallments } from "@/domain/credit-card";
import { parts } from "@/domain/dates";
import { nextOccurrence } from "@/domain/recurrence";
import type { Prisma } from "@/generated/prisma/client";
import { transactionFormSchema, transactionUpdateSchema, usesCreditCard } from "@/lib/transaction-schema";
import { idInput } from "@/lib/validation";
import { ActionError, affected, authedAction, found } from "@/server/action";
import { dbDate, type Tx } from "@/server/db";
import { ensureInvoices, getCardRules, invoiceIdForPurchase } from "@/server/invoices";

type Kind = "income" | "expense" | "refund" | "transfer";

/** Categoria precisa existir e combinar com o tipo do lançamento. */
async function assertCategory(tx: Tx, userId: string, categoryId: string | null, kind: Kind) {
  if (!categoryId) return;
  const category = await tx.category.findFirst({ where: { id: categoryId, user_id: userId }, select: { kind: true } });
  if (!category) throw new ActionError("Categoria não encontrada.");
  const expected = kind === "refund" ? "expense" : kind;
  if (category.kind !== expected) throw new ActionError("A categoria não combina com o tipo do lançamento.");
}

async function assertActiveAccount(tx: Tx, userId: string, accountId: string) {
  const account = await tx.bankAccount.findFirst({ where: { id: accountId, user_id: userId }, select: { archived_at: true } });
  if (!account) throw new ActionError("Conta não encontrada.");
  if (account.archived_at) throw new ActionError("Esta conta está arquivada.");
}

export const createTransaction = authedAction(
  transactionFormSchema,
  async (v, { db, user }) =>
    db(async (tx) => {
      const userId = user.id;
      const kind: Kind = v.mode;
      await assertCategory(tx, userId, v.categoryId, kind);

      const base = {
        user_id: userId,
        kind,
        description: v.description,
        amount_cents: v.amount,
        occurred_on: dbDate(v.occurredOn),
        category_id: v.categoryId,
        notes: v.notes,
        payment_method: kind === "expense" ? v.paymentMethod : null,
      } satisfies Prisma.TransactionUncheckedCreateInput;

      // Compra/estorno no cartão: vai para a fatura da data; parcelas em faturas seguintes.
      if (usesCreditCard(v)) {
        const card = await getCardRules(tx, userId, v.cardId!);
        if (card.archived_at) throw new ActionError("Este cartão está arquivado.");

        if (kind === "expense" && v.installments > 1) {
          const plan = planInstallments(v.occurredOn, v.amount, v.installments, card);
          const invoiceIds = await ensureInvoices(tx, userId, card.id, plan.map((p) => p.invoice));
          const group = crypto.randomUUID();
          await tx.transaction.createMany({
            data: plan.map((p, i) => ({
              ...base,
              amount_cents: p.amountCents,
              occurred_on: dbDate(p.occurredOn),
              status: "paid" as const,
              credit_card_id: card.id,
              invoice_id: invoiceIds[i],
              installment_group_id: group,
              installment_number: p.number,
              installment_total: p.total,
            })),
          });
          return { count: plan.length };
        }

        const invoiceId = await invoiceIdForPurchase(tx, userId, card, v.occurredOn);
        await tx.transaction.create({ data: { ...base, status: "paid", credit_card_id: card.id, invoice_id: invoiceId } });
        return { count: 1 };
      }

      await assertActiveAccount(tx, userId, v.accountId!);

      if (kind === "transfer") {
        await assertActiveAccount(tx, userId, v.destinationAccountId!);
        await tx.transaction.create({
          data: { ...base, status: v.status, account_id: v.accountId, destination_account_id: v.destinationAccountId },
        });
        return { count: 1 };
      }

      let recurringId: string | null = null;
      if (v.repeat !== "none" && (kind === "income" || kind === "expense")) {
        const rule = await tx.recurringTransaction.create({
          data: {
            user_id: userId,
            kind,
            description: v.description,
            amount_cents: v.amount,
            category_id: v.categoryId,
            account_id: v.accountId!,
            payment_method: kind === "expense" ? v.paymentMethod : null,
            frequency: v.repeat,
            start_on: dbDate(v.occurredOn),
            next_occurrence_on: dbDate(nextOccurrence(v.occurredOn, v.repeat, parts(v.occurredOn).day)),
          },
          select: { id: true },
        });
        recurringId = rule.id;
      }

      await tx.transaction.create({
        data: { ...base, status: v.status, account_id: v.accountId, recurring_transaction_id: recurringId },
      });
      return { count: 1 };
    }),
  { message: "Lançamento registrado." },
);

export const updateTransaction = authedAction(
  transactionUpdateSchema,
  async (v, { db, user }) =>
    db(async (tx) => {
      const userId = user.id;
      const current = found(
        await tx.transaction.findFirst({
          where: { id: v.id, user_id: userId },
          select: { kind: true, credit_card_id: true, installment_group_id: true, occurred_on: true },

        }),
        "Lançamento",
      );
      if (current.kind === "invoice_payment") {
        throw new ActionError("Pagamentos de fatura são editados pela tela do cartão.");
      }
      await assertCategory(tx, userId, v.categoryId, current.kind as Kind);

      const patch: Prisma.TransactionUncheckedUpdateManyInput = {
        description: v.description,
        amount_cents: v.amount,
        category_id: v.categoryId,
        notes: v.notes,
        status: v.status,
        occurred_on: dbDate(v.occurredOn),
      };

      if (current.kind === "expense" && !current.credit_card_id && v.paymentMethod) {
        patch.payment_method = v.paymentMethod;
      }

      if (current.credit_card_id) {
        patch.status = "paid";
        if (current.installment_group_id) {
          // Parcelas ficam presas à fatura original; data não muda.
          patch.occurred_on = dbDate(current.occurred_on);
        } else if (v.occurredOn !== current.occurred_on) {
          const card = await getCardRules(tx, userId, current.credit_card_id);
          patch.invoice_id = await invoiceIdForPurchase(tx, userId, card, v.occurredOn);
        }
      }

      return affected(await tx.transaction.updateMany({ where: { id: v.id, user_id: userId }, data: patch }), "Lançamento");
    }),
  { message: "Lançamento atualizado." },
);

export const markTransactionPaid = authedAction(
  idInput,
  async ({ id }, { db, user }) =>
    affected(
      await db((tx) =>
        tx.transaction.updateMany({ where: { id, user_id: user.id, status: "pending" }, data: { status: "paid" } }),
      ),
      "Lançamento pendente",
    ),
  { message: "Marcado como efetivado." },
);

export const deleteTransaction = authedAction(
  idInput.extend({ wholeGroup: z.boolean().default(false) }),
  async ({ id, wholeGroup }, { db, user }) =>
    db(async (tx) => {
      const current = found(
        await tx.transaction.findFirst({ where: { id, user_id: user.id }, select: { installment_group_id: true } }),
        "Lançamento",
      );
      const where =
        wholeGroup && current.installment_group_id
          ? { user_id: user.id, installment_group_id: current.installment_group_id }
          : { user_id: user.id, id };
      return tx.transaction.deleteMany({ where });
    }),
  { message: "Lançamento excluído." },
);
