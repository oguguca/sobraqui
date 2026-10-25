import "server-only";

import { accountDelta, cardOutstanding, type LedgerEntry } from "@/domain/ledger";
import type { Tables } from "@/lib/db/types";
import type { AuthContext } from "@/server/auth";
import type { Tx } from "@/server/db";

export type Account = Tables<"accounts"> & { balance_cents: number };
export type Category = Tables<"categories">;
export type CreditCard = Tables<"credit_cards"> & { used_cents: number; available_cents: number };

// Somas podem chegar como bigint em tempo de execução; normaliza para number.
const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

const stub: LedgerEntry = {
  kind: "income",
  status: "paid",
  amount_cents: 0,
  occurred_on: "1970-01-01",
  account_id: null,
  destination_account_id: null,
  credit_card_id: null,
  category_id: null,
};

/**
 * Saldo por conta, agregado no banco por tipo de lançamento e aplicado com as
 * mesmas regras de `accountDelta` (domain/ledger). Só efetivados contam.
 */
export async function accountBalances(tx: Tx, userId: string): Promise<Map<string, number>> {
  const [origin, destination] = await Promise.all([
    tx.transaction.groupBy({
      by: ["account_id", "kind"],
      where: { user_id: userId, status: "paid", account_id: { not: null } },
      _sum: { amount_cents: true },
    }),
    tx.transaction.groupBy({
      by: ["destination_account_id"],
      where: { user_id: userId, status: "paid", kind: "transfer", destination_account_id: { not: null } },
      _sum: { amount_cents: true },
    }),
  ]);
  const balances = new Map<string, number>();
  const add = (id: string, cents: number) => balances.set(id, (balances.get(id) ?? 0) + cents);
  for (const g of origin) {
    const id = g.account_id!;
    add(id, accountDelta({ ...stub, kind: g.kind, account_id: id, amount_cents: n(g._sum.amount_cents) }, id));
  }
  for (const g of destination) add(g.destination_account_id!, n(g._sum.amount_cents));
  return balances;
}

/** Saldo devedor por cartão: compras - estornos - pagamentos (inclui parcelas futuras). */
export async function cardUsage(tx: Tx, userId: string): Promise<Map<string, number>> {
  const groups = await tx.transaction.groupBy({
    by: ["credit_card_id", "kind", "status"],
    where: { user_id: userId, credit_card_id: { not: null } },
    _sum: { amount_cents: true },
  });
  const usage = new Map<string, number>();
  for (const g of groups) {
    const id = g.credit_card_id!;
    const entry = { ...stub, kind: g.kind, status: g.status, credit_card_id: id, amount_cents: n(g._sum.amount_cents) };
    usage.set(id, (usage.get(id) ?? 0) + cardOutstanding([entry], id));
  }
  return usage;
}

/** Todas as linhas em páginas, para não carregar um resultado gigante de uma vez. */
export async function fetchAll<T>(page: (skip: number, take: number) => Promise<T[]>, max = 50_000): Promise<T[]> {
  const rows: T[] = [];
  const size = 1000;
  for (let skip = 0; skip < max; skip += size) {
    const chunk = await page(skip, size);
    rows.push(...chunk);
    if (chunk.length < size) break;
  }
  return rows;
}

export async function listAccounts(ctx: AuthContext, opts: { includeArchived?: boolean } = {}): Promise<Account[]> {
  const userId = ctx.user.id;
  return ctx.db(async (tx) => {
    const [accounts, balances] = await Promise.all([
      tx.bankAccount.findMany({
        where: { user_id: userId, ...(opts.includeArchived ? {} : { archived_at: null }) },
        orderBy: { name: "asc" },
      }),
      accountBalances(tx, userId),
    ]);
    return accounts.map((a) => ({ ...a, balance_cents: a.initial_balance_cents + (balances.get(a.id) ?? 0) }));
  });
}

export async function getAccount(ctx: AuthContext, id: string): Promise<Account | null> {
  const accounts = await listAccounts(ctx, { includeArchived: true });
  return accounts.find((a) => a.id === id) ?? null;
}

export async function listCategories(ctx: AuthContext, opts: { includeArchived?: boolean } = {}): Promise<Category[]> {
  return ctx.db((tx) =>
    tx.category.findMany({
      where: { user_id: ctx.user.id, ...(opts.includeArchived ? {} : { archived_at: null }) },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
  );
}

export async function listCards(ctx: AuthContext, opts: { includeArchived?: boolean } = {}): Promise<CreditCard[]> {
  const userId = ctx.user.id;
  return ctx.db(async (tx) => {
    const [cards, usage] = await Promise.all([
      tx.creditCard.findMany({
        where: { user_id: userId, ...(opts.includeArchived ? {} : { archived_at: null }) },
        orderBy: { name: "asc" },
      }),
      cardUsage(tx, userId),
    ]);
    return cards.map((c) => {
      // Cartão sincronizado pelo Open Finance: o banco sabe o limite real (inclui
      // parcelas futuras e rotativo que não foram importados).
      if (c.bank_available_cents !== null) {
        const used = c.bank_used_cents ?? c.limit_cents - c.bank_available_cents;
        return { ...c, used_cents: used, available_cents: c.bank_available_cents };
      }
      const used = usage.get(c.id) ?? 0;
      return { ...c, used_cents: used, available_cents: c.limit_cents - used };
    });
  });
}

/** Opções ativas para os selects dos formulários. */
export type FormOptions = {
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; kind: Category["kind"]; color: string; icon: string }[];
  cards: { id: string; name: string }[];
};
