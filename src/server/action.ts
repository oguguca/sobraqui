import "server-only";

import { refresh } from "next/cache";
import { z } from "zod";

import { getAuth, type AuthContext } from "./auth";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export class ActionError extends Error {}

/**
 * Envolve uma Server Action: exige sessão, valida a entrada com Zod e
 * converte erros em mensagens seguras. Nunca confia no que vem do cliente.
 */
export function authedAction<S extends z.ZodType, T>(
  schema: S,
  handler: (input: z.infer<S>, ctx: AuthContext) => Promise<T>,
  options: { message?: string } = {},
) {
  return async (raw: unknown): Promise<ActionResult<T>> => {
    const auth = await getAuth();
    if (!auth) return { ok: false, error: "Sua sessão expirou. Entre novamente." };

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_";
        fieldErrors[key] ??= issue.message;
      }
      return { ok: false, error: "Confira os campos destacados.", fieldErrors };
    }

    try {
      const data = await handler(parsed.data, auth);
      refresh();
      return { ok: true, data, message: options.message };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  };
}

/** Código SQLSTATE do Postgres, quando o erro veio do banco (direto ou via Prisma). */
export function sqlState(err: unknown): string | undefined {
  const e = err as { code?: unknown; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } };
  const original = e?.meta?.driverAdapterError?.cause?.originalCode;
  if (typeof original === "string") return original;
  const prismaToSql: Record<string, string> = { P2002: "23505", P2003: "23503", P2004: "23514" };
  return typeof e?.code === "string" ? (prismaToSql[e.code] ?? (/^\d{5}$/.test(e.code) ? e.code : undefined)) : undefined;
}

/** Mensagem segura para o usuário. Loga só o código técnico, nunca dados. */
export function errorMessage(err: unknown): string {
  if (err instanceof ActionError) return err.message;
  switch (sqlState(err)) {
    case "23505":
      return "Já existe um registro com esses dados.";
    case "23503":
    case "23001": // ON DELETE RESTRICT
      return "Este registro está em uso por outros lançamentos. Arquive em vez de excluir.";
    case "23514":
      return "Os dados não respeitam as regras do lançamento.";
    case "42501":
      return "Você não tem permissão para esta operação.";
  }
  const code = (err as { code?: unknown })?.code;
  console.error("[action]", typeof code === "string" ? code : err instanceof Error ? err.name : "erro desconhecido");
  return "Não foi possível concluir a operação. Tente de novo.";
}

/** Lança se a consulta não encontrou o registro (RLS também cai aqui). */
export function found<T>(row: T | null | undefined, what = "Registro"): T {
  if (!row) throw new ActionError(`${what} não encontrado.`);
  return row;
}

/** Para updateMany/deleteMany: zero linhas afetadas = não encontrado. */
export function affected(result: { count: number }, what = "Registro"): { count: number } {
  if (result.count === 0) throw new ActionError(`${what} não encontrado.`);
  return result;
}
