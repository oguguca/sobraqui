import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { invoiceDatesFor, invoiceForPurchase } from "@/domain/credit-card";
import { addMonthsToMonth, isISOMonth, monthOf } from "@/domain/dates";
import { buildPreview, parseStatementFile, type ManualCandidate } from "@/domain/import/pipeline";
import { normalizeText } from "@/domain/import/text";
import {
  MAX_IMPORT_BYTES,
  type GenericCsvMapping,
  type ImportAction,
  type ImportFormat,
  type PreviewRow,
  type RowError,
} from "@/domain/import/types";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { ActionError } from "@/server/action";
import type { AuthContext } from "@/server/auth";
import { fetchAll } from "@/server/queries/core";

const mappingSchema = z.object({
  dateColumn: z.number().int().min(0),
  amountColumn: z.number().int().min(0),
  descriptionColumn: z.number().int().min(0),
  idColumn: z.number().int().min(0).nullable(),
  dateFormat: z.enum(["dd/MM/yyyy", "yyyy-MM-dd", "MM/dd/yyyy"]),
  decimal: z.enum([",", "."]),
  invertSign: z.boolean(),
});

export const importOptionsSchema = z.object({
  target: z.enum(["account", "card"]),
  targetId: z.uuid("Escolha a conta ou o cartão de destino."),
  mapping: mappingSchema.nullable().default(null),
  /** Fatura que recebe as compras de um arquivo de cartão (AAAA-MM). */
  invoiceMonth: z.string().refine(isISOMonth).nullable().default(null),
  /** Cartão abatido pelas linhas "pagamento de fatura" de um extrato de conta. */
  paymentCardId: z.uuid().nullable().default(null),
});

export type ImportOptions = z.infer<typeof importOptionsSchema>;

export const decisionsSchema = z
  .array(
    z.object({
      index: z.number().int().min(0),
      action: z.enum(["income", "expense", "refund", "invoice_payment", "skip"]),
      categoryId: z.uuid().nullable(),
    }),
  )
  .max(10_000);

export type ImportDecision = z.infer<typeof decisionsSchema>[number];

export type PreviewResult =
  | {
      kind: "preview";
      format: ImportFormat;
      fileName: string;
      fileSha256: string;
      rows: (PreviewRow & { suggestedCategoryId: string | null })[];
      errors: RowError[];
      targetMismatch: boolean;
      suggestedInvoiceMonth: string | null;
      previousImportAt: string | null;
    }
  | { kind: "mapping"; headers: string[]; sample: string[][] };

export async function readUpload(file: unknown): Promise<{ bytes: Uint8Array; name: string }> {
  if (!(file instanceof File)) throw new ActionError("Envie um arquivo.");
  if (file.size === 0) throw new ActionError("O arquivo está vazio.");
  if (file.size > MAX_IMPORT_BYTES) throw new ActionError("O arquivo passa do limite de 2 MB.");
  const name = file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 255) || "extrato";
  return { bytes: new Uint8Array(await file.arrayBuffer()), name };
}

function scopeOf(options: ImportOptions) {
  return `${options.target === "card" ? "card" : "acc"}:${options.targetId}`;
}

async function assertTarget(ctx: AuthContext, options: ImportOptions) {
  const table = options.target === "card" ? "credit_cards" : "accounts";
  const { data } = await ctx.supabase.from(table).select("id, archived_at").eq("id", options.targetId).maybeSingle();
  if (!data) throw new ActionError(options.target === "card" ? "Cartão não encontrado." : "Conta não encontrada.");
  if (data.archived_at) throw new ActionError("O destino escolhido está arquivado.");
}

