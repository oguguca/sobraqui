import type { Enums } from "@/lib/db/types";

export const ACCOUNT_TYPE_LABEL: Record<Enums<"account_type">, string> = {
  checking: "Conta corrente",
  payment: "Conta de pagamento",
  cash: "Dinheiro",
  savings: "Poupança",
  investment: "Investimentos",
  other: "Outra",
};

export const CATEGORY_KIND_LABEL: Record<Enums<"category_kind">, string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
};

export const TRANSACTION_KIND_LABEL: Record<Enums<"transaction_kind">, string> = {
  income: "Receita",
  expense: "Despesa",
  refund: "Estorno",
  transfer: "Transferência",
  invoice_payment: "Pagamento de fatura",
};

export const PAYMENT_METHOD_LABEL: Record<Enums<"payment_method">, string> = {
  pix: "Pix",
  debit_card: "Cartão de débito",
  credit_card: "Cartão de crédito",
  boleto: "Boleto",
  cash: "Dinheiro",
  transfer: "Transferência / TED",
  other: "Outro",
};

/** Ordem de exibição nos formulários. */
export const PAYMENT_METHODS = ["pix", "debit_card", "credit_card", "boleto", "cash", "transfer", "other"] as const;

export const TRANSACTION_STATUS_LABEL: Record<Enums<"transaction_status">, string> = {
  paid: "Efetivada",
  pending: "Pendente",
};

export const GOAL_KIND_LABEL: Record<Enums<"goal_kind">, string> = {
  emergency: "Reserva de emergência",
  purchase: "Compra",
  debt: "Quitar dívida",
  other: "Outra",
};

export const FREQUENCY_LABEL: Record<Enums<"recurrence_frequency">, string> = {
  weekly: "Semanal",
  monthly: "Mensal",
  yearly: "Anual",
};

export const IMPORT_FORMAT_LABEL: Record<Enums<"import_format">, string> = {
  nubank_account_csv: "Nubank · extrato (CSV)",
  nubank_card_csv: "Nubank · fatura (CSV)",
  ofx: "OFX",
  generic_csv: "CSV (mapeado)",
  pluggy: "Open Finance (Pluggy)",
};

export const PALETTE = [
  "#16a34a", "#0ea5e9", "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#14b8a6", "#64748b", "#0f766e", "#a16207",
];
