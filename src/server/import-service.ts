import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { invoiceDatesFor, invoiceForPurchase } from "@/domain/credit-card";
import { addMonthsToMonth, isISOMonth, monthOf } from "@/domain/dates";
import { buildPreview, parseStatementFile, type ManualCandidate } from "@/domain/import/pipeline";
import { categoryFromDescription } from "@/domain/import/merchant-rules";
import { normalizeText } from "@/domain/import/text";
import {
  MAX_IMPORT_BYTES,
  type GenericCsvMapping,
  type ImportAction,
  type ImportFormat,
  type ImportTarget,
  type PreviewRow,
  type RawRecord,
  type RowError,
} from "@/domain/import/types";
import type { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/server/action";
import type { AuthContext } from "@/server/auth";
import { dbDate, type Tx } from "@/server/db";
import { recomputeInvoiceAdjustment } from "@/server/invoice-adjustment";
import { ensureInvoices } from "@/server/invoices";
import { accountBalances, fetchAll } from "@/server/queries/core";

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
  /** Fatura que recebe todas as compras de um arquivo de cartão (AAAA-MM). Obrigatória no cartão. */
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

type Upload = { bytes: Uint8Array; name: string };

/** Registros já lidos de um arquivo, prontos para a prévia. */
export type ImportSource = {
  format: ImportFormat;
  fileName: string;
  sha256: string;
  records: RawRecord[];
  errors: RowError[];
  detectedTarget: ImportTarget | null;
};

export async function readUpload(file: unknown): Promise<Upload> {
  if (!(file instanceof File)) throw new ActionError("Envie um arquivo.");
  if (file.size === 0) throw new ActionError("O arquivo está vazio.");
  if (file.size > MAX_IMPORT_BYTES) throw new ActionError("O arquivo passa do limite de 2 MB.");
  const name = file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 255) || "extrato";
  return { bytes: new Uint8Array(await file.arrayBuffer()), name };
}

// ---------------------------------------------------------------------------
// Fontes
// ---------------------------------------------------------------------------

export function sourceFromUpload(
  upload: Upload,
  options: ImportOptions,
): ImportSource | { kind: "mapping"; headers: string[]; sample: string[][] } {
  const parsed = parseStatementFile(upload.bytes, upload.name, options.mapping as GenericCsvMapping | null);
  if (!parsed.ok) {
    if (parsed.needsMapping) return { kind: "mapping", headers: parsed.headers, sample: parsed.sample };
    throw new ActionError(parsed.error);
  }
  return {
    format: parsed.format,
    fileName: upload.name,
    sha256: createHash("sha256").update(upload.bytes).digest("hex"),
    records: parsed.records,
    errors: parsed.errors,
    detectedTarget: parsed.detectedTarget,
  };
}

// ---------------------------------------------------------------------------
// Prévia
// ---------------------------------------------------------------------------

function scopeOf(options: ImportOptions) {
  return `${options.target === "card" ? "card" : "acc"}:${options.targetId}`;
}

async function assertTarget(tx: Tx, userId: string, options: ImportOptions) {
  const where = { id: options.targetId, user_id: userId };
  const select = { archived_at: true } as const;
  const target =
    options.target === "card"
      ? await tx.creditCard.findFirst({ where, select })
      : await tx.bankAccount.findFirst({ where, select });
  if (!target) throw new ActionError(options.target === "card" ? "Cartão não encontrado." : "Conta não encontrada.");
  if (target.archived_at) throw new ActionError("O destino escolhido está arquivado.");
}

/** Lê, valida e classifica sem gravar nada. */
export async function buildImportPreview(
  ctx: AuthContext,
  source: ImportSource,
  options: ImportOptions,
): Promise<PreviewResult> {
  return ctx.db((tx) => previewInTx(tx, ctx.user.id, source, options), { timeoutMs: 30_000 });
}