/** Lê, valida e classifica o arquivo sem gravar nada. */
export async function buildImportPreview(
  ctx: AuthContext,
  upload: { bytes: Uint8Array; name: string },
  options: ImportOptions,
): Promise<PreviewResult> {
  await assertTarget(ctx, options);
  const parsed = parseStatementFile(upload.bytes, upload.name, options.mapping as GenericCsvMapping | null);
  if (!parsed.ok) {
    if (parsed.needsMapping) return { kind: "mapping", headers: parsed.headers, sample: parsed.sample };
    throw new ActionError(parsed.error);
  }

  const scope = scopeOf(options);
  const fileSha256 = createHash("sha256").update(upload.bytes).digest("hex");
  const dates = parsed.records.map((r) => r.occurredOn).sort();
  const [existingKeys, manual, history, previous] = await Promise.all([
    loadExistingKeys(ctx, scope),
    loadManualCandidates(ctx, options, dates[0], dates[dates.length - 1]),
    loadCategoryHistory(ctx),
    ctx.supabase
      .from("import_batches")
      .select("created_at")
      .eq("file_sha256", fileSha256)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rows = buildPreview(parsed.records, options.target, scope, existingKeys, manual).map((row) => ({
    ...row,
    suggestedCategoryId: history.get(normalizeText(row.description)) ?? null,
  }));

  let suggestedInvoiceMonth: string | null = null;
  if (options.target === "card") {
    const { data: card } = await ctx.supabase
      .from("credit_cards")
      .select("closing_day, due_day")
      .eq("id", options.targetId)
      .maybeSingle();
    if (card) suggestedInvoiceMonth = mostCommonInvoiceMonth(rows, card);
  }

  return {
    kind: "preview",
    format: parsed.format,
    fileName: upload.name,
    fileSha256,
    rows,
    errors: parsed.errors,
    targetMismatch: parsed.detectedTarget !== null && parsed.detectedTarget !== options.target,
    suggestedInvoiceMonth,
    previousImportAt: previous.data?.created_at ?? null,
  };
}

/** Um CSV de fatura cobre uma fatura: sugere a que recebe a maioria das compras. */
function mostCommonInvoiceMonth(rows: PreviewRow[], card: { closing_day: number; due_day: number }) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.signedCents >= 0) continue;
    const m = monthOf(invoiceForPurchase(r.occurredOn, card.closing_day, card.due_day).referenceMonth);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

async function loadExistingKeys(ctx: AuthContext, scope: string): Promise<Set<string>> {
  const prefixes = [`ext:${scope}:`, `h:${scope}:`];
  const keys = new Set<string>();
  for (const prefix of prefixes) {
    const rows = await fetchAll((from, to) =>
      ctx.supabase.from("transactions").select("dedupe_key").like("dedupe_key", `${prefix}%`).range(from, to),
    );
    for (const r of rows) if (r.dedupe_key) keys.add(r.dedupe_key);
  }
  return keys;
}

/** Lançamentos manuais no mesmo destino e período, para avisar de possíveis duplicatas. */
async function loadManualCandidates(
  ctx: AuthContext,
  options: ImportOptions,
  from: string,
  to: string,
): Promise<ManualCandidate[]> {
  const column = options.target === "card" ? "credit_card_id" : "account_id";
  return fetchAll((start, end) =>
    ctx.supabase
      .from("transactions")
      .select("occurred_on, amount_cents, kind")
      .eq(column, options.targetId)
      .is("import_batch_id", null)
      .gte("occurred_on", from)
      .lte("occurred_on", to)
      .range(start, end),
  );
}

/** Categoria usada mais recentemente para cada descrição: sugestão que aprende com o uso. */
async function loadCategoryHistory(ctx: AuthContext): Promise<Map<string, string>> {
  const { data } = await ctx.supabase
    .from("transactions")
    .select("description, category_id")
    .not("category_id", "is", null)
    .order("occurred_on", { ascending: false })
    .limit(3000);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const key = normalizeText(row.description);
    if (row.category_id && !map.has(key)) map.set(key, row.category_id);
  }
  return map;
}

export type ImportReport = {
  batchId: string;
  imported: number;
  duplicates: number;
  skipped: number;
  errors: number;
};

