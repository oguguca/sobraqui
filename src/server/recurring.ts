import "server-only";

import { addDays, todayIn } from "@/domain/dates";
import { occurrencesUntil } from "@/domain/recurrence";
import type { AuthContext } from "@/server/auth";
import { dbDate } from "@/server/db";

/** Quantos dias à frente as recorrências viram lançamentos pendentes (contas a pagar). */
export const RECURRING_HORIZON_DAYS = 31;

/**
 * Gera as ocorrências vencidas e próximas das recorrências ativas como
 * lançamentos pendentes. Idempotente: o índice único (recorrência, data)
 * impede duplicatas mesmo com chamadas concorrentes. Roda sob demanda ao abrir
 * as telas, sem cron.
 */
export async function materializeRecurring(ctx: AuthContext): Promise<void> {
  const userId = ctx.user.id;
  const until = addDays(todayIn(ctx.user.timezone), RECURRING_HORIZON_DAYS);

  await ctx.db(async (tx) => {
    const rules = await tx.recurringTransaction.findMany({
      where: { user_id: userId, active: true, next_occurrence_on: { lte: dbDate(until) } },
    });
    for (const rule of rules) {
      const { dates, next } = occurrencesUntil(rule, until);
      if (dates.length > 0) {
        await tx.transaction.createMany({
          data: dates.map((date) => ({
            user_id: userId,
            kind: rule.kind,
            status: "pending" as const,
            amount_cents: rule.amount_cents,
            occurred_on: dbDate(date),
            description: rule.description,
            category_id: rule.category_id,
            account_id: rule.account_id,
            payment_method: rule.payment_method,
            recurring_transaction_id: rule.id,
          })),
          skipDuplicates: true,
        });
      }
      const finished = rule.end_on !== null && next > rule.end_on;
      await tx.recurringTransaction.update({
        where: { id: rule.id },
        data: { next_occurrence_on: dbDate(next), active: !finished },
      });
    }
  });
}
