"use server";

import { z } from "zod";

import { addMonthsToMonth, monthStart } from "@/domain/dates";
import { budgetSchema, goalContributionSchema, goalSchema } from "@/lib/schemas";
import { idInput, isoMonth } from "@/lib/validation";
import { ActionError, authedAction, check, found } from "@/server/action";

// ---------------------------------------------------------------------------
// Orçamento
// ---------------------------------------------------------------------------

export const setBudget = authedAction(
  budgetSchema,
  async (input, { supabase }) => {
    const { data: category } = await supabase
      .from("categories")
      .select("kind")
      .eq("id", input.categoryId)
      .maybeSingle();
    if (!category) throw new ActionError("Categoria não encontrada.");
    if (category.kind !== "expense") throw new ActionError("Orçamentos são definidos para categorias de despesa.");

    const { error } = await supabase.from("budgets").upsert(
      { category_id: input.categoryId, month: monthStart(input.month), limit_cents: input.limit },
      { onConflict: "user_id,category_id,month" },
    );
    check(error, "salvar o orçamento");
    return null;
  },
  { message: "Orçamento salvo." },
);

export const deleteBudget = authedAction(
  idInput,
  async ({ id }, { supabase }) => {
    const { data, error } = await supabase.from("budgets").delete().eq("id", id).select("id").maybeSingle();
    check(error, "remover o orçamento");
    return found(data, "Orçamento");
  },
  { message: "Orçamento removido." },
);

/** Copia os limites do mês anterior sem sobrescrever o que já foi definido. */
export const copyPreviousBudgets = authedAction(
  z.object({ month: isoMonth }),
  async ({ month }, { supabase }) => {
    const { data: previous, error } = await supabase
      .from("budgets")
      .select("category_id, limit_cents")
      .eq("month", monthStart(addMonthsToMonth(month, -1)));
    check(error, "carregar o mês anterior");
    if (!previous?.length) throw new ActionError("O mês anterior não tem orçamento definido.");

    const { error: upsertError } = await supabase.from("budgets").upsert(
      previous.map((b) => ({ category_id: b.category_id, month: monthStart(month), limit_cents: b.limit_cents })),
      { onConflict: "user_id,category_id,month", ignoreDuplicates: true },
    );
    check(upsertError, "copiar o orçamento");
    return { count: previous.length };
  },
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
    target_date: input.targetDate,
    color: input.color,
  };
}

export const createGoal = authedAction(
  goalSchema,
  async (input, { supabase }) => {
    const { data, error } = await supabase.from("financial_goals").insert(goalRow(input)).select("id").single();
    check(error, "criar a meta");
    return found(data);
  },
  { message: "Meta criada." },
);

export const updateGoal = authedAction(
  goalSchema.extend({ id: z.uuid() }),
  async ({ id, ...input }, { supabase }) => {
    const { data, error } = await supabase.from("financial_goals").update(goalRow(input)).eq("id", id).select("id").maybeSingle();
    check(error, "salvar a meta");
    return found(data, "Meta");
  },
  { message: "Meta atualizada." },
);

/** Guarda (valor positivo) ou retira (negativo) dinheiro da meta. */
export const contributeToGoal = authedAction(
  goalContributionSchema,
  async ({ id, amount }, { supabase }) => {
    const { data: goal } = await supabase.from("financial_goals").select("saved_cents").eq("id", id).maybeSingle();
    if (!goal) throw new ActionError("Meta não encontrada.");
    const saved = goal.saved_cents + amount;
    if (saved < 0) throw new ActionError("Não é possível retirar mais do que está guardado.");
    // Compara com o valor lido para não perder um aporte concorrente.
    const { data, error } = await supabase
      .from("financial_goals")
      .update({ saved_cents: saved })
      .eq("id", id)
      .eq("saved_cents", goal.saved_cents)
      .select("id")
      .maybeSingle();
    check(error, "atualizar a meta");
    if (!data) throw new ActionError("A meta mudou enquanto você editava. Tente de novo.");
    return { savedCents: saved };
  },
  { message: "Meta atualizada." },
);

export const setGoalArchived = authedAction(
  idInput.extend({ archived: z.boolean() }),
  async ({ id, archived }, { supabase }) => {
    const { data, error } = await supabase
      .from("financial_goals")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    check(error, "arquivar a meta");
    return found(data, "Meta");
  },
);

export const deleteGoal = authedAction(
  idInput,
  async ({ id }, { supabase }) => {
    const { data, error } = await supabase.from("financial_goals").delete().eq("id", id).select("id").maybeSingle();
    check(error, "excluir a meta");
    return found(data, "Meta");
  },
  { message: "Meta excluída." },
);