/**
 * Grava a importação. Reprocessa o arquivo no servidor (não confia em linhas
 * vindas do navegador) e aplica só as decisões do usuário: ação e categoria.
 */
export async function commitImport(
  ctx: AuthContext,
  upload: { bytes: Uint8Array; name: string },
  options: ImportOptions,
  decisions: ImportDecision[],
): Promise<ImportReport> {
  const preview = await buildImportPreview(ctx, upload, options);
  if (preview.kind !== "preview") throw new ActionError("Configure o mapeamento de colunas antes de importar.");

  const byIndex = new Map(decisions.map((d) => [d.index, d]));
  const allowed = options.target === "card" ? ["expense", "refund", "skip"] : ["income", "expense", "refund", "invoice_payment", "skip"];
  const categories = await loadCategoryKinds(ctx);

  let cardInvoiceId: string | null = null;
  if (options.target === "card") {
    if (!options.invoiceMonth) throw new ActionError("Escolha a fatura que recebe estas compras.");
    cardInvoiceId = await ensureInvoiceForMonth(ctx, options.targetId, options.invoiceMonth);
  }

  const toInsert: TablesInsert<"transactions">[] = [];
  let duplicates = 0;
  let skipped = 0;
  const paymentInvoices = new Map<string, string>();

  for (const row of preview.rows) {
    if (row.duplicate) {
      duplicates++;
      continue;
    }
    const decision = byIndex.get(row.index);
    const action = decision?.action ?? row.suggestedAction;
    if (action === "skip") {
      skipped++;
      continue;
    }
    if (!allowed.includes(action)) throw new ActionError(`Linha ${row.line}: ação inválida para este destino.`);

    const categoryId = action === "invoice_payment" ? null : (decision?.categoryId ?? null);
    if (categoryId) {
      const kind = categories.get(categoryId);
      const expected = action === "income" ? "income" : "expense";
      if (kind !== expected) throw new ActionError(`Linha ${row.line}: a categoria não combina com o tipo.`);
    }

    const base = {
      kind: action as Exclude<ImportAction, "skip">,
      status: "paid" as const,
      amount_cents: row.amountCents,
      occurred_on: row.occurredOn,
      description: row.description,
      category_id: categoryId,
      external_id: row.externalId,
      dedupe_key: row.dedupeKey,
    };

    if (options.target === "card") {
      toInsert.push({ ...base, credit_card_id: options.targetId, invoice_id: cardInvoiceId });
    } else if (action === "invoice_payment") {
      if (!options.paymentCardId) {
        throw new ActionError(`Linha ${row.line}: escolha o cartão abatido pelos pagamentos de fatura.`);
      }
      const invoiceId = await invoiceForPayment(ctx, options.paymentCardId, row.occurredOn, paymentInvoices);
      toInsert.push({ ...base, account_id: options.targetId, credit_card_id: options.paymentCardId, invoice_id: invoiceId });
    } else {
      toInsert.push({ ...base, account_id: options.targetId });
    }
  }

  if (toInsert.length === 0) throw new ActionError("Nenhuma linha selecionada para importar.");

  const format = preview.format;
  const { data: batch, error: batchError } = await ctx.supabase
    .from("import_batches")
    .insert({
      format,
      file_name: preview.fileName,
      file_sha256: preview.fileSha256,
      account_id: options.target === "account" ? options.targetId : null,
      credit_card_id: options.target === "card" ? options.targetId : null,
      invoice_id: cardInvoiceId,
      total_rows: preview.rows.length + preview.errors.length,
      duplicate_count: duplicates,
      skipped_count: skipped,
      error_count: preview.errors.length,
      // Só número da linha e motivo; nada do conteúdo do arquivo.
      errors: preview.errors.slice(0, 200),
    })
    .select("id")
    .single();
  if (batchError || !batch) throw new ActionError("Não foi possível registrar a importação.");

  // Funções da Vercel têm tempo limitado: insere em lotes e desfaz tudo se falhar.
  let imported = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500).map((row) => ({ ...row, import_batch_id: batch.id }));
    const { error, count } = await ctx.supabase
      .from("transactions")
      .upsert(chunk, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true, count: "exact" });
    if (error) {
      await ctx.supabase.from("transactions").delete().eq("import_batch_id", batch.id);
      await ctx.supabase.from("import_batches").delete().eq("id", batch.id);
      console.error("[import] falha ao inserir:", error.code);
      throw new ActionError("Não foi possível gravar as transações. Nada foi importado.");
    }
    imported += count ?? chunk.length;
  }

  // Linhas que outra importação gravou entre a prévia e agora contam como duplicatas.
  const raced = toInsert.length - imported;
  await ctx.supabase
    .from("import_batches")
    .update({ imported_count: imported, duplicate_count: duplicates + raced })
    .eq("id", batch.id);

  return { batchId: batch.id, imported, duplicates: duplicates + raced, skipped, errors: preview.errors.length };
}

