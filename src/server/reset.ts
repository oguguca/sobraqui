import "server-only";

import type { AuthContext } from "@/server/auth";
import { DEFAULT_CATEGORIES } from "@/server/default-categories";

/**
 * Apaga todos os registros financeiros do usuário e recria as categorias
 * padrão. Login, sessão e preferências (perfil) ficam. Ordem pensada para as
 * chaves estrangeiras restritivas: primeiro quem referencia, depois o referenciado.
 */
export async function resetAllData(ctx: AuthContext) {
  const user_id = ctx.user.id;
  return ctx.db(
    async (tx) => {
      const { count: transactions } = await tx.transaction.deleteMany({ where: { user_id } });
      await tx.recurringTransaction.deleteMany({ where: { user_id } });
      await tx.budget.deleteMany({ where: { user_id } });
      await tx.financialGoal.deleteMany({ where: { user_id } });
      await tx.importBatch.deleteMany({ where: { user_id } });
      await tx.creditCardInvoice.deleteMany({ where: { user_id } });
      await tx.creditCard.deleteMany({ where: { user_id } });
      await tx.bankAccount.deleteMany({ where: { user_id } });
      await tx.category.deleteMany({ where: { user_id } });
      await tx.category.createMany({ data: DEFAULT_CATEGORIES.map((c) => ({ ...c, user_id })) });
      return { transactions };
    },
    { timeoutMs: 45_000 },
  );
}
