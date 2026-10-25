import { isISODate } from "../dates";
import { normalizeText, cleanDescription } from "./text";
import type { PaymentMethod, RawRecord } from "./types";

// Conversão de transações da API da Pluggy (Open Finance) para o formato do
// importador. Campos conferidos em respostas reais de /v2/transactions:
// - Conta (type BANK): amount positivo = entrada, negativo = saída.
// - Cartão (type CREDIT): amount positivo = compra, negativo = crédito
//   (pagamento da fatura, estorno, cashback). Parcelas vêm uma por transação,
//   com creditCardMetadata.installmentNumber / totalInstallments.

export type PluggyTransaction = {
  id: string;
  description: string;
  descriptionRaw?: string | null;
  amount: number;
  date: string;
  category?: string | null;
  categoryId?: string | null;
  status?: string | null;
  type?: "CREDIT" | "DEBIT" | string | null;
  operationType?: string | null;
  paymentData?: { paymentMethod?: string | null } | null;
  creditCardMetadata?: {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    purchaseDate?: string | null;
  } | null;
};

export type PluggyAccountType = "BANK" | "CREDIT";

/** Categorias da Pluggy para dinheiro do próprio titular mudando de lugar. */
const OWN_TRANSFER_CATEGORIES = new Set(["Same person transfer", "Transfer - Internal"]);

