"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { ActionError, type ActionResult } from "@/server/action";
import { getAuth } from "@/server/auth";
import {
  buildImportPreview,
  commitImport,
  decisionsSchema,
  importOptionsSchema,
  readUpload,
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

function toError(err: unknown): { ok: false; error: string } {
  if (err instanceof ActionError) return { ok: false, error: err.message };
  console.error("[import]", err instanceof Error ? err.message : "erro desconhecido");
  return { ok: false, error: "Não foi possível processar o arquivo. Tente de novo." };
}

export async function previewImport(form: FormData): Promise<ActionResult<PreviewResult>> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: "Sua sessão expirou. Entre novamente." };
  const options = importOptionsSchema.safeParse(parseJson(form.get("options")));
  if (!options.success) return { ok: false, error: options.error.issues[0]?.message ?? "Opções inválidas." };
  try {
    const upload = await readUpload(form.get("file"));
    return { ok: true, data: await buildImportPreview(auth, upload, options.data) };
  } catch (err) {
    return toError(err);
  }
}

export async function confirmImport(form: FormData): Promise<ActionResult<ImportReport>> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: "Sua sessão expirou. Entre novamente." };
  const options = importOptionsSchema.safeParse(parseJson(form.get("options")));
  const decisions = decisionsSchema.safeParse(parseJson(form.get("decisions")));
  if (!options.success) return { ok: false, error: options.error.issues[0]?.message ?? "Opções inválidas." };
  if (!decisions.success) return { ok: false, error: "Revisão inválida. Analise o arquivo de novo." };
  try {
    const upload = await readUpload(form.get("file"));
    const report = await commitImport(auth, upload, options.data, decisions.data);
    refresh();
    return { ok: true, data: report, message: `${report.imported} transação(ões) importada(s).` };
  } catch (err) {
    return toError(err);
  }
}

export async function undoImport(input: unknown): Promise<ActionResult<{ removed: number }>> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: "Sua sessão expirou. Entre novamente." };
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Importação inválida." };
  try {
    const result = await undoImportBatch(auth, parsed.data.id);
    refresh();
    return { ok: true, data: result, message: `Importação desfeita: ${result.removed} transação(ões) removida(s).` };
  } catch (err) {
    return toError(err);
  }
}
