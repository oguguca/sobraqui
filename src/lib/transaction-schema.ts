import { z } from "zod";

import { isoDate, moneyInput, name, optionalText, optionalUuid, uuid } from "@/lib/validation";

// Formulário de lançamento manual. Cada "modo" vira um tipo de transação.
export const transactionFormSchema = z
  .object({
    mode: z.enum(["expense", "income", "refund", "transfer"]),
    description: name(200),
    amount: moneyInput(),
    occurredOn: isoDate,
    categoryId: optionalUuid,
    notes: optionalText(2000),
    /** Origem do dinheiro em despesas e estornos. */
    source: z.enum(["account", "card"]).default("account"),
    /** Forma de pagamento das saídas. Crédito vai para o cartão; as demais saem da conta. */
    paymentMethod: z.enum(["pix", "debit_card", "credit_card", "boleto", "cash", "transfer", "other"]).default("pix"),
    accountId: optionalUuid,
    destinationAccountId: optionalUuid,
    cardId: optionalUuid,
    status: z.enum(["paid", "pending"]).default("paid"),
    installments: z.coerce.number().int().min(1).max(72).default(1),
    repeat: z.enum(["none", "weekly", "monthly", "yearly"]).default("none"),
  })
  .superRefine((v, ctx) => {
    const usesCard = usesCreditCard(v);
    if (usesCard && !v.cardId) ctx.addIssue({ code: "custom", path: ["cardId"], message: "Escolha o cartão." });
    if (!usesCard && !v.accountId) {
      ctx.addIssue({ code: "custom", path: ["accountId"], message: "Escolha a conta." });
    }
    if (v.mode === "transfer") {
      if (!v.destinationAccountId) {
        ctx.addIssue({ code: "custom", path: ["destinationAccountId"], message: "Escolha a conta de destino." });
      } else if (v.destinationAccountId === v.accountId) {
        ctx.addIssue({ code: "custom", path: ["destinationAccountId"], message: "Escolha uma conta diferente." });
      }
    }
    if (v.installments > 1 && !(v.mode === "expense" && usesCard)) {
      ctx.addIssue({ code: "custom", path: ["installments"], message: "Parcelamento só em compras no cartão." });
    }
    if (v.installments > 1 && v.amount < v.installments) {
      ctx.addIssue({ code: "custom", path: ["installments"], message: "Valor baixo demais para parcelar." });
    }
    if (v.repeat !== "none" && !((v.mode === "expense" || v.mode === "income") && !usesCard)) {
      ctx.addIssue({ code: "custom", path: ["repeat"], message: "Recorrência só para receitas e despesas em conta." });
    }
  });

export type TransactionFormInput = z.input<typeof transactionFormSchema>;
export type TransactionFormValues = z.output<typeof transactionFormSchema>;

export const transactionUpdateSchema = z.object({
  id: uuid,
  description: name(200),
  amount: moneyInput(),
  occurredOn: isoDate,
  categoryId: optionalUuid,
  notes: optionalText(2000),
  status: z.enum(["paid", "pending"]),
  /** Só para saídas em conta (trocar para crédito exige relançar no cartão). */
  paymentMethod: z.enum(["pix", "debit_card", "boleto", "cash", "transfer", "other"]).nullable().optional(),
});

export type TransactionUpdateInput = z.input<typeof transactionUpdateSchema>;
export type TransactionUpdateValues = z.output<typeof transactionUpdateSchema>;

/** Saída no crédito ou estorno no cartão: o lançamento vai para a fatura. */
export function usesCreditCard(v: { mode: string; source?: string; paymentMethod?: string }): boolean {
  if (v.mode === "expense") return v.paymentMethod === "credit_card";
  if (v.mode === "refund") return v.source === "card";
  return false;
}
