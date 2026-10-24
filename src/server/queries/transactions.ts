import "server-only";

import { z } from "zod";

import { isISODate } from "@/domain/dates";
import type { Tables } from "@/lib/supabase/database.types";
import type { AuthContext } from "@/server/auth";

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
  category: optionalId,
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

/** Escapa curingas do LIKE para a busca tratar % e _ como texto. */
function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function filteredQuery(supabase: AuthContext["supabase"], f: TransactionFilters, count?: "exact") {
  let query = supabase.from("transactions").select("*", count ? { count } : undefined);
  if (f.q) query = query.ilike("description", likePattern(f.q));
  if (f.from) query = query.gte("occurred_on", f.from);
  if (f.to) query = query.lte("occurred_on", f.to);
  if (f.kind) query = query.eq("kind", f.kind);
  if (f.status) query = query.eq("status", f.status);
  if (f.category) query = query.eq("category_id", f.category);
  // UUID validado pelo schema; seguro para interpolar no filtro "or".
  if (f.account) query = query.or(`account_id.eq.${f.account},destination_account_id.eq.${f.account}`);
  if (f.card) query = query.eq("credit_card_id", f.card);

  const [column, direction] = f.sort.startsWith("amount") ? ["amount_cents", f.sort] : ["occurred_on", f.sort];
  const ascending = direction.endsWith("asc");
  return query.order(column, { ascending }).order("created_at", { ascending }).order("id");
}

export async function listTransactions({ supabase }: AuthContext, f: TransactionFilters) {
  const fromRow = (f.page - 1) * PAGE_SIZE;
  const { data, count, error } = await filteredQuery(supabase, f, "exact").range(fromRow, fromRow + PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0, pageSize: PAGE_SIZE };
}

/** Todas as linhas que atendem aos filtros, sem paginação (exportação). */
export async function allFilteredTransactions({ supabase }: AuthContext, f: TransactionFilters) {
  return fetchAll((from, to) => filteredQuery(supabase, f).range(from, to));
}

/** Todos os lançamentos de um intervalo (para cálculos e exportação). */
export async function transactionsBetween(
  { supabase }: AuthContext,
  range: { from?: string; to?: string },
  opts: { accountId?: string; cardId?: string } = {},
): Promise<Transaction[]> {
  return fetchAll((from, to) => {
    let q = supabase.from("transactions").select("*");
    if (range.from) q = q.gte("occurred_on", range.from);
    if (range.to) q = q.lte("occurred_on", range.to);
    if (opts.accountId) q = q.or(`account_id.eq.${opts.accountId},destination_account_id.eq.${opts.accountId}`);
    if (opts.cardId) q = q.eq("credit_card_id", opts.cardId);
    return q.order("occurred_on", { ascending: true }).order("id").range(from, to);
  });
}

/** Efeito previsto dos lançamentos pendentes no saldo da conta. */
export async function pendingEffect({ supabase }: AuthContext, accountId: string) {
  const rows = await fetchAll((from, to) =>
    supabase
      .from("transactions")
      .select("kind, amount_cents, account_id, destination_account_id")
      .eq("status", "pending")
      .or(`account_id.eq.${accountId},destination_account_id.eq.${accountId}`)
      .range(from, to),
  );
  let cents = 0;
  for (const t of rows) {
    const incoming = t.kind === "income" || t.kind === "refund" || t.destination_account_id === accountId;
    cents += incoming ? t.amount_cents : -t.amount_cents;
  }
  return { cents, count: rows.length };
}
