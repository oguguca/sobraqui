"use server";

import { z } from "zod";

import { addMonthsToMonth, monthStart } from "@/domain/dates";
import { budgetSchema, goalContributionSchema, goalSchema } from "@/lib/schemas";
import { idInput, isoMonth } from "@/lib/validation";
import { ActionError, affected, authedAction, found } from "@/server/action";
import { dbDate, dbDateOrNull } from "@/server/db";

// ---------------------------------------------------------------------------
// Orçamento
// ---------------------------------------------------------------------------

export const setBudget = authedAction(
  budgetSchema,
  async (input, { db, user }) =>
    db(async (tx) => {
      const category = found(
        await tx.category.findFirst({ where: { id: input.categoryId, user_id: user.id }, select: { kind: true } }),
        "Categoria",
      );
      if (category.kind !== "expense") throw new ActionError("Orçamentos são definidos para categorias de despesa.");
      const month = dbDate(monthStart(input.month));
      await tx.budget.upsert({
        where: { user_id_category_id_month: { user_id: user.id, category_id: input.categoryId, month } },
        create: { user_id: user.id, category_id: input.categoryId, month, limit_cents: input.limit },
        update: { limit_cents: input.limit },
      });
      return null;
    }),
  { message: "Orçamento salvo." },
);

export const deleteBudget = authedAction(
  idInput,
  async ({ id }, { db, user }) =>
    affected(await db((tx) => tx.budget.deleteMany({ where: { id, user_id: user.id } })), "Orçamento"),
  { message: "Orçamento removido." },
);

/** Copia os limites do mês anterior sem sobrescrever o que já foi definido. */
export const copyPreviousBudgets = authedAction(
  z.object({ month: isoMonth }),
  async ({ month }, { db, user }) =>
    db(async (tx) => {
      const previous = await tx.budget.findMany({
        where: { user_id: user.id, month: dbDate(monthStart(addMonthsToMonth(month, -1))) },
        select: { category_id: true, limit_cents: true },
      });
      if (previous.length === 0) throw new ActionError("O mês anterior não tem orçamento definido.");
      return tx.budget.createMany({
        data: previous.map((b) => ({
          user_id: user.id,
          category_id: b.category_id,
          month: dbDate(monthStart(month)),
          limit_cents: b.limit_cents,
        })),
        skipDuplicates: true,
      });
    }),
  { message: "Orçamento copiado do mês anterior." },
);

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------

function goalRow(input: z.output<typeof goalSchema>) {
  return {
    name: input.name,
    kind: input.kind,
    target_cents: input.target,
    saved_cents: input.saved,
    target_date: dbDateOrNull(input.targetDate),
    color: input.color,
  };
}

export const createGoal = authedAction(
  goalSchema,
  async (input, { db, user }) =>
    db((tx) => tx.financialGoal.create({ data: { ...goalRow(input), user_id: user.id }, select: { id: true } })),
  { message: "Meta criada." },
);

export const updateGoal = authedAction(
  goalSchema.extend({ id: z.uuid() }),
  async ({ id, ...input }, { db, user }) =>
    affected(await db((tx) => tx.financialGoal.updateMany({ where: { id, user_id: user.id }, data: goalRow(input) })), "Meta"),
  { message: "Meta atualizada." },
);

/** Guarda (valor positivo) ou retira (negativo) dinheiro da meta, de forma atômica. */
export const contributeToGoal = authedAction(
  goalContributionSchema,
  async ({ id, amount }, { db, user }) =>
    db(async (tx) => {
      const result = await tx.financialGoal.updateMany({
        // Retirada só se houver saldo suficiente; incremento feito pelo banco.
        where: { id, user_id: user.id, ...(amount < 0 ? { saved_cents: { gte: -amount } } : {}) },
        data: { saved_cents: { increment: amount } },
      });
      if (result.count === 0) {
        const exists = await tx.financialGoal.count({ where: { id, user_id: user.id } });
        throw new ActionError(exists ? "Não é possível retirar mais do que está guardado." : "Meta não encontrada.");
      }
      return null;
    }),
  { message: "Meta atualizada." },
);

export const setGoalArchived = authedAction(
  idInput.extend({ archived: z.boolean() }),
  async ({ id, archived }, { db, user }) =>
    affected(
      await db((tx) =>
        tx.financialGoal.updateMany({ where: { id, user_id: user.id }, data: { archived_at: archived ? new Date() : null } }),
      ),
      "Meta",
    ),
);

export const deleteGoal = authedAction(
  idInput,
  async ({ id }, { db, user }) =>
    affected(await db((tx) => tx.financialGoal.deleteMany({ where: { id, user_id: user.id } })), "Meta"),
  { message: "Meta excluída." },
);
