"use server";

import { z } from "zod";

import { ActionError, authedAction, check, found } from "@/server/action";
import { categorySchema } from "@/lib/schemas";
import { idInput } from "@/lib/validation";

export const createCategory = authedAction(
  categorySchema,
  async (input, { supabase }) => {
    const { data, error } = await supabase.from("categories").insert(input).select("id").single();
    check(error, "criar a categoria");
    return found(data);
  },
  { message: "Categoria criada." },
);

export const updateCategory = authedAction(
  categorySchema.extend({ id: z.uuid() }),
  async ({ id, ...input }, { supabase }) => {
    const { data: current } = await supabase.from("categories").select("kind").eq("id", id).maybeSingle();
    found(current, "Categoria");
    if (current!.kind !== input.kind) {
      const { count } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("category_id", id);
      if ((count ?? 0) > 0) {
        throw new ActionError("Não é possível mudar o tipo de uma categoria que já tem lançamentos.");
      }
    }
    const { data, error } = await supabase.from("categories").update(input).eq("id", id).select("id").maybeSingle();
    check(error, "salvar a categoria");
    return found(data, "Categoria");
  },
  { message: "Categoria atualizada." },
);

export const setCategoryArchived = authedAction(
  idInput.extend({ archived: z.boolean() }),
  async ({ id, archived }, { supabase }) => {
    const { data, error } = await supabase
      .from("categories")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    check(error, "arquivar a categoria");
    return found(data, "Categoria");
  },
);

/** Exclui só categorias sem lançamentos; as usadas devem ser arquivadas. */
export const deleteCategory = authedAction(
  idInput,
  async ({ id }, { supabase }) => {
    const { count } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id);
    if ((count ?? 0) > 0) {
      throw new ActionError("Esta categoria tem lançamentos. Arquive-a para escondê-la sem perder o histórico.");
    }
    const { data, error } = await supabase.from("categories").delete().eq("id", id).select("id").maybeSingle();
    check(error, "excluir a categoria");
    return found(data, "Categoria");
  },
  { message: "Categoria excluída." },
);
