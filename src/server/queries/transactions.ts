import "server-only";

import { z } from "zod";

import { isISODate } from "@/domain/dates";
import type { Prisma } from "@/generated/prisma/client";
import type { Tables } from "@/lib/db/types";
import type { AuthContext } from "@/server/auth";
import { dbDate } from "@/server/db";

import { fetchAll } from "./core";

export type Transaction = Tables<"transactions">;

export const PAGE_SIZE = 25;

const optionalId = z.uuid().optional().catch(undefined);
const optionalDate = z
  .string()
  .refine(isISODate)
  .optional()
  .catch(undefined);

/** Filtros vindos da URL. Valores inválidos são descartados, não confiados. */
export const transactionFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  from: optionalDate,
  to: optionalDate,
  kind: z.enum(["income", "expense", "refund", "transfer", "invoice_payment"]).optional().catch(undefined),
  status: z.enum(["paid", "pending"]).optional().catch(undefined),
  /** UUID da categoria ou "none" para lançamentos sem categoria. */
  category: z.union([z.uuid(), z.literal("none")]).optional().catch(undefined),
  account: optionalId,
  card: optionalId,
  sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).default("date_desc").catch("date_desc"),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});

export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;

export function parseTransactionFilters(params: Record<string, string | string[] | undefined>) {
  const flat = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v || undefined]),
  );
  return transactionFiltersSchema.parse(flat);
}

/** Lançamentos de uma conta: como origem ou como destino de transferência. */
export function touchesAccount(accountId: string): Prisma.TransactionWhereInput {
  return { OR: [{ account_id: accountId }, { destination_account_id: accountId }] };
}

export function dateRange(from?: string, to?: string): Prisma.TransactionWhereInput {
  if (!from && !to) return {};
  return { occurred_on: { ...(from ? { gte: dbDate(from) } : {}), ...(to ? { lte: dbDate(to) } : {}) } };
}

function filterWhere(userId: string, f: TransactionFilters): Prisma.TransactionWhereInput {
  return {
    user_id: userId,
    AND: [
      f.q ? { description: { contains: f.q, mode: "insensitive" } } : {},
      dateRange(f.from, f.to),
      f.kind ? { kind: f.kind } : {},
      f.status ? { status: f.status } : {},
      f.category === "none"
        ? { category_id: null, kind: { in: ["income", "expense", "refund"] } }
        : f.category
          ? { category_id: f.category }
          : {},
      f.account ? touchesAccount(f.account) : {},
      f.card ? { credit_card_id: f.card } : {},
    ],
  };
}

function orderBy(f: TransactionFilters): Prisma.TransactionOrderByWithRelationInput[] {
  const dir: Prisma.SortOrder = f.sort.endsWith("asc") ? "asc" : "desc";
  const main = f.sort.startsWith("amount") ? { amount_cents: dir } : { occurred_on: dir };
  return [main, { created_at: dir }, { id: "asc" }];
}

export async function listTransactions(ctx: AuthContext, f: TransactionFilters) {
  const where = filterWhere(ctx.user.id, f);
  const [rows, total] = await ctx.db((tx) =>
    Promise.all([
      tx.transaction.findMany({ where, orderBy: orderBy(f), skip: (f.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      tx.transaction.count({ where }),
    ]),
  );
  return { rows, total, pageSize: PAGE_SIZE };
}

/** Todas as linhas que atendem aos filtros, sem paginação (exportação). */
export async function allFilteredTransactions(ctx: AuthContext, f: TransactionFilters) {
  const where = filterWhere(ctx.user.id, f);
  return ctx.db((tx) =>
    fetchAll((skip, take) => tx.transaction.findMany({ where, orderBy: orderBy(f), skip, take })),
    { timeoutMs: 30_000 },
  );
}

/** Todos os lançamentos de um intervalo (para cálculos). */
export async function transactionsBetween(
  ctx: AuthContext,
  range: { from?: string; to?: string },
  opts: { accountId?: string; cardId?: string } = {},
): Promise<Transaction[]> {
  const where: Prisma.TransactionWhereInput = {
    user_id: ctx.user.id,
    AND: [
      dateRange(range.from, range.to),
      opts.accountId ? touchesAccount(opts.accountId) : {},
      opts.cardId ? { credit_card_id: opts.cardId } : {},
    ],
  };
  return ctx.db(
    (tx) =>
      fetchAll((skip, take) =>
        tx.transaction.findMany({ where, orderBy: [{ occurred_on: "asc" }, { id: "asc" }], skip, take }),
      ),
    { timeoutMs: 30_000 },
  );
}

/** Efeito previsto dos lançamentos pendentes no saldo da conta. */
export async function pendingEffect(ctx: AuthContext, accountId: string) {
  const rows = await ctx.db((tx) =>
    tx.transaction.findMany({
      where: { user_id: ctx.user.id, status: "pending", ...touchesAccount(accountId) },
      select: { kind: true, amount_cents: true, destination_account_id: true },
    }),
  );
  let cents = 0;
  for (const t of rows) {
    const incoming = t.kind === "income" || t.kind === "refund" || t.destination_account_id === accountId;
    cents += incoming ? t.amount_cents : -t.amount_cents;
  }
  return { cents, count: rows.length };
}
