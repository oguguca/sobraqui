"use server";

import { z } from "zod";

import { invoiceAmount, invoiceDatesFor } from "@/domain/credit-card";
import { monthOf, todayIn } from "@/domain/dates";
import { cardSchema, invoicePaymentSchema } from "@/lib/schemas";
import { idInput, moneyInput, uuid } from "@/lib/validation";
import { ActionError, affected, authedAction, found } from "@/server/action";
import { dbDate } from "@/server/db";
import { recomputeInvoiceAdjustment } from "@/server/invoice-adjustment";
import { invoiceTotals } from "@/server/queries/cards";

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
  async (input, { db, user }) =>
    db((tx) => tx.creditCard.create({ data: { ...toRow(input), user_id: user.id }, select: { id: true } })),
  { message: "Cartão criado." },
);

/**
 * Novos dias de fechamento/vencimento valem para a fatura aberta e as futuras
 * (recalcula as datas delas). Faturas já fechadas mantêm as datas reais.
 */
export const updateCard = authedAction(
  cardSchema.extend({ id: z.uuid() }),
  async ({ id, ...input }, { db, user }) =>
    db(async (tx) => {
      affected(await tx.creditCard.updateMany({ where: { id, user_id: user.id }, data: toRow(input) }), "Cartão");
      const today = todayIn(user.timezone);
      const open = await tx.creditCardInvoice.findMany({
        where: { user_id: user.id, credit_card_id: id, closing_date: { gte: dbDate(today) } },
        select: { id: true, reference_month: true },
      });
      for (const inv of open) {
        const dates = invoiceDatesFor(monthOf(inv.reference_month), input.closingDay, input.dueDay);
        await tx.creditCardInvoice.update({
          where: { id: inv.id },
          data: { closing_date: dbDate(dates.closingDate), due_date: dbDate(dates.dueDate) },
        });
      }
      return { updatedInvoices: open.length };
    }),
  { message: "Cartão atualizado." },
);

export const setCardArchived = authedAction(
  idInput.extend({ archived: z.boolean() }),
  async ({ id, archived }, { db, user }) =>
    affected(
      await db((tx) =>
        tx.creditCard.updateMany({ where: { id, user_id: user.id }, data: { archived_at: archived ? new Date() : null } }),
      ),
      "Cartão",
    ),
);

export const deleteCard = authedAction(
  idInput,
  async ({ id }, { db, user }) =>
    db(async (tx) => {
      if ((await tx.transaction.count({ where: { user_id: user.id, credit_card_id: id } })) > 0) {
        throw new ActionError("Este cartão tem lançamentos. Arquive-o para manter o histórico.");
      }
      await tx.creditCardInvoice.deleteMany({ where: { user_id: user.id, credit_card_id: id } });
      return affected(await tx.creditCard.deleteMany({ where: { id, user_id: user.id } }), "Cartão");
    }),
  { message: "Cartão excluído." },
);

/**
 * Pagamento de fatura: sai da conta e abate a fatura. Não é despesa — as
 * compras do cartão já foram contadas. Aceita pagamento parcial; recusa
 * pagar mais que o saldo em aberto.
 */
export const payInvoice = authedAction(
  invoicePaymentSchema,
  async (input, { db, user }) =>
    db(async (tx) => {
      const userId = user.id;
      const invoice = found(
        await tx.creditCardInvoice.findFirst({
          where: { id: input.invoiceId, user_id: userId },
          include: { credit_card: { select: { name: true } } },
        }),
        "Fatura",
      );
      const account = found(
        await tx.bankAccount.findFirst({ where: { id: input.accountId, user_id: userId }, select: { archived_at: true } }),
        "Conta",
      );
      if (account.archived_at) throw new ActionError("Esta conta está arquivada.");

      const totals = (await invoiceTotals(tx, userId, [invoice.id])).get(invoice.id);
      const remaining = totals ? invoiceAmount(totals) - totals.paid_cents : 0;
      if (remaining <= 0) throw new ActionError("Esta fatura não tem saldo em aberto.");
      if (input.amount > remaining) throw new ActionError("O valor é maior que o saldo em aberto da fatura.");

      const [year, month] = invoice.reference_month.split("-");
      await tx.transaction.create({
        data: {
          user_id: userId,
          kind: "invoice_payment",
          status: "paid",
          amount_cents: input.amount,
          occurred_on: dbDate(input.paidOn),
          description: `Pagamento da fatura ${invoice.credit_card.name} ${month}/${year}`,
          account_id: input.accountId,
          credit_card_id: invoice.credit_card_id,
          invoice_id: invoice.id,
        },
      });
      return { remaining: remaining - input.amount };
    }),
  { message: "Pagamento registrado." },
);

/**
 * Valor da fatura conforme o app do banco. A diferença para os lançamentos
 * vira um ajuste ("juros e encargos"), recalculado ao importar a fatura.
 * Vazio remove o ajuste.
 */
export const setInvoiceBankAmount = authedAction(
  z.object({ invoiceId: uuid, amount: z.union([moneyInput({ allowZero: true }), z.literal("").transform(() => null)]) }),
  async ({ invoiceId, amount }, { db, user }) =>
    db(async (tx) => {
      affected(
        await tx.creditCardInvoice.updateMany({
          where: { id: invoiceId, user_id: user.id },
          data: { bank_amount_cents: amount },
        }),
        "Fatura",
      );
      return { adjustmentCents: await recomputeInvoiceAdjustment(tx, user.id, invoiceId) };
    }),
  { message: "Fatura ajustada ao valor do banco." },
);
