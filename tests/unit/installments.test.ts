import { describe, expect, it } from "vitest";

import { financedTotal, interestNote, interestSummary, monthlyInterestRate } from "@/domain/installments";
import { transactionFormSchema } from "@/lib/transaction-schema";

const CARD = "11111111-1111-4111-8111-111111111111";
const purchase = (extra: Record<string, unknown>) =>
  transactionFormSchema.safeParse({
    mode: "expense",
    description: "Celular",
    amount: "1.200,00",
    occurredOn: "2026-10-25",
    paymentMethod: "credit_card",
    cardId: CARD,
    installments: 12,
    ...extra,
  });

describe("formulário de compra parcelada", () => {
  it("sem juros: o valor é o total e não há valor à vista separado", () => {
    const r = purchase({});
    expect(r.success && r.data).toMatchObject({ amount: 120_000, cashAmount: null });
  });

  it("pela parcela: total = parcela × quantidade, à vista guardado", () => {
    const r = purchase({ interestMode: "installment", interestValue: "110,00" });
    expect(r.success && r.data).toMatchObject({ amount: 132_000, cashAmount: 120_000 });
  });

  it("pelo total com juros", () => {
    const r = purchase({ interestMode: "total", interestValue: "1.319,90" });
    expect(r.success && r.data).toMatchObject({ amount: 131_990, cashAmount: 120_000 });
  });

  it("recusa valor vazio e total menor que o à vista", () => {
    const empty = purchase({ interestMode: "installment", interestValue: "" });
    expect(empty.success).toBe(false);
    if (!empty.success) expect(empty.error.issues[0].path).toEqual(["interestValue"]);
    expect(purchase({ interestMode: "total", interestValue: "1.000,00" }).success).toBe(false);
  });

  it("à vista (1 parcela) ignora o modo de juros", () => {
    const r = purchase({ installments: 1, interestMode: "installment", interestValue: "110,00" });
    expect(r.success && r.data).toMatchObject({ amount: 120_000, cashAmount: null });
  });
});

describe("financedTotal", () => {
  it("sem juros: o total é o valor à vista", () => {
    expect(financedTotal(120_000, 12, "none", null)).toBe(120_000);
  });

  it("pelo valor da parcela: parcela × quantidade", () => {
    expect(financedTotal(120_000, 12, "installment", 11_000)).toBe(132_000);
  });

  it("pelo total informado: usa o total", () => {
    expect(financedTotal(120_000, 12, "total", 131_990)).toBe(131_990);
  });

  it("modo com juros sem valor informado cai no valor à vista", () => {
    expect(financedTotal(120_000, 12, "installment", null)).toBe(120_000);
  });
});

describe("monthlyInterestRate", () => {
  it("encontra a taxa mensal equivalente (tabela Price)", () => {
    // R$ 1.200 à vista em 12× de R$ 110: cerca de 1,46% ao mês.
    expect(monthlyInterestRate(120_000, 132_000, 12)).toBeCloseTo(0.0146, 3);
  });

  it("sem juros ou com desconto não há taxa", () => {
    expect(monthlyInterestRate(120_000, 120_000, 12)).toBeNull();
    expect(monthlyInterestRate(120_000, 110_000, 12)).toBeNull();
    expect(monthlyInterestRate(120_000, 132_000, 1)).toBeNull();
  });
});

describe("interestSummary e interestNote", () => {
  it("resume juros em reais, no total e ao mês", () => {
    const s = interestSummary(120_000, 132_000, 12);
    expect(s.interestCents).toBe(12_000);
    expect(s.totalRate).toBeCloseTo(0.1, 6);
    expect(s.monthlyRate).toBeCloseTo(0.0146, 3);
  });

  it("monta a observação com à vista, total e juros", () => {
    // formatMoney separa "R$" do número com espaço não separável.
    const note = interestNote(120_000, 132_000, 12).replace(/ /g, " ");
    expect(note).toContain("12×");
    expect(note).toContain("R$ 1.200,00");
    expect(note).toContain("R$ 1.320,00");
    expect(note).toContain("R$ 120,00");
    expect(note).toContain("a.m.");
  });
});
