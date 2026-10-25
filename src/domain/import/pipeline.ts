import { parseCsv } from "./csv";
import {
  detectCsvFormat,
  parseGenericCsv,
  parseNubankAccountCsv,
  parseNubankCardCsv,
} from "./csv-formats";
import { looksLikeOfx, parseOfx } from "./ofx";
import { decodeText, normalizeText } from "./text";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  type GenericCsvMapping,
  type ImportAction,
  type ImportFormat,
  type ImportTarget,
  type PaymentMethod,
  type PreviewRow,
  type RawRecord,
  type RowError,
} from "./types";

export type ParsedFile =
  | {
      ok: true;
      format: ImportFormat;
      records: RawRecord[];
      errors: RowError[];
      /** Alvo sugerido pelo próprio arquivo, quando dá para saber. */
      detectedTarget: ImportTarget | null;
    }
  | {
      ok: false;
      /** CSV desconhecido: precisa do mapeamento de colunas. */
      needsMapping: true;
      headers: string[];
      sample: string[][];
    }
  | { ok: false; needsMapping: false; error: string };

export function parseStatementFile(
  bytes: Uint8Array,
  fileName: string,
  mapping: GenericCsvMapping | null = null,
): ParsedFile {
  if (bytes.byteLength === 0) return fail("O arquivo está vazio.");
  if (bytes.byteLength > MAX_IMPORT_BYTES) return fail("O arquivo passa do limite de 2 MB.");

  const text = decodeText(bytes);
  if (text.includes("\u0000")) return fail("O arquivo parece ser binário. Envie um CSV ou OFX.");
  if (text.trim() === "") return fail("O arquivo está vazio.");

  const lowerName = fileName.toLowerCase();
  if (looksLikeOfx(text) || lowerName.endsWith(".ofx")) {
    if (!looksLikeOfx(text)) return fail("O arquivo .ofx não tem um cabeçalho OFX válido.");
    const statement = parseOfx(text);
    if (statement.records.length === 0 && statement.errors.length === 0) {
      return fail("Nenhuma transação encontrada no OFX.");
    }
    return withLimits({
      ok: true,
      format: "ofx",
      records: statement.records,
      errors: statement.errors,
      detectedTarget: statement.accountType === "creditcard" ? "card" : "account",
    });
  }

  if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".txt")) {
    return fail("Formato não suportado. Envie um arquivo .csv ou .ofx.");
  }

  const table = parseCsv(text);
  if (table.headers.length < 2) return fail("Não encontrei colunas no CSV.");
  if (table.rows.length === 0) return fail("O CSV só tem cabeçalho, sem transações.");

  const format = detectCsvFormat(table.headers);
  if (format === "nubank_account_csv") {
    return withLimits({ ok: true, format, ...parseNubankAccountCsv(table), detectedTarget: "account" });
  }
  if (format === "nubank_card_csv") {
    return withLimits({ ok: true, format, ...parseNubankCardCsv(table), detectedTarget: "card" });
  }
  if (!mapping) {
    return {
      ok: false,
      needsMapping: true,
      headers: table.headers,
      sample: table.rows.slice(0, 5).map((r) => r.cells),
    };
  }
  return withLimits({ ok: true, format, ...parseGenericCsv(table, mapping), detectedTarget: null });
}

function fail(error: string): ParsedFile {
  return { ok: false, needsMapping: false, error };
}

