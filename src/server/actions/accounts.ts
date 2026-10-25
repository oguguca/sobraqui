"use server";

import { z } from "zod";

import { accountSchema } from "@/lib/schemas";
import { idInput } from "@/lib/validation";
import { affected, authedAction } from "@/server/action";

function toRow(input: z.output<typeof accountSchema>) {
  return {
    name: input.name,
    type: input.type,
    institution: input.institution,
    initial_balance_cents: input.initialBalance,
    color: input.color,
  };
}

export const createAccount = authedAction(
  accountSchema,
  async (input, { db, user }) =>
    db((tx) => tx.bankAccount.create({ data: { ...toRow(input), user_id: user.id }, select: { id: true } })),
  { message: "Conta criada." },
);

export const updateAccount = authedAction(
  accountSchema.extend({ id: z.uuid() }),
  async ({ id, ...input }, { db, user }) =>
    affected(await db((tx) => tx.bankAccount.updateMany({ where: { id, user_id: user.id }, data: toRow(input) })), "Conta"),
  { message: "Conta atualizada." },
);

export const setAccountArchived = authedAction(
  idInput.extend({ archived: z.boolean() }),
  async ({ id, archived }, { db, user }) =>
    affected(
      await db((tx) =>
        tx.bankAccount.updateMany({ where: { id, user_id: user.id }, data: { archived_at: archived ? new Date() : null } }),
      ),
      "Conta",
    ),
);

/** Só exclui contas sem lançamentos (o banco recusa pela FK restritiva). */
export const deleteAccount = authedAction(
  idInput,
  async ({ id }, { db, user }) =>
    affected(await db((tx) => tx.bankAccount.deleteMany({ where: { id, user_id: user.id } })), "Conta"),
  { message: "Conta excluída." },
);
