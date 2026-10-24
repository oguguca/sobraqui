import "server-only";

import { addDays, todayIn } from "@/domain/dates";
import { occurrencesUntil } from "@/domain/recurrence";
import type { AuthContext } from "@/server/auth";

/** Quantos dias à frente as recorrências viram lançamentos pendentes (contas a pagar). */
export const RECURRING_HORIZON_DAYS = 31;

/**
 * Gera as ocorrências vencidas e próximas das recorrências ativas como
 * lançamentos pendentes. Idempotente: o índice único (recorrência, data)
 * impede duplicatas mesmo com chamadas concorrentes. Roda sob demanda ao abrir
 * as telas, sem cron.
 */
export async function materializeRecurring(ctx: AuthContext): Promise<void> {
  const { supabase, user } = ctx;
  const until = addDays(todayIn(user.timezone), RECURRING_HORIZON_DAYS);

  const { data: rules, error } = await supabase
    .from("recurring_transactions")
    .select("*")
    .eq("active", true)
    .lte("next_occurrence_on", until);
  if (error || !rules?.length) return;

  for (const rule of rules) {
    const { dates, next } = occurrencesUntil(rule, until);
    if (dates.length > 0) {
      const { error: insertError } = await supabase.from("transactions").upsert(
        dates.map((date) => ({
          kind: rule.kind,
          status: "pending" as const,
          amount_cents: rule.amount_cents,
          occurred_on: date,
          description: rule.description,
          category_id: rule.category_id,
          account_id: rule.account_id,
          recurring_transaction_id: rule.id,
        })),
        { onConflict: "recurring_transaction_id,occurred_on", ignoreDuplicates: true },
      );
      if (insertError) {
        console.error("[recurring] falha ao gerar ocorrências:", insertError.code);
        continue;
      }
    }
    const finished = rule.end_on !== null && next > rule.end_on;
    await supabase
      .from("recurring_transactions")
      .update({ next_occurrence_on: next, active: !finished })
      .eq("id", rule.id);
  }
}
