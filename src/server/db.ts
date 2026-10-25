import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Conversões na borda do banco: a aplicação trabalha com centavos como number
// (seguro até ±9 quatrilhões) e datas como texto ISO, iguais aos tipos de
// domínio. BigInt e Date do Prisma não saem deste módulo.
// ---------------------------------------------------------------------------

const toNumber = (v: bigint) => Number(v);
const toNumberOrNull = (v: bigint | null) => (v === null ? null : Number(v));
const toDateString = (v: Date) => v.toISOString().slice(0, 10);
const toDateStringOrNull = (v: Date | null) => (v ? toDateString(v) : null);
const toIso = (v: Date) => v.toISOString();
const toIsoOrNull = (v: Date | null) => (v ? v.toISOString() : null);

/** "AAAA-MM-DD" para o valor que o Prisma grava em colunas @db.Date. */
export function dbDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function dbDateOrNull(iso: string | null | undefined): Date | null {
  return iso ? dbDate(iso) : null;
}

type Mappers = Record<string, (v: never) => unknown>;

function fields<M extends Mappers>(map: M) {
  return Object.fromEntries(
    Object.entries(map).map(([name, fn]) => [
      name,
      { needs: { [name]: true }, compute: (row: Record<string, never>) => fn(row[name]) },
    ]),
  ) as { [K in keyof M]: { needs: { [P in K]: true }; compute: (row: { [P in K]: Parameters<M[K]>[0] }) => ReturnType<M[K]> } };
}

const timestamps = { created_at: toIso, updated_at: toIso };

function createClient() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter }).$extends({
    result: {
      profile: fields({ ...timestamps }),
      bankAccount: fields({ initial_balance_cents: toNumber, archived_at: toIsoOrNull, ...timestamps }),
      category: fields({ archived_at: toIsoOrNull, ...timestamps }),
      creditCard: fields({
        limit_cents: toNumber,
        bank_available_cents: toNumberOrNull,
        bank_used_cents: toNumberOrNull,
        bank_synced_at: toIsoOrNull,
        archived_at: toIsoOrNull,
        ...timestamps,
      }),
      creditCardInvoice: fields({
        reference_month: toDateString,
        closing_date: toDateString,
        due_date: toDateString,
        bank_amount_cents: toNumberOrNull,
        ...timestamps,
      }),
      recurringTransaction: fields({
        amount_cents: toNumber,
        start_on: toDateString,
        end_on: toDateStringOrNull,
        next_occurrence_on: toDateString,
        ...timestamps,
      }),
      importBatch: fields({ undone_at: toIsoOrNull, created_at: toIso }),
      transaction: fields({ amount_cents: toNumber, occurred_on: toDateString, ...timestamps }),
      budget: fields({ limit_cents: toNumber, month: toDateString, ...timestamps }),
      financialGoal: fields({
        target_cents: toNumber,
        saved_cents: toNumber,
        target_date: toDateStringOrNull,
        archived_at: toIsoOrNull,
        ...timestamps,
      }),
    },
  });
}

type Client = ReturnType<typeof createClient>;

// Em dev, reaproveita a conexão entre recargas, mas recria se o client gerado mudou
// (depois de `prisma generate` a classe PrismaClient é outra).
const globalForDb = globalThis as unknown as { db?: { ctor: unknown; client: Client } };

function sharedClient(): Client {
  const cached = globalForDb.db;
  if (cached && cached.ctor === PrismaClient) return cached.client;
  const client = createClient();
  if (process.env.NODE_ENV !== "production") globalForDb.db = { ctor: PrismaClient, client };
  return client;
}

/**
 * Cliente com privilégios de dono. Use só para autenticação (Better Auth) e
 * tarefas internas. Dados do usuário passam por `withUser`.
 */
export const adminDb: Client = sharedClient();

/**
 * Cópia em objetos simples: o Prisma anexa símbolos internos que o React não
 * serializa para Client Components; somas de agregação chegam como bigint.
 */
export function toPlain<T>(value: T): T {
  if (typeof value === "bigint") return Number(value) as T;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(toPlain) as T;
  if (value instanceof Map) return new Map([...value].map(([k, v]) => [k, toPlain(v)])) as T;
  if (value instanceof Set) return new Set([...value].map(toPlain)) as T;
  // Só objetos simples (linhas do Prisma); Date e outras classes passam intactas.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) out[key] = toPlain((value as Record<string, unknown>)[key]);
  return out as T;
}

export type Tx = Parameters<Parameters<Client["$transaction"]>[0]>[0];

/**
 * Executa `fn` numa transação com o RLS ativo para `userId`: troca para o role
 * `app_user` (sem privilégio de dono) e define `app.user_id`. Qualquer consulta
 * que esqueça o filtro por usuário continua sem ver dados de outra pessoa.
 */
export async function withUser<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  return adminDb.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      await tx.$executeRawUnsafe("SET LOCAL ROLE app_user");
      return toPlain(await fn(tx));
    },
    { timeout: options.timeoutMs ?? 15_000, maxWait: 10_000 },
  );
}
