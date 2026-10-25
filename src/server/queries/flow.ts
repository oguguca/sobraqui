import "server-only";

import type { DateRange } from "@/domain/dates";
import type { Enums } from "@/lib/db/types";
import type { AuthContext } from "@/server/auth";

import { dateRange } from "./transactions";

export type FlowKind = "income" | "expense";

export type FlowSummary = {
  paidCents: number;
  pendingCents: number;
  count: number;
  byMethod: { method: Enums<"payment_method"> | null; cents: number; count: number }[];
  byCategory: { categoryId: string | null; cents: number }[];
};

/** Totais de entradas ou saídas no período, agregados no banco. */
export async function flowSummary(ctx: AuthContext, kind: FlowKind, range: DateRange): Promise<FlowSummary> {
  const where = { user_id: ctx.user.id, kind, ...dateRange(range.from, range.to) };
  const [byStatus, byMethod, byCategory] = await ctx.db((tx) =>
    Promise.all([
      tx.transaction.groupBy({ by: ["status"], where, _sum: { amount_cents: true }, _count: true }),
      tx.transaction.groupBy({ by: ["payment_method"], where, _sum: { amount_cents: true }, _count: true }),
      tx.transaction.groupBy({ by: ["category_id"], where, _sum: { amount_cents: true } }),
    ]),
  );
  const cents = (v: bigint | number | null | undefined) => Number(v ?? 0);
  const status = (s: "paid" | "pending") => cents(byStatus.find((g) => g.status === s)?._sum.amount_cents);
  return {
    paidCents: status("paid"),
    pendingCents: status("pending"),
    count: byStatus.reduce((n, g) => n + g._count, 0),
    byMethod: byMethod
      .map((g) => ({ method: g.payment_method, cents: cents(g._sum.amount_cents), count: g._count }))
      .sort((a, b) => b.cents - a.cents),
    byCategory: byCategory
      .map((g) => ({ categoryId: g.category_id, cents: cents(g._sum.amount_cents) }))
      .sort((a, b) => b.cents - a.cents),
  };
}
