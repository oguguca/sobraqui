import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";
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
      if (err instanceof ActionError) return { ok: false, error: err.message };
      // Loga só o código/mensagem técnica, nunca a entrada (pode ter dados financeiros).
      console.error("[action]", err instanceof Error ? err.message : "erro desconhecido");
      return { ok: false, error: "Não foi possível concluir a operação. Tente de novo." };
    }
  };
}

/** Lança ActionError com mensagem amigável para erros conhecidos do PostgREST. */
export function check(error: PostgrestError | null, context = "salvar"): void {
  if (!error) return;
  if (error.code === "23505") throw new ActionError("Já existe um registro com esses dados.");
  if (error.code === "23503") {
    throw new ActionError("Este registro está em uso por outros lançamentos. Arquive em vez de excluir.");
  }
  if (error.code === "23514") throw new ActionError("Os dados não respeitam as regras do lançamento.");
  if (error.code === "42501") throw new ActionError("Você não tem permissão para esta operação.");
  console.error(`[db] falha ao ${context}:`, error.code, error.message);
  throw new ActionError(`Não foi possível ${context}.`);
}

/** Lança se a consulta não encontrou o registro (RLS também cai aqui). */
export function found<T>(row: T | null, what = "Registro"): T {
  if (!row) throw new ActionError(`${what} não encontrado.`);
  return row;
}
