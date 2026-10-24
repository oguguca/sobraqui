import { isISODate } from "../dates";
import { parseDecimal } from "../money";
import type { RawRecord, RowError } from "./types";

export type OfxStatement = {
  /** CREDITCARD quando o extrato é de cartão (CCSTMTRS). */
  accountType: "bank" | "creditcard";
  records: RawRecord[];
  errors: RowError[];
};

export function looksLikeOfx(text: string): boolean {
  const head = text.slice(0, 2000).toUpperCase();
  return head.includes("OFXHEADER") || head.includes("<OFX>");
}

/**
 * Lê transações de OFX 1.x (SGML, tags sem fechamento) e 2.x (XML).
 * Só extrai o necessário: STMTTRN com DTPOSTED, TRNAMT, FITID, NAME e MEMO.
 */
export function parseOfx(text: string): OfxStatement {
  const upper = text.toUpperCase();
  const accountType = upper.includes("<CCSTMTRS>") ? "creditcard" : "bank";
  const records: RawRecord[] = [];
  const errors: RowError[] = [];

  const blockRe = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = blockRe.exec(text))) {
    index++;
    const fields = readFields(match[1]);
    const line = lineAt(text, match.index);

    const date = parseOfxDate(fields.DTPOSTED ?? "");
    const amount = parseDecimal((fields.TRNAMT ?? "").replace(/\s/g, ""), ".") ??
      parseDecimal((fields.TRNAMT ?? "").replace(/\s/g, ""), ",");
    const description = [fields.NAME, fields.MEMO]
      .filter((v): v is string => Boolean(v && v.trim()))
      .filter((v, i, all) => all.indexOf(v) === i)
      .join(" - ");

    if (!date) {
      errors.push({ line, reason: `Transação ${index}: data inválida (${fields.DTPOSTED ?? "vazia"}).` });
      continue;
    }
    if (amount === null || amount === 0) {
      errors.push({ line, reason: `Transação ${index}: valor inválido (${fields.TRNAMT ?? "vazio"}).` });
      continue;
    }
    records.push({
      line,
      occurredOn: date,
      signedCents: amount,
      description: description || fields.TRNTYPE || "Sem descrição",
      externalId: fields.FITID?.trim() || null,
      rawCategory: null,
    });
  }

  return { accountType, records, errors };
}

function readFields(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const fieldRe = /<([A-Z0-9.]+)>([^<\r\n]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(block))) {
    const key = m[1].toUpperCase();
    if (!(key in fields)) fields[key] = decodeEntities(m[2].trim());
  }
  return fields;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** DTPOSTED: AAAAMMDD[HHMMSS[.XXX]][[-3:BRT]]. Usa só a data. */
function parseOfxDate(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return isISODate(iso) ? iso : null;
}

function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}
