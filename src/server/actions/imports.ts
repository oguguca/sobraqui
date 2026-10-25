"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { errorMessage, type ActionResult } from "@/server/action";
import { getAuth } from "@/server/auth";
import {
  buildImportPreview,
  clearImportedData,
  commitImport,
  decisionsSchema,
  importOptionsSchema,
  readUpload,
  sourceFromUpload,
  undoImportBatch,
  type ImportReport,
  type PreviewResult,
} from "@/server/import-service";

// Ações com arquivo recebem FormData; por isso não usam authedAction (JSON).

function parseJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value === "") return null;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

const SESSION_EXPIRED = { ok: false as const, error: "Sua sessão expirou. Entre novamente." };

export async function previewImport(form: FormData): Promise<ActionResult<PreviewResult>> {
  const auth = await getAuth();
  if (!auth) return SESSION_EXPIRED;
  const options = importOptionsSchema.safeParse(parseJson(form.get("options")));
  if (!options.success) return { ok: false, error: options.error.issues[0]?.message ?? "Opções inválidas." };
  try {
    const source = sourceFromUpload(await readUpload(form.get("file")), options.data);
    if ("kind" in source) return { ok: true, data: source };
    return { ok: true, data: await buildImportPreview(auth, source, options.data) };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function confirmImport(form: FormData): Promise<ActionResult<ImportReport>> {
  const auth = await getAuth();
  if (!auth) return SESSION_EXPIRED;
  const options = importOptionsSchema.safeParse(parseJson(form.get("options")));
  const decisions = decisionsSchema.safeParse(parseJson(form.get("decisions")));
  if (!options.success) return { ok: false, error: options.error.issues[0]?.message ?? "Opções inválidas." };
  if (!decisions.success) return { ok: false, error: "Revisão inválida. Analise o arquivo de novo." };
  try {
    const source = sourceFromUpload(await readUpload(form.get("file")), options.data);
    if ("kind" in source) return { ok: false, error: "Configure o mapeamento de colunas antes de importar." };
    const report = await commitImport(auth, source, options.data, decisions.data);
    refresh();
    return { ok: true, data: report, message: `${report.imported} transação(ões) importada(s).` };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function undoImport(input: unknown): Promise<ActionResult<{ removed: number }>> {
  const auth = await getAuth();
  if (!auth) return SESSION_EXPIRED;
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Importação inválida." };
  try {
    const result = await undoImportBatch(auth, parsed.data.id);
    refresh();
    return { ok: true, data: result, message: `Importação desfeita: ${result.removed} transação(ões) removida(s).` };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** Apaga os dados importados (pede a palavra LIMPAR como confirmação). */
export async function clearImports(input: unknown): Promise<ActionResult<{ removed: number }>> {
  const auth = await getAuth();
  if (!auth) return SESSION_EXPIRED;
  const parsed = z.object({ confirm: z.literal("LIMPAR") }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Digite LIMPAR para confirmar." };
  try {
    const result = await clearImportedData(auth);
    refresh();
    return {
      ok: true,
      data: { removed: result.removed },
      message: `${result.removed} transação(ões) importada(s) removida(s). Os saldos das contas foram mantidos.`,
    };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
