"use server";

import { z } from "zod";

import { authedAction, check, found } from "@/server/action";
import { accountSchema } from "@/lib/schemas";
import { idInput } from "@/lib/validation";

export const createAccount = authedAction(
  accountSchema,
  async (input, { supabase }) => {
    const { data, error } = await supabase
      .from("accounts")
      .insert({
        name: input.name,
        type: input.type,
        institution: input.institution,
        initial_balance_cents: input.initialBalance,
        color: input.color,
      })
      .select("id")
      .single();
    check(error, "criar a conta");
    return found(data);
  },
  { message: "Conta criada." },
);

export const updateAccount = authedAction(
  accountSchema.extend({ id: z.uuid() }),
  async (input, { supabase }) => {
    const { data, error } = await supabase
      .from("accounts")
      .update({
        name: input.name,
        type: input.type,
        institution: input.institution,
        initial_balance_cents: input.initialBalance,
        color: input.color,
      })
      .eq("id", input.id)
      .select("id")
      .maybeSingle();
    check(error, "salvar a conta");
    return found(data, "Conta");
  },
  { message: "Conta atualizada." },
);

export const setAccountArchived = authedAction(
  idInput.extend({ archived: z.boolean() }),
  async ({ id, archived }, { supabase }) => {
    const { data, error } = await supabase
      .from("accounts")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    check(error, "arquivar a conta");
    return found(data, "Conta");
  },
);

/** Só exclui contas sem lançamentos (o banco recusa com FK restrict). */
export const deleteAccount = authedAction(
  idInput,
  async ({ id }, { supabase }) => {
    const { data, error } = await supabase.from("accounts").delete().eq("id", id).select("id").maybeSingle();
    check(error, "excluir a conta");
    return found(data, "Conta");
  },
  { message: "Conta excluída." },
);