function withLimits(result: Extract<ParsedFile, { ok: true }>): ParsedFile {
  if (result.records.length + result.errors.length > MAX_IMPORT_ROWS) {
    return fail(`O arquivo tem mais de ${MAX_IMPORT_ROWS} linhas. Divida em arquivos menores.`);
  }
  if (result.records.length === 0) {
    return fail(
      result.errors.length > 0
        ? `Nenhuma linha válida. Primeiro erro (linha ${result.errors[0].line}): ${result.errors[0].reason}`
        : "Nenhuma transação encontrada.",
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------------

export function classify(
  record: RawRecord,
  target: ImportTarget,
): { action: ImportAction; suggestion: string | null } {
  if (record.hints?.action) return { action: record.hints.action, suggestion: record.hints.suggestion ?? null };
  const d = normalizeText(record.description);
  const incoming = record.signedCents > 0;

  if (target === "card") {
    if (!incoming) return { action: "expense", suggestion: null };
    if (/pagamento/.test(d)) {
      return {
        action: "skip",
        suggestion: "Pagamento da fatura: registre pelo extrato da conta para não contar duas vezes.",
      };
    }
    return { action: "refund", suggestion: "Crédito na fatura tratado como estorno." };
  }

  if (incoming) {
    if (/estorno|reembolso|devolucao|cashback/.test(d)) return { action: "refund", suggestion: null };
    return { action: "income", suggestion: transferHint(d) };
  }
  if (/pagamento (de )?fatura/.test(d)) {
    return {
      action: "invoice_payment",
      suggestion: "Pagamento de fatura: não conta como despesa; abate a fatura do cartão escolhido.",
    };
  }
  return { action: "expense", suggestion: transferHint(d) };
}

function transferHint(d: string): string | null {
  if (/transferencia (enviada|recebida)|pix (enviado|recebido)/.test(d)) {
    return "Se for entre suas próprias contas, ignore aqui e registre como transferência.";
  }
  return null;
}

/** Forma de pagamento de uma saída, pelo texto que o banco usa. */
export function suggestPaymentMethod(description: string, target: ImportTarget): PaymentMethod | null {
  if (target === "card") return "credit_card";
  const d = normalizeText(description);
  if (/\bpix\b/.test(d)) return "pix";
  if (/debito/.test(d)) return "debit_card";
  if (/boleto/.test(d)) return "boleto";
  if (/\b(ted|doc)\b|transferencia/.test(d)) return "transfer";
  if (/saque/.test(d)) return "cash";
  return null;
}

// ---------------------------------------------------------------------------
// Deduplicação
// ---------------------------------------------------------------------------

/**
 * Chave estável por linha. Com identificador do banco, usa só ele. Sem
 * identificador, usa data + valor + descrição + ordem de aparição: duas compras
 * iguais no mesmo dia continuam sendo duas transações, e reimportar o mesmo
 * arquivo (ou um período sobreposto) gera as mesmas chaves.
 */
export function buildDedupeKeys(records: readonly RawRecord[], scope: string): string[] {
  const seen = new Map<string, number>();
  return records.map((r) => {
    if (r.externalId) return `ext:${scope}:${r.externalId}`.slice(0, 512);
    const base = `${r.occurredOn}:${r.signedCents}:${normalizeText(r.description)}`;
    const ordinal = (seen.get(base) ?? 0) + 1;
    seen.set(base, ordinal);
    return `h:${scope}:${base}#${ordinal}`.slice(0, 512);
  });
}

export type ManualCandidate = { occurred_on: string; amount_cents: number; kind: string };

export function buildPreview(
  records: readonly RawRecord[],
  target: ImportTarget,
  scope: string,
  existingKeys: ReadonlySet<string>,
  manualCandidates: readonly ManualCandidate[],
): PreviewRow[] {
  const keys = buildDedupeKeys(records, scope);
  const manual = new Map<string, number>();
  for (const c of manualCandidates) {
    const k = `${c.occurred_on}|${c.amount_cents}|${c.kind}`;
    manual.set(k, (manual.get(k) ?? 0) + 1);
  }

  const keysInFile = new Set<string>();
  return records.map((record, index) => {
    const { action, suggestion } = classify(record, target);
    const amountCents = Math.abs(record.signedCents);
    // Mesmo identificador repetido no próprio arquivo também é duplicata.
    const duplicate = existingKeys.has(keys[index]) || keysInFile.has(keys[index]);
    keysInFile.add(keys[index]);
    let possibleManualDuplicate = false;
    if (!duplicate && action !== "skip") {
      const k = `${record.occurredOn}|${amountCents}|${action}`;
      const available = manual.get(k) ?? 0;
      if (available > 0) {
        possibleManualDuplicate = true;
        manual.set(k, available - 1);
      }
    }
    return {
      ...record,
      paymentMethod:
        record.signedCents < 0
          ? record.hints?.paymentMethod !== undefined
            ? record.hints.paymentMethod
            : suggestPaymentMethod(record.description, target)
          : null,
      index,
      amountCents,
      dedupeKey: keys[index],
      duplicate,
      possibleManualDuplicate,
      // Duplicatas e possíveis duplicatas começam desmarcadas.
      suggestedAction: duplicate || possibleManualDuplicate ? "skip" : action,
      suggestion: duplicate
        ? "Já importada antes."
        : possibleManualDuplicate
          ? "Parece um lançamento que você já cadastrou à mão. Confira antes de importar."
          : suggestion,
    };
  });
}

/** Ações válidas para o tipo de destino. */
export function allowedActions(target: ImportTarget): ImportAction[] {
  return target === "card"
    ? ["expense", "refund", "skip"]
    : ["income", "expense", "refund", "invoice_payment", "skip"];
}
