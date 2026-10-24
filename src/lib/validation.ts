import { z } from "zod";

import { isISODate, isISOMonth, isValidTimezone } from "@/domain/dates";
import { parseMoney } from "@/domain/money";

// Esquemas compartilhados por formulários (cliente) e Server Actions (servidor).

export const uuid = z.uuid("Identificador inválido.");
export const optionalUuid = z
  .union([uuid, z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);

export const isoDate = z.string().refine(isISODate, "Data inválida.");
export const isoMonth = z.string().refine(isISOMonth, "Mês inválido.");
export const optionalIsoDate = z
  .union([isoDate, z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);

const MAX_CENTS = 99_999_999_999; // R$ 999.999.999,99

/** Campo de valor digitado ("1.234,56") convertido para centavos. */
export const moneyInput = (opts: { allowNegative?: boolean; allowZero?: boolean } = {}) =>
  z
    .string()
    .trim()
    .min(1, "Informe o valor.")
    .transform((v, ctx) => {
      const cents = parseMoney(v);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: "Valor inválido." });
        return z.NEVER;
      }
      if (!opts.allowNegative && cents < 0) {
        ctx.addIssue({ code: "custom", message: "O valor não pode ser negativo." });
        return z.NEVER;
      }
      if (!opts.allowZero && cents === 0) {
        ctx.addIssue({ code: "custom", message: "O valor precisa ser maior que zero." });
        return z.NEVER;
      }
      if (Math.abs(cents) > MAX_CENTS) {
        ctx.addIssue({ code: "custom", message: "Valor alto demais." });
        return z.NEVER;
      }
      return cents;
    });

export const name = (max: number) =>
  z.string().trim().min(1, "Campo obrigatório.").max(max, `Use até ${max} caracteres.`);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use até ${max} caracteres.`)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.");
export const optionalHexColor = z
  .union([hexColor, z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);

export const timezone = z.string().refine(isValidTimezone, "Fuso horário inválido.");

export const idInput = z.object({ id: uuid });