async function loadCategoryKinds(ctx: AuthContext) {
  const { data } = await ctx.supabase.from("categories").select("id, kind");
  return new Map((data ?? []).map((c) => [c.id, c.kind]));
}

async function ensureInvoiceForMonth(ctx: AuthContext, cardId: string, month: string): Promise<string> {
  const { data: card } = await ctx.supabase
    .from("credit_cards")
    .select("closing_day, due_day")
    .eq("id", cardId)
    .maybeSingle();
  if (!card) throw new ActionError("Cartão não encontrado.");
  const dates = invoiceDatesFor(month, card.closing_day, card.due_day);
  const { error } = await ctx.supabase.from("credit_card_invoices").upsert(
    {
      credit_card_id: cardId,
      reference_month: dates.referenceMonth,
      closing_date: dates.closingDate,
      due_date: dates.dueDate,
    },
    { onConflict: "credit_card_id,reference_month", ignoreDuplicates: true },
  );
  if (error) throw new ActionError("Não foi possível criar a fatura.");
  const { data } = await ctx.supabase
    .from("credit_card_invoices")
    .select("id")
    .eq("credit_card_id", cardId)
    .eq("reference_month", dates.referenceMonth)
    .single();
  if (!data) throw new ActionError("Não foi possível localizar a fatura.");
  return data.id;
}

/** Um pagamento quita a fatura que fechou mais recentemente até a data dele. */
async function invoiceForPayment(ctx: AuthContext, cardId: string, paidOn: string, cache: Map<string, string>) {
  const { data: card } = await ctx.supabase
    .from("credit_cards")
    .select("closing_day, due_day")
    .eq("id", cardId)
    .maybeSingle();
  if (!card) throw new ActionError("Cartão de pagamento não encontrado.");
  const month = monthOf(paidOn);
  const closing = invoiceDatesFor(month, card.closing_day, card.due_day).closingDate;
  const invoiceMonth = paidOn >= closing ? month : addMonthsToMonth(month, -1);
  const cached = cache.get(invoiceMonth);
  if (cached) return cached;
  const id = await ensureInvoiceForMonth(ctx, cardId, invoiceMonth);
  cache.set(invoiceMonth, id);
  return id;
}

/** Remove só as transações criadas por esta importação. Lançamentos manuais ficam. */
export async function undoImportBatch(ctx: AuthContext, batchId: string) {
  const { data: batch } = await ctx.supabase
    .from("import_batches")
    .select("id, status")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) throw new ActionError("Importação não encontrada.");
  if (batch.status === "undone") throw new ActionError("Esta importação já foi desfeita.");

  const { error, count } = await ctx.supabase
    .from("transactions")
    .delete({ count: "exact" })
    .eq("import_batch_id", batchId);
  if (error) throw new ActionError("Não foi possível remover as transações importadas.");
  await ctx.supabase
    .from("import_batches")
    .update({ status: "undone", undone_at: new Date().toISOString() })
    .eq("id", batchId);
  return { removed: count ?? 0 };
}
