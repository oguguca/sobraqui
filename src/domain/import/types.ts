import type { ISODate } from "../dates";

export type ImportFormat = "nubank_account_csv" | "nubank_card_csv" | "ofx" | "generic_csv" | "pluggy";

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
  /** Classificação já conhecida pela fonte (ex.: arquivo que já diz o tipo), que vence as heurísticas. */
  hints?: RecordHints;
};

export type RecordHints = {
  action?: ImportAction;
  suggestion?: string;
  paymentMethod?: PaymentMethod | null;
  /** Parcela de compra parcelada; groupKey é igual para todas as parcelas da compra. */
  installment?: { number: number; total: number; groupKey: string };
  /** Nome de categoria padrão sugerida pela fonte (casada com as categorias do usuário pelo nome). */
  categoryName?: string | null;
};

export type RowError = { line: number; reason: string };

/** O que fazer com uma linha. "skip" ignora a linha nesta importação. */
export type ImportAction = "income" | "expense" | "refund" | "invoice_payment" | "skip";

export type PaymentMethod = "pix" | "debit_card" | "credit_card" | "boleto" | "cash" | "transfer" | "other";

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
  /** Forma de pagamento deduzida da descrição (só saídas). */
  paymentMethod: PaymentMethod | null;
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
