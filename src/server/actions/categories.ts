"use server";

import { z } from "zod";

import { categorySchema } from "@/lib/schemas";
import { idInput } from "@/lib/validation";
import { ActionError, affected, authedAction, found } from "@/server/action";
import type { Enums } from "@/lib/db/types";
import type { Tx } from "@/server/db";

/** Nome único por tipo, sem diferenciar maiúsculas. */
async function assertUniqueName(
  tx: Tx,
  userId: string,
  input: { name: string; kind: Enums<"category_kind"> },
  exceptId?: string,
) {
  const clash = await tx.category.findFirst({
    where: {
      user_id: userId,
      kind: input.kind,
      name: { equals: input.name, mode: "insensitive" },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new ActionError("Já existe uma categoria com esse nome.");
}

export const createCategory = authedAction(
  categorySchema,
  async (input, { db, user }) =>
    db(async (tx) => {
      await assertUniqueName(tx, user.id, input);
      return tx.category.create({ data: { ...input, user_id: user.id }, select: { id: true } });
    }),
  { message: "Categoria criada." },
);

export const updateCategory = authedAction(
  categorySchema.extend({ id: z.uuid() }),
  async ({ id, ...input }, { db, user }) =>
    db(async (tx) => {
      const current = found(await tx.category.findFirst({ where: { id, user_id: user.id } }), "Categoria");
      if (current.kind !== input.kind && (await tx.transaction.count({ where: { user_id: user.id, category_id: id } })) > 0) {
        throw new ActionError("Não é possível mudar o tipo de uma categoria que já tem lançamentos.");
      }
      await assertUniqueName(tx, user.id, input, id);
      return affected(await tx.category.updateMany({ where: { id, user_id: user.id }, data: input }), "Categoria");
    }),
  { message: "Categoria atualizada." },
);

export const setCategoryArchived = authedAction(
  idInput.extend({ archived: z.boolean() }),
  async ({ id, archived }, { db, user }) =>
    affected(
      await db((tx) =>
        tx.category.updateMany({ where: { id, user_id: user.id }, data: { archived_at: archived ? new Date() : null } }),
      ),
      "Categoria",
    ),
);

/** Exclui só categorias sem lançamentos; as usadas devem ser arquivadas. */
export const deleteCategory = authedAction(
  idInput,
  async ({ id }, { db, user }) =>
    db(async (tx) => {
      const [used, recurring] = await Promise.all([
        tx.transaction.count({ where: { user_id: user.id, category_id: id } }),
        tx.recurringTransaction.count({ where: { user_id: user.id, category_id: id } }),
      ]);
      if (used + recurring > 0) {
        throw new ActionError("Esta categoria tem lançamentos. Arquive-a para escondê-la sem perder o histórico.");
      }
      return affected(await tx.category.deleteMany({ where: { id, user_id: user.id } }), "Categoria");
    }),
  { message: "Categoria excluída." },
);