async function previewInTx(
  tx: Tx,
  userId: string,
  source: ImportSource,
  options: ImportOptions,
): Promise<Extract<PreviewResult, { kind: "preview" }>> {
  await assertTarget(tx, userId, options);
  const scope = scopeOf(options);
  const dates = source.records.map((r) => r.occurredOn).sort();
  const existingKeys = await loadExistingKeys(tx, userId, scope);
  const manual = await loadManualCandidates(tx, userId, options, dates[0], dates[dates.length - 1]);
  const history = await loadCategoryHistory(tx, userId);
  const previous = await tx.importBatch.findFirst({
    where: { user_id: userId, file_sha256: source.sha256, status: "completed" },
    orderBy: { created_at: "desc" },
    select: { created_at: true },
  });

  // Categoria sugerida, nesta ordem: o que você já usou para a mesma descrição;
  // regra por estabelecimento (Uber, iFood, Shopee...); categoria informada pela fonte.
  const byName = await loadCategoriesByName(tx, userId);
  const categoryId = (kind: "income" | "expense", name: string | null | undefined) =>
    name ? (byName.get(`${kind}:${normalizeText(name)}`) ?? null) : null;
  const rows = buildPreview(source.records, options.target, scope, existingKeys, manual).map((row) => {
    const kind = row.suggestedAction === "income" ? "income" : "expense";
    const fromRule = kind === "expense" ? categoryId(kind, categoryFromDescription(row.description)) : null;
    return {
      ...row,
      suggestedCategoryId: history.get(normalizeText(row.description)) ?? fromRule ?? categoryId(kind, row.hints?.categoryName),
    };
  });

  let suggestedInvoiceMonth: string | null = null;
  if (options.target === "card") {
    const card = await tx.creditCard.findFirst({
      where: { id: options.targetId, user_id: userId },
      select: { closing_day: true, due_day: true },
    });
    if (card) suggestedInvoiceMonth = mostCommonInvoiceMonth(rows, card);
  }

  return {
    kind: "preview",
    format: source.format,
    fileName: source.fileName,
    fileSha256: source.sha256,
    rows,
    errors: source.errors,
    targetMismatch: source.detectedTarget !== null && source.detectedTarget !== options.target,
    suggestedInvoiceMonth,
    previousImportAt: previous?.created_at ?? null,
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

async function loadExistingKeys(tx: Tx, userId: string, scope: string): Promise<Set<string>> {
  const rows = await fetchAll((skip, take) =>
    tx.transaction.findMany({
      where: {
        user_id: userId,
        OR: [{ dedupe_key: { startsWith: `ext:${scope}:` } }, { dedupe_key: { startsWith: `h:${scope}:` } }],
      },
      select: { dedupe_key: true },
      orderBy: { id: "asc" },
      skip,
      take,
    }),
  );
  return new Set(rows.map((r) => r.dedupe_key).filter((k): k is string => Boolean(k)));
}

/** Lançamentos manuais no mesmo destino e período, para avisar de possíveis duplicatas. */
async function loadManualCandidates(
  tx: Tx,
  userId: string,
  options: ImportOptions,
  from: string,
  to: string,
): Promise<ManualCandidate[]> {
  return tx.transaction.findMany({
    where: {
      user_id: userId,
      import_batch_id: null,
      ...(options.target === "card" ? { credit_card_id: options.targetId } : { account_id: options.targetId }),
      occurred_on: { gte: dbDate(from), lte: dbDate(to) },
    },
    select: { occurred_on: true, amount_cents: true, kind: true },
  });
}

/** Categorias ativas do usuário por "tipo:nome normalizado". */
async function loadCategoriesByName(tx: Tx, userId: string): Promise<Map<string, string>> {
  const rows = await tx.category.findMany({
    where: { user_id: userId, archived_at: null },
    select: { id: true, name: true, kind: true },
  });
  return new Map(rows.map((c) => [`${c.kind}:${normalizeText(c.name)}`, c.id]));
}

/** Categoria usada mais recentemente para cada descrição: sugestão que aprende com o uso. */
async function loadCategoryHistory(tx: Tx, userId: string): Promise<Map<string, string>> {
  // A categoria genérica não ensina nada: deixa as regras e a fonte decidirem.
  const generic = await tx.category.findFirst({
    where: { user_id: userId, kind: "expense", name: "Outros gastos" },
    select: { id: true },
  });
  const rows = await tx.transaction.findMany({
    where: { user_id: userId, category_id: generic ? { not: null, notIn: [generic.id] } : { not: null } },
    select: { description: true, category_id: true },
    orderBy: { occurred_on: "desc" },
    take: 3000,
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = normalizeText(row.description);
    if (row.category_id && !map.has(key)) map.set(key, row.category_id);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

export type ImportReport = {
  batchId: string;
  imported: number;
  duplicates: number;
  skipped: number;
  errors: number;
};

/**
 * Grava a importação numa única transação (tudo ou nada). Refaz a prévia no
 * servidor (não confia em linhas vindas do navegador) e aplica só as decisões
 * do usuário: ação e categoria.
 */
export async function commitImport(
  ctx: AuthContext,
  source: ImportSource,
  options: ImportOptions,
  decisions: ImportDecision[],
): Promise<ImportReport> {
  // Funções da Vercel têm duração limitada; a entrada é limitada a 5.000 linhas.
  return ctx.db((tx) => commitInTx(tx, ctx.user.id, source, options, decisions), { timeoutMs: 45_000 });
}

/** UUID determinístico: as parcelas de uma compra caem sempre no mesmo grupo, mesmo em importações diferentes. */
function groupUuid(userId: string, scope: string, key: string): string {
  const h = createHash("sha256").update(`${userId}|${scope}|${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function commitInTx(
  tx: Tx,
  userId: string,
  source: ImportSource,
  options: ImportOptions,
  decisions: ImportDecision[],
): Promise<ImportReport> {
  const preview = await previewInTx(tx, userId, source, options);
  const scope = scopeOf(options);

  const byIndex = new Map(decisions.map((d) => [d.index, d]));
  const allowed: ImportAction[] =
    options.target === "card" ? ["expense", "refund", "skip"] : ["income", "expense", "refund", "invoice_payment", "skip"];
  const categories = new Map(
    (await tx.category.findMany({ where: { user_id: userId }, select: { id: true, kind: true } })).map((c) => [c.id, c.kind]),
  );

  // Cartão: um arquivo de fatura vai inteiro para a fatura escolhida.
  let cardInvoiceId: string | null = null;
  if (options.target === "card") {
    if (!options.invoiceMonth) throw new ActionError("Escolha a fatura que recebe estas compras.");
    cardInvoiceId = await ensureInvoiceForMonth(tx, userId, options.targetId, options.invoiceMonth);
  }

  const rows: Prisma.TransactionCreateManyInput[] = [];
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
      const expected = action === "income" ? "income" : "expense";
      if (categories.get(categoryId) !== expected) {
        throw new ActionError(`Linha ${row.line}: a categoria não combina com o tipo.`);
      }
    }

    const installment = action === "expense" && options.target === "card" ? row.hints?.installment : undefined;
    const base = {
      user_id: userId,
      kind: action,
      status: "paid" as const,
      amount_cents: row.amountCents,
      occurred_on: dbDate(row.occurredOn),
      description: row.description,
      category_id: categoryId,
      external_id: row.externalId,
      dedupe_key: row.dedupeKey,
      // Só saídas levam forma de pagamento; no cartão é sempre crédito.
      payment_method:
        action === "expense"
          ? options.target === "card"
            ? ("credit_card" as const)
            : row.paymentMethod === "credit_card"
              ? null
              : row.paymentMethod
          : null,
      ...(installment
        ? {
            installment_group_id: groupUuid(userId, scope, installment.groupKey),
            installment_number: installment.number,
            installment_total: installment.total,
          }
        : {}),
    };

    if (options.target === "card") {
      rows.push({ ...base, credit_card_id: options.targetId, invoice_id: cardInvoiceId });
    } else if (action === "invoice_payment") {
      if (!options.paymentCardId) {
        throw new ActionError(`Linha ${row.line}: escolha o cartão abatido pelos pagamentos de fatura.`);
      }
      const invoiceId = await invoiceForPayment(tx, userId, options.paymentCardId, row.occurredOn, paymentInvoices);
      rows.push({ ...base, account_id: options.targetId, credit_card_id: options.paymentCardId, invoice_id: invoiceId });
    } else {
      rows.push({ ...base, account_id: options.targetId });
    }
  }

  if (rows.length === 0) throw new ActionError("Nenhuma linha selecionada para importar.");

  const batch = await tx.importBatch.create({
    data: {
      user_id: userId,
      format: preview.format,
      file_name: preview.fileName,
      file_sha256: preview.fileSha256,
      account_id: options.target === "account" ? options.targetId : null,
      credit_card_id: options.target === "card" ? options.targetId : null,
      invoice_id: cardInvoiceId,
      total_rows: preview.rows.length + preview.errors.length,
      skipped_count: skipped,
      error_count: preview.errors.length,
      // Só número da linha e motivo; nada do conteúdo da fonte.
      errors: preview.errors.slice(0, 200),
    },
    select: { id: true },
  });

  let imported = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, import_batch_id: batch.id }));
    // skipDuplicates: linhas gravadas por outra importação entre a prévia e agora.
    imported += (await tx.transaction.createMany({ data: chunk, skipDuplicates: true })).count;
  }
  // Fatura com valor informado do app: o ajuste passa a cobrir só o que ainda falta.
  if (cardInvoiceId) await recomputeInvoiceAdjustment(tx, userId, cardInvoiceId);

  const raced = rows.length - imported;
  await tx.importBatch.update({
    where: { id: batch.id },
    data: { imported_count: imported, duplicate_count: duplicates + raced },
  });

  return { batchId: batch.id, imported, duplicates: duplicates + raced, skipped, errors: preview.errors.length };
}

async function ensureInvoiceForMonth(tx: Tx, userId: string, cardId: string, month: string): Promise<string> {
  const card = await tx.creditCard.findFirst({
    where: { id: cardId, user_id: userId },
    select: { closing_day: true, due_day: true },
  });
  if (!card) throw new ActionError("Cartão não encontrado.");
  const [id] = await ensureInvoices(tx, userId, cardId, [invoiceDatesFor(month, card.closing_day, card.due_day)]);
  return id;
}

/** Um pagamento quita a fatura que fechou mais recentemente até a data dele. */
async function invoiceForPayment(tx: Tx, userId: string, cardId: string, paidOn: string, cache: Map<string, string>) {
  const card = await tx.creditCard.findFirst({
    where: { id: cardId, user_id: userId },
    select: { closing_day: true, due_day: true },
  });
  if (!card) throw new ActionError("Cartão de pagamento não encontrado.");
  const month = monthOf(paidOn);
  const closing = invoiceDatesFor(month, card.closing_day, card.due_day).closingDate;
  const invoiceMonth = paidOn >= closing ? month : addMonthsToMonth(month, -1);
  const cached = cache.get(invoiceMonth);
  if (cached) return cached;
  const id = await ensureInvoiceForMonth(tx, userId, cardId, invoiceMonth);
  cache.set(invoiceMonth, id);
  return id;
}

/** Remove só as transações criadas por esta importação. Lançamentos manuais ficam. */
export async function undoImportBatch(ctx: AuthContext, batchId: string) {
  const userId = ctx.user.id;
  return ctx.db(async (tx) => {
    const batch = await tx.importBatch.findFirst({ where: { id: batchId, user_id: userId }, select: { status: true } });
    if (!batch) throw new ActionError("Importação não encontrada.");
    if (batch.status === "undone") throw new ActionError("Esta importação já foi desfeita.");
    const { count } = await tx.transaction.deleteMany({ where: { user_id: userId, import_batch_id: batchId } });
    await tx.importBatch.update({ where: { id: batchId }, data: { status: "undone", undone_at: new Date() } });
    return { removed: count };
  });
}

/**
 * Apaga tudo o que veio de importações de arquivo e marca as
 * importações como desfeitas. Lançamentos manuais, contas, cartões e
 * categorias ficam. O saldo atual de cada conta é preservado: o saldo inicial
 * é ajustado para compensar as movimentações removidas.
 */
export async function clearImportedData(ctx: AuthContext) {
  const userId = ctx.user.id;
  return ctx.db(
    async (tx) => {
      const before = await accountBalances(tx, userId);
      const accounts = await tx.bankAccount.findMany({ where: { user_id: userId }, select: { id: true, initial_balance_cents: true } });

      const { count: removed } = await tx.transaction.deleteMany({
        where: { user_id: userId, OR: [{ import_batch_id: { not: null } }, { dedupe_key: { startsWith: "adjust:" } }] },
      });
      const { count: batches } = await tx.importBatch.updateMany({
        where: { user_id: userId, status: "completed" },
        data: { status: "undone", undone_at: new Date() },
      });
      await tx.creditCardInvoice.updateMany({ where: { user_id: userId }, data: { bank_amount_cents: null } });

      const after = await accountBalances(tx, userId);
      for (const a of accounts) {
        const current = a.initial_balance_cents + (before.get(a.id) ?? 0);
        const initial = current - (after.get(a.id) ?? 0);
        if (initial !== a.initial_balance_cents) {
          await tx.bankAccount.update({ where: { id: a.id }, data: { initial_balance_cents: initial } });
        }
      }
      return { removed, batches };
    },
    { timeoutMs: 45_000 },
  );
}
