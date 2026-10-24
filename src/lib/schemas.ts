import { z } from "zod";

import { CATEGORY_ICON_NAMES } from "@/components/category-icon-names";
import {
  hexColor,
  isoDate,
  isoMonth,
  moneyInput,
  name,
  optionalHexColor,
  optionalIsoDate,
  optionalText,
  optionalUuid,
  uuid,
} from "@/lib/validation";

// Schemas de formulário compartilhados entre cliente (react-hook-form) e
// Server Actions. O servidor sempre valida de novo.

export const accountSchema = z.object({
  name: name(80),
  type: z.enum(["checking", "payment", "cash", "savings", "investment", "other"]),
  institution: optionalText(80),
  initialBalance: moneyInput({ allowNegative: true, allowZero: true }),
  color: optionalHexColor,
});
export type AccountInput = z.input<typeof accountSchema>;
export type AccountValues = z.output<typeof accountSchema>;

export const categorySchema = z.object({
  name: name(60),
  kind: z.enum(["income", "expense", "transfer"]),
  icon: z.enum(CATEGORY_ICON_NAMES),
  color: hexColor,
});
export type CategoryInput = z.input<typeof categorySchema>;
export type CategoryValues = z.output<typeof categorySchema>;

const day = z.coerce.number().int().min(1, "Dia entre 1 e 31.").max(31, "Dia entre 1 e 31.");

export const cardSchema = z.object({
  name: name(80),
  brand: optionalText(40),
  limit: moneyInput({ allowZero: true }),
  closingDay: day,
  dueDay: day,
  paymentAccountId: optionalUuid,
  color: optionalHexColor,
});
export type CardInput = z.input<typeof cardSchema>;
export type CardValues = z.output<typeof cardSchema>;

export const invoicePaymentSchema = z.object({
  invoiceId: uuid,
  accountId: uuid,
  amount: moneyInput(),
  paidOn: isoDate,
});
export type InvoicePaymentInput = z.input<typeof invoicePaymentSchema>;
export type InvoicePaymentValues = z.output<typeof invoicePaymentSchema>;

export const budgetSchema = z.object({
  categoryId: uuid,
  month: isoMonth,
  limit: moneyInput(),
});
export type BudgetInput = z.input<typeof budgetSchema>;
export type BudgetValues = z.output<typeof budgetSchema>;

export const goalSchema = z.object({
  name: name(80),
  kind: z.enum(["emergency", "purchase", "debt", "other"]),
  target: moneyInput(),
  saved: moneyInput({ allowZero: true }),
  targetDate: optionalIsoDate,
  color: optionalHexColor,
});
export type GoalInput = z.input<typeof goalSchema>;
export type GoalValues = z.output<typeof goalSchema>;

export const goalContributionSchema = z.object({
  id: uuid,
  amount: moneyInput({ allowNegative: true }),
});
export type GoalContributionInput = z.input<typeof goalContributionSchema>;
export type GoalContributionValues = z.output<typeof goalContributionSchema>;
