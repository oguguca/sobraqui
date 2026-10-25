import "server-only";

import type { PluggyAccountType, PluggyTransaction } from "@/domain/import/pluggy";
import { ActionError } from "@/server/action";

// Cliente mínimo da API da Pluggy (https://api.pluggy.ai), só leitura.
// Credenciais apenas no servidor. Itens (conexões) vêm de PLUGGY_ITEM_IDS,
// porque a API não lista itens no plano Meu Pluggy.

const BASE = "https://api.pluggy.ai";

export type PluggyAccount = {
  id: string;
  itemId: string;
  type: PluggyAccountType;
  subtype: string;
  name: string;
  marketingName: string | null;
  number: string | null;
  balance: number;
  creditData?: {
    brand?: string | null;
    level?: string | null;
    creditLimit?: number | null;
    availableCreditLimit?: number | null;
    balanceDueDate?: string | null;
    balanceCloseDate?: string | null;
  } | null;
};

export type PluggyBill = {
  id: string;
  dueDate: string;
  billClosingDate?: string | null;
  totalAmount: number;
  payments?: { amount: number }[] | null;
};

export function isPluggyConfigured(): boolean {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET && process.env.PLUGGY_ITEM_IDS);
}

function itemIds(): string[] {
  return (process.env.PLUGGY_ITEM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
}

// A chave de API vale 2 h; guardamos por 90 min por instância.
let cachedKey: { value: string; expiresAt: number } | null = null;

async function apiKey(): Promise<string> {
  if (cachedKey && cachedKey.expiresAt > Date.now()) return cachedKey.value;
  const res = await fetch(`${BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("[pluggy] auth falhou:", res.status);
    throw new ActionError("Credenciais da Pluggy inválidas. Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.");
  }
  const { apiKey: value } = (await res.json()) as { apiKey: string };
  cachedKey = { value, expiresAt: Date.now() + 90 * 60 * 1000 };
  return value;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { "X-API-KEY": await apiKey() }, cache: "no-store" });
  if (res.status === 401) cachedKey = null;
  if (!res.ok) {
    console.error("[pluggy] GET falhou:", path.split("?")[0].replace(/[0-9a-f-]{36}/gi, ":id"), res.status);
    throw new ActionError("A Pluggy não respondeu como esperado. Tente de novo em alguns minutos.");
  }
  return (await res.json()) as T;
}

export async function listPluggyAccounts(): Promise<PluggyAccount[]> {
  const accounts: PluggyAccount[] = [];
  for (const id of itemIds()) {
    const { results } = await get<{ results: PluggyAccount[] }>(`/accounts?itemId=${encodeURIComponent(id)}`);
    accounts.push(...results.filter((a) => a.type === "BANK" || a.type === "CREDIT"));
  }
  return accounts;
}

/** Garante que a conta pertence a um dos itens configurados (evita ler contas alheias pelo id). */
export async function getPluggyAccount(accountId: string): Promise<PluggyAccount> {
  const account = (await listPluggyAccounts()).find((a) => a.id === accountId);
  if (!account) throw new ActionError("Conta do Open Finance não encontrada.");
  return account;
}

/** Transações da conta no período, seguindo a paginação por cursor (`next`). */
export async function listPluggyTransactions(accountId: string, from: string, to: string): Promise<PluggyTransaction[]> {
  const all: PluggyTransaction[] = [];
  const range = `dateFrom=${from}&dateTo=${to}`;
  let query: string | null = `accountId=${encodeURIComponent(accountId)}&${range}`;
  for (let page = 0; query && page < 50; page++) {
    const res: { results: PluggyTransaction[]; next: string | null } = await get(`/v2/transactions?${query}`);
    all.push(...res.results);
    query = res.next ? `${res.next.replace(/^\?/, "")}${res.next.includes("dateFrom") ? "" : `&${range}`}` : null;
  }
  return all;
}

/** Faturas fechadas do cartão (a API só devolve as já fechadas). */
export async function listPluggyBills(accountId: string): Promise<PluggyBill[]> {
  const { results } = await get<{ results: PluggyBill[] }>(`/bills?accountId=${encodeURIComponent(accountId)}`);
  return results;
}
