import { describe, expect, it } from "vitest";

import {
  invoiceForPurchase,
  invoiceStatus,
  planInstallments,
  splitInstallments,
} from "@/domain/credit-card";

describe("fatura da compra", () => {
  it("compra antes do fechamento cai na fatura do mês", () => {
    expect(invoiceForPurchase("2026-10-05", 10, 17)).toEqual({
      referenceMonth: "2026-10-01",
      closingDate: "2026-10-10",
      dueDate: "2026-10-17",
    });
  });

  it("compra no dia do fechamento vai para a próxima fatura", () => {
    expect(invoiceForPurchase("2026-10-10", 10, 17).referenceMonth).toBe("2026-11-01");
  });

  it("vencimento antes do dia de fechamento fica no mês seguinte", () => {
    expect(invoiceForPurchase("2026-12-20", 28, 5)).toEqual({
      referenceMonth: "2026-12-01",
      closingDate: "2026-12-28",
      dueDate: "2027-01-05",
    });
  });

  it("fechamento no dia 31 respeita meses curtos", () => {
    const inv = invoiceForPurchase("2026-02-15", 31, 31);
    expect(inv.closingDate).toBe("2026-02-28");
    expect(inv.dueDate).toBe("2026-03-31");
  });
});

describe("parcelamento", () => {
  it("divide sem perder centavos", () => {
    const parts = splitInstallments(10000, 3);
    expect(parts).toEqual([3334, 3333, 3333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it("rejeita valores inválidos", () => {
    expect(() => splitInstallments(2, 3)).toThrow();
    expect(() => splitInstallments(0, 1)).toThrow();
    expect(() => splitInstallments(10.5, 2)).toThrow();
  });

  it("distribui as parcelas em faturas consecutivas", () => {
    const plan = planInstallments("2026-10-31", 30000, 3, { closing_day: 10, due_day: 17 });
    expect(plan.map((p) => p.invoice.referenceMonth)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
    expect(plan.map((p) => p.occurredOn)).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
    expect(plan.map((p) => `${p.number}/${p.total}`)).toEqual(["1/3", "2/3", "3/3"]);
  });
});

describe("status da fatura", () => {
  const invoice = { closing_date: "2026-10-10", due_date: "2026-10-17" };
  const totals = { charges_cents: 10000, refunds_cents: 0, paid_cents: 0 };

  it("aberta antes do fechamento", () => {
    expect(invoiceStatus(invoice, totals, "2026-10-09")).toBe("open");
  });
  it("fechada entre fechamento e vencimento", () => {
    expect(invoiceStatus(invoice, totals, "2026-10-12")).toBe("closed");
  });
  it("vencida depois do vencimento sem pagamento", () => {
    expect(invoiceStatus(invoice, totals, "2026-10-18")).toBe("overdue");
  });
  it("paga quando pagamentos cobrem compras menos estornos", () => {
    expect(
      invoiceStatus(invoice, { charges_cents: 10000, refunds_cents: 2000, paid_cents: 8000 }, "2026-10-18"),
    ).toBe("paid");
  });
  it("sem lançamentos", () => {
    expect(invoiceStatus(invoice, { charges_cents: 0, refunds_cents: 0, paid_cents: 0 }, "2026-10-20")).toBe("empty");
  });
});
