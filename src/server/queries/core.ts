import "server-only";

import type { AuthContext } from "@/server/auth";
import type { Tables } from "@/lib/supabase/database.types";

export type Account = Tables<"accounts"> & { balance_cents: number };
export type Category = Tables<"categories">;
export type CreditCard = Tables<"credit_cards"> & { used_cents: number; available_cents: number };

const PAGE = 1000;

/** PostgREST limita linhas por resposta; busca em páginas até acabar. */
export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = 50_000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function listAccounts(
  { supabase }: AuthContext,
  opts: { includeArchived?: boolean } = {},
): Promise<Account[]> {
  let q = supabase.from("accounts").select("*").order("name");
  if (!opts.includeArchived) q = q.is("archived_at", null);
  const [{ data: accounts, error }, { data: balances, error: balanceError }] = await Promise.all([
    q,
    supabase.from("account_balances").select("account_id, balance_cents"),
  ]);
  if (error || balanceError) throw new Error((error ?? balanceError)!.message);
  const byId = new Map((balances ?? []).map((b) => [b.account_id, b.balance_cents]));
  return (accounts ?? []).map((a) => ({ ...a, balance_cents: byId.get(a.id) ?? a.initial_balance_cents }));
}

export async function getAccount(ctx: AuthContext, id: string): Promise<Account | null> {
  const [{ data: account }, { data: balance }] = await Promise.all([
    ctx.supabase.from("accounts").select("*").eq("id", id).maybeSingle(),
    ctx.supabase.from("account_balances").select("balance_cents").eq("account_id", id).maybeSingle(),
  ]);
  if (!account) return null;
  return { ...account, balance_cents: balance?.balance_cents ?? account.initial_balance_cents };
}

export async function listCategories(
  { supabase }: AuthContext,
  opts: { includeArchived?: boolean } = {},
): Promise<Category[]> {
  let q = supabase.from("categories").select("*").order("kind").order("name");
  if (!opts.includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listCards(
  { supabase }: AuthContext,
  opts: { includeArchived?: boolean } = {},
): Promise<CreditCard[]> {
  let q = supabase.from("credit_cards").select("*").order("name");
  if (!opts.includeArchived) q = q.is("archived_at", null);
  const [{ data: cards, error }, { data: usage, error: usageError }] = await Promise.all([
    q,
    supabase.from("credit_card_usage").select("credit_card_id, used_cents"),
  ]);
  if (error || usageError) throw new Error((error ?? usageError)!.message);
  const byId = new Map((usage ?? []).map((u) => [u.credit_card_id, u.used_cents]));
  return (cards ?? []).map((c) => {
    const used = byId.get(c.id) ?? 0;
    return { ...c, used_cents: used, available_cents: c.limit_cents - used };
  });
}

/** Opções ativas para os selects dos formulários. */
export type FormOptions = {
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; kind: Category["kind"]; color: string; icon: string }[];
  cards: { id: string; name: string }[];
};
