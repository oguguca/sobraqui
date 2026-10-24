import type { ISODate } from "../dates";

export type ImportFormat = "nubank_account_csv" | "nubank_card_csv" | "ofx" | "generic_csv";

/** Tipo de destino do arquivo: extrato de conta ou fatura de cartão. */
export type ImportTarget = "account" | "card";

/** Registro lido do arquivo, antes de virar lançamento. */
export type RawRecord = {
  line: number;
  occurredOn: ISODate;
  /**
   * Valor com sinal na convenção da conta: positivo entra, negativo sai.
   * Em faturas de cartão, compras chegam negativas e pagamentos/estornos positivos.
   */
  signedCents: number;
  description: string;
  externalId: string | null;
  /** Categoria informada pelo banco, quando existe (só para sugestão). */
  rawCategory: string | null;
};

export type RowError = { line: number; reason: string };

/** O que fazer com uma linha. "skip" ignora a linha nesta importação. */
export type ImportAction = "income" | "expense" | "refund" | "invoice_payment" | "skip";

export type PreviewRow = RawRecord & {
  index: number;
  amountCents: number;
  suggestedAction: ImportAction;
  dedupeKey: string;
  /** Já existe uma transação importada com a mesma chave. */
  duplicate: boolean;
  /** Existe lançamento manual parecido (mesma data, valor e tipo). */
  possibleManualDuplicate: boolean;
  suggestion: string | null;
};

export type GenericCsvMapping = {
  dateColumn: number;
  amountColumn: number;
  descriptionColumn: number;
  idColumn: number | null;
  dateFormat: "dd/MM/yyyy" | "yyyy-MM-dd" | "MM/dd/yyyy";
  decimal: "," | ".";
  /** Inverte o sinal (arquivos em que despesas vêm positivas). */
  invertSign: boolean;
};

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