/** Reais (float da API) para centavos inteiros, sem acumular erro. */
export function amountToCents(amount: number): number | null {
  if (!Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function bankPaymentMethod(t: PluggyTransaction): PaymentMethod | null {
  const op = t.operationType ?? "";
  if (op === "CARTAO") return "debit_card";
  const method = t.paymentData?.paymentMethod;
  if (method === "PIX" || op === "PIX") return "pix";
  if (method === "TED" || method === "TEF" || method === "DOC") return "transfer";
  if (method === "BOLETO" || op === "BOLETO") return "boleto";
  if (op === "SAQUE") return "cash";
  return null;
}

/** Grupo estável de uma compra parcelada: mesma data de compra, descrição base, total e valor. */
function installmentGroupKey(t: PluggyTransaction, cents: number): string {
  const base = normalizeText(t.description).replace(/\s*-?\s*parcela\s*\d+\s*\/\s*\d+\s*$/, "");
  const purchase = (t.creditCardMetadata?.purchaseDate ?? t.date).slice(0, 10);
  return `${purchase}|${base}|${t.creditCardMetadata?.totalInstallments}|${Math.abs(cents)}`;
}

export function mapPluggyTransaction(t: PluggyTransaction, accountType: PluggyAccountType, line: number): RawRecord | null {
  const occurredOn = t.date?.slice(0, 10);
  const cents = amountToCents(t.amount);
  if (!occurredOn || !isISODate(occurredOn) || cents === null || cents === 0) return null;

  const description = cleanDescription(t.description || t.descriptionRaw || "") || "Sem descrição";
  const base = { line, occurredOn, description, externalId: t.id, rawCategory: t.category ?? null };
  const categoryFor = (kind: "income" | "expense") => suggestCategoryName(t, kind);
  const d = normalizeText(description);

  if (accountType === "CREDIT") {
    const signedCents = -cents; // convenção do importador: compra sai (negativa)
    if (cents > 0) {
      const total = t.creditCardMetadata?.totalInstallments ?? 0;
      const number = t.creditCardMetadata?.installmentNumber ?? 0;
      const installment =
        total >= 2 && total <= 72 && number >= 1 && number <= total
          ? { number, total, groupKey: installmentGroupKey(t, cents) }
          : undefined;
      return {
        ...base,
        signedCents,
        hints: { action: "expense", paymentMethod: "credit_card", installment, categoryName: categoryFor("expense") },
      };
    }
    // "Crédito de rotativo" quita a fatura anterior; o "Saldo em rotativo" correspondente
    // é que entra na fatura atual. Contar o crédito aqui anularia esse saldo.
    if (/credito de rotativo/.test(d)) {
      return {
        ...base,
        signedCents,
        hints: { action: "skip", suggestion: "Crédito que fecha a fatura anterior (o saldo foi para o rotativo desta fatura)." },
      };
    }
    if (t.operationType === "PAGAMENTO_FATURA" || /pagamento recebido/.test(d)) {
      return {
        ...base,
        signedCents,
        hints: {
          action: "skip",
          suggestion: "Pagamento da fatura: já entra pelo extrato da conta, para não contar duas vezes.",
        },
      };
    }
    return {
      ...base,
      signedCents,
      hints: { action: "refund", suggestion: "Crédito na fatura tratado como estorno.", categoryName: categoryFor("expense") },
    };
  }

  // Conta corrente / poupança.
  // Transferência entre contas do próprio titular (categoria do Open Finance): não é receita nem gasto.
  if (OWN_TRANSFER_CATEGORIES.has(t.category ?? "") || t.operationType === "TRANSFERENCIA_MESMA_INSTITUICAO") {
    return {
      ...base,
      signedCents: cents,
      hints: {
        action: "skip",
        suggestion: "Transferência entre contas suas: não conta como receita nem despesa. Marque se for de outra pessoa.",
      },
    };
  }
  if (/^(aplicacao|resgate)\b/.test(d) || t.operationType === "RESGATE_APLIC_FINANCEIRA") {
    return {
      ...base,
      signedCents: cents,
      hints: {
        action: "skip",
        suggestion: "Aplicação/resgate (ex.: Caixinha): é dinheiro seu indo ou voltando do investimento, não receita nem gasto.",
      },
    };
  }
  if (cents < 0) {
    if (/pagamento (de )?fatura/.test(d)) {
      return {
        ...base,
        signedCents: cents,
        hints: {
          action: "invoice_payment",
          paymentMethod: null,
          suggestion: "Pagamento de fatura: não conta como despesa; abate a fatura do cartão.",
        },
      };
    }
    return { ...base, signedCents: cents, hints: { paymentMethod: bankPaymentMethod(t), categoryName: categoryFor("expense") } };
  }
  const incomeCategory = categoryFor("income");
  return incomeCategory ? { ...base, signedCents: cents, hints: { categoryName: incomeCategory } } : { ...base, signedCents: cents };
}

/**
 * Saldo não pago de uma fatura fechada, que o banco cobra na fatura seguinte.
 * Datado no fechamento: pela regra do cartão, cai na fatura seguinte.
 */
export function unpaidBillCarryOver(
  bill: { id: string; billClosingDate?: string | null; totalAmount: number; payments?: { amount: number }[] | null },
  line: number,
): RawRecord | null {
  const closing = bill.billClosingDate?.slice(0, 10);
  if (!closing || !isISODate(closing)) return null;
  const total = amountToCents(bill.totalAmount) ?? 0;
  const paid = (bill.payments ?? []).reduce((s, p) => s + Math.abs(amountToCents(p.amount) ?? 0), 0);
  const unpaid = total - paid;
  if (unpaid <= 0) return null;
  return {
    line,
    occurredOn: closing,
    signedCents: -unpaid,
    description: "Saldo não pago da fatura anterior",
    externalId: `bill-carryover:${bill.id}`,
    rawCategory: null,
    hints: {
      action: "expense",
      paymentMethod: "credit_card",
      suggestion: "Parte da fatura anterior que não foi paga e o banco cobra nesta fatura.",
    },
  };
}

// Categoria da Pluggy -> nome de uma categoria padrão do Sobraqui.
// Pelo código (2 primeiros dígitos = grupo), com exceções por nome de subcategoria.
const GROUP_TO_CATEGORY: Record<string, { expense?: string; income?: string }> = {
  "01": { income: "Outras receitas" },
  "02": { expense: "Outros gastos" },
  "03": { income: "Investimentos" },
  "07": { expense: "Outros gastos" },
  "08": { expense: "Compras" },
  "09": { expense: "Assinaturas" },
  "10": { expense: "Alimentação" },
  "11": { expense: "Alimentação" },
  "12": { expense: "Lazer" },
  "14": { expense: "Lazer" },
  "15": { expense: "Juros e tarifas" },
  "16": { expense: "Juros e tarifas" },
  "17": { expense: "Moradia" },
  "18": { expense: "Saúde" },
  "19": { expense: "Transporte" },
  "20": { expense: "Outros gastos" },
  "21": { expense: "Lazer" },
};

const NAME_TO_CATEGORY: Record<string, string> = {
  salary: "Salário",
  university: "Educação",
  school: "Educação",
  "online courses": "Educação",
  pharmacy: "Saúde",
  "gyms and fitness centers": "Saúde",
  "wellness and fitness": "Saúde",
  wellness: "Saúde",
  "music streaming": "Assinaturas",
  "video streaming": "Assinaturas",
  internet: "Moradia",
  electricity: "Moradia",
  "water": "Moradia",
  telecommunications: "Assinaturas",
  mobile: "Assinaturas",
  tv: "Assinaturas",
  "interests charged": "Juros e tarifas",
  "late payment and overdraft costs": "Juros e tarifas",
  "tax on financial operations": "Juros e tarifas",
  "bank fees": "Juros e tarifas",
};

/**
 * Nome da categoria padrão sugerida para uma transação da Pluggy, ou null
 * (ex.: transferências genéricas, que podem ser qualquer coisa).
 */
export function suggestCategoryName(
  pluggy: { category?: string | null; categoryId?: string | null },
  kind: "income" | "expense",
): string | null {
  const byName = NAME_TO_CATEGORY[(pluggy.category ?? "").toLowerCase()];
  if (byName) return byName === "Salário" ? (kind === "income" ? byName : null) : kind === "expense" ? byName : null;
  const group = GROUP_TO_CATEGORY[(pluggy.categoryId ?? "").slice(0, 2)];
  return (kind === "income" ? group?.income : group?.expense) ?? null;
}
