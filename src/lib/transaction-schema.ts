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
    accountId: optionalUuid,
    destinationAccountId: optionalUuid,
    cardId: optionalUuid,
    status: z.enum(["paid", "pending"]).default("paid"),
    installments: z.coerce.number().int().min(1).max(72).default(1),
    repeat: z.enum(["none", "weekly", "monthly", "yearly"]).default("none"),
  })
  .superRefine((v, ctx) => {
    const usesCard = (v.mode === "expense" || v.mode === "refund") && v.source === "card";
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
});

export type TransactionUpdateInput = z.input<typeof transactionUpdateSchema>;
export type TransactionUpdateValues = z.output<typeof transactionUpdateSchema>;
