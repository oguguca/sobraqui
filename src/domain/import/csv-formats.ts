import { isISODate, toISODate } from "../dates";
import { parseDecimal } from "../money";
import type { CsvTable } from "./csv";
import { cleanDescription, normalizeText } from "./text";
import type { GenericCsvMapping, ImportFormat, RawRecord, RowError } from "./types";

// Layouts conhecidos da exportação CSV do app do Nubank. Não há especificação
// oficial: o formato pode mudar sem aviso, por isso existe o mapeamento manual.
//
// Extrato da conta:  Data,Valor,Identificador,Descrição
//                    01/10/2026,-45.90,6a1f...,Compra no débito - Padaria
// Fatura do cartão:  date,title,amount        (ou date,category,title,amount)
//                    2026-10-01,Padaria,45.90 (positivo = compra; negativo = pagamento/estorno)

export type CsvParseResult = { records: RawRecord[]; errors: RowError[] };

export function detectCsvFormat(headers: string[]): Exclude<ImportFormat, "ofx"> {
  const h = headers.map(normalizeText);
  const has = (...names: string[]) => names.every((n) => h.includes(n));
  if (has("data", "valor", "identificador", "descricao")) return "nubank_account_csv";
  if (has("date", "title", "amount")) return "nubank_card_csv";
  return "generic_csv";
}

function column(headers: string[], name: string): number {
  return headers.map(normalizeText).indexOf(name);
}

export function parseNubankAccountCsv(table: CsvTable): CsvParseResult {
  const iDate = column(table.headers, "data");
  const iAmount = column(table.headers, "valor");
  const iId = column(table.headers, "identificador");
  const iDesc = column(table.headers, "descricao");
  return mapRows(table, (cells) => ({
    occurredOn: parseDate(cells[iDate], "dd/MM/yyyy"),
    signedCents: parseDecimal(cells[iAmount] ?? "", "."),
    description: cells[iDesc] ?? "",
    externalId: cells[iId] || null,
    rawCategory: null,
  }));
}

export function parseNubankCardCsv(table: CsvTable): CsvParseResult {
  const iDate = column(table.headers, "date");
  const iTitle = column(table.headers, "title");
  const iAmount = column(table.headers, "amount");
  const iCategory = column(table.headers, "category");
  return mapRows(table, (cells) => {
    const amount = parseDecimal(cells[iAmount] ?? "", ".");
    return {
      occurredOn: parseDate(cells[iDate], "yyyy-MM-dd"),
      // Converte para a convenção da conta: compra é saída.
      signedCents: amount === null ? null : -amount,
      description: cells[iTitle] ?? "",
      externalId: null,
      rawCategory: iCategory >= 0 ? cells[iCategory] || null : null,
    };
  });
}

export function parseGenericCsv(table: CsvTable, mapping: GenericCsvMapping): CsvParseResult {
  const width = table.headers.length;
  const columns = [mapping.dateColumn, mapping.amountColumn, mapping.descriptionColumn];
  if (columns.some((c) => c < 0 || c >= width) || (mapping.idColumn !== null && mapping.idColumn >= width)) {
    return { records: [], errors: [{ line: 1, reason: "Mapeamento de colunas inválido." }] };
  }
  return mapRows(table, (cells) => {
    const amount = parseDecimal((cells[mapping.amountColumn] ?? "").replace(/^R\$\s*/i, ""), mapping.decimal);
    return {
      occurredOn: parseDate(cells[mapping.dateColumn], mapping.dateFormat),
      signedCents: amount === null ? null : mapping.invertSign ? -amount : amount,
      description: cells[mapping.descriptionColumn] ?? "",
      externalId: mapping.idColumn === null ? null : cells[mapping.idColumn] || null,
      rawCategory: null,
    };
  });
}

type RowRead = {
  occurredOn: string | null;
  signedCents: number | null;
  description: string;
  externalId: string | null;
  rawCategory: string | null;
};

function mapRows(table: CsvTable, read: (cells: string[]) => RowRead): CsvParseResult {
  const records: RawRecord[] = [];
  const errors: RowError[] = [];
  for (const { line, cells } of table.rows) {
    const r = read(cells);
    if (!r.occurredOn) {
      errors.push({ line, reason: "Data inválida ou ausente." });
      continue;
    }
    if (r.signedCents === null) {
      errors.push({ line, reason: "Valor inválido ou ausente." });
      continue;
    }
    if (r.signedCents === 0) {
      errors.push({ line, reason: "Valor zerado." });
      continue;
    }
    const description = cleanDescription(r.description);
    records.push({
      line,
      occurredOn: r.occurredOn,
      signedCents: r.signedCents,
      description: description || "Sem descrição",
      externalId: r.externalId ? r.externalId.slice(0, 255) : null,
      rawCategory: r.rawCategory,
    });
  }
  return { records, errors };
}

export function parseDate(
  value: string | undefined,
  pattern: GenericCsvMapping["dateFormat"],
): string | null {
  if (!value) return null;
  const v = value.trim();
  let m: RegExpExecArray | null;
  let iso: string | null = null;
  if (pattern === "yyyy-MM-dd" && (m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v))) {
    iso = toISODate(+m[1], +m[2], +m[3]);
  } else if (pattern === "dd/MM/yyyy" && (m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v))) {
    iso = toISODate(+m[3], +m[2], +m[1]);
  } else if (pattern === "MM/dd/yyyy" && (m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v))) {
    iso = toISODate(+m[3], +m[1], +m[2]);
  }
  return iso && isISODate(iso) ? iso : null;
}
