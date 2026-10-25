import { describe, expect, it } from "vitest";

import { buildPreview } from "@/domain/import/pipeline";
import {
  amountToCents,
  mapPluggyTransaction,
  suggestCategoryName,
  unpaidBillCarryOver,
  type PluggyTransaction,
} from "@/domain/import/pluggy";

const tx = (p: Partial<PluggyTransaction>): PluggyTransaction => ({
  id: "t1",
  description: "Transferência enviada pelo Pix - Fulano",
  amount: -45.9,
  date: "2026-10-05T12:00:00.000Z",
  type: "DEBIT",
  operationType: "PIX",
  paymentData: { paymentMethod: "PIX" },
  creditCardMetadata: null,
  ...p,
});

describe("Pluggy: conta", () => {
  it("converte reais em centavos sem erro de ponto flutuante", () => {
    expect(amountToCents(0.1 + 0.2)).toBe(30);
    expect(amountToCents(-1234.56)).toBe(-123456);
  });

  it("Pix enviado vira saída via Pix, com o id da Pluggy para deduplicar", () => {
    const r = mapPluggyTransaction(tx({}), "BANK", 1)!;
    expect(r).toMatchObject({ occurredOn: "2026-10-05", signedCents: -4590, externalId: "t1" });
    expect(r.hints?.paymentMethod).toBe("pix");
    const [row] = buildPreview([r], "account", "acc:1", new Set(), []);
    expect(row).toMatchObject({ suggestedAction: "expense", paymentMethod: "pix", dedupeKey: "ext:acc:1:t1" });
  });

  it("compra no débito vira cartão de débito", () => {
    const r = mapPluggyTransaction(tx({ description: "Compra no débito - Padaria", operationType: "CARTAO", paymentData: null }), "BANK", 1)!;
    expect(r.hints?.paymentMethod).toBe("debit_card");
  });

  it("pagamento de fatura não é despesa", () => {
    const r = mapPluggyTransaction(tx({ description: "Pagamento de fatura", operationType: "OUTROS", paymentData: null }), "BANK", 1)!;
    expect(r.hints?.action).toBe("invoice_payment");
  });

  it("aplicação e resgate de investimento ficam desmarcados", () => {
    expect(mapPluggyTransaction(tx({ description: "Aplicação RDB" }), "BANK", 1)!.hints?.action).toBe("skip");
    expect(mapPluggyTransaction(tx({ description: "Resgate RDB", amount: 100 }), "BANK", 1)!.hints?.action).toBe("skip");
  });

  it("transferência entre contas do titular fica desmarcada", () => {
    expect(mapPluggyTransaction(tx({ amount: 30, category: "Transfer - Internal" }), "BANK", 1)!.hints?.action).toBe("skip");
    expect(mapPluggyTransaction(tx({ category: "Same person transfer" }), "BANK", 1)!.hints?.action).toBe("skip");
    expect(
      mapPluggyTransaction(tx({ amount: 30, operationType: "TRANSFERENCIA_MESMA_INSTITUICAO", category: null }), "BANK", 1)!
        .hints?.action,
    ).toBe("skip");
  });

  it("entrada comum não recebe dica (classificador decide)", () => {
    const r = mapPluggyTransaction(tx({ amount: 5000, description: "Transferência recebida" }), "BANK", 1)!;
    expect(r.signedCents).toBe(500000);
    expect(r.hints).toBeUndefined();
  });

  it("ignora transações sem data ou valor", () => {
    expect(mapPluggyTransaction(tx({ amount: 0 }), "BANK", 1)).toBeNull();
    expect(mapPluggyTransaction(tx({ date: "" }), "BANK", 1)).toBeNull();
  });
});

describe("Pluggy: cartão", () => {
  const card = (p: Partial<PluggyTransaction>) =>
    tx({ type: "DEBIT", operationType: "PAGAMENTO", paymentData: null, amount: 100, description: "Loja", ...p });

  it("compra (valor positivo) vira saída no crédito", () => {
    const r = mapPluggyTransaction(card({}), "CREDIT", 1)!;
    expect(r.signedCents).toBe(-10000);
    expect(r.hints).toMatchObject({ action: "expense", paymentMethod: "credit_card" });
    expect(r.hints?.installment).toBeUndefined();
  });

  it("parcelas da mesma compra têm o mesmo grupo", () => {
    const meta = (n: number) => ({ installmentNumber: n, totalInstallments: 3, purchaseDate: "2026-09-10" });
    const a = mapPluggyTransaction(card({ id: "a", description: "Loja - Parcela 1/3", creditCardMetadata: meta(1) }), "CREDIT", 1)!;
    const b = mapPluggyTransaction(
      card({ id: "b", description: "Loja - Parcela 2/3", date: "2026-10-10T00:00:00Z", creditCardMetadata: meta(2) }),
      "CREDIT",
      2,
    )!;
    expect(a.hints?.installment).toMatchObject({ number: 1, total: 3 });
    expect(a.hints?.installment?.groupKey).toBe(b.hints?.installment?.groupKey);
  });

  it("rotativo: o saldo entra na fatura, o crédito que fecha a anterior não", () => {
    expect(mapPluggyTransaction(card({ amount: 133.76, description: "Saldo em rotativo" }), "CREDIT", 1)!.hints?.action).toBe("expense");
    expect(
      mapPluggyTransaction(card({ amount: -133.76, type: "CREDIT", description: "Crédito de rotativo" }), "CREDIT", 1)!.hints?.action,
    ).toBe("skip");
  });

  it("pagamento da fatura é ignorado no cartão; estorno vira estorno", () => {
    expect(
      mapPluggyTransaction(card({ amount: -500, type: "CREDIT", operationType: "PAGAMENTO_FATURA" }), "CREDIT", 1)!.hints?.action,
    ).toBe("skip");
    expect(mapPluggyTransaction(card({ amount: -20, type: "CREDIT", operationType: "ESTORNO" }), "CREDIT", 1)!.hints?.action).toBe(
      "refund",
    );
  });
});

describe("Pluggy: saldo anterior não pago", () => {
  const bill = { id: "b1", billClosingDate: "2026-10-07T00:00:00Z", totalAmount: 333.7576, payments: [{ amount: 200 }] };

  it("leva o que faltou pagar para a fatura seguinte", () => {
    const r = unpaidBillCarryOver(bill, 1)!;
    expect(r).toMatchObject({ occurredOn: "2026-10-07", signedCents: -13376, externalId: "bill-carryover:b1" });
    expect(r.hints).toMatchObject({ action: "expense", paymentMethod: "credit_card" });
  });

  it("fatura paga inteira não gera lançamento", () => {
    expect(unpaidBillCarryOver({ ...bill, payments: [{ amount: 333.76 }] }, 1)).toBeNull();
  });
});

describe("Pluggy: categoria sugerida", () => {
  it.each([
    [{ category: "Taxi and ride-hailing", categoryId: "19050000" }, "expense", "Transporte"],
    [{ category: "Groceries", categoryId: "10000000" }, "expense", "Alimentação"],
    [{ category: "Music streaming", categoryId: "09030000" }, "expense", "Assinaturas"],
    [{ category: "University", categoryId: "07010000" }, "expense", "Educação"],
    [{ category: "Salary", categoryId: "01010000" }, "income", "Salário"],
    [{ category: "Transfers", categoryId: "05000000" }, "expense", null],
  ] as const)("%o (%s) -> %s", (pluggy, kind, expected) => {
    expect(suggestCategoryName(pluggy, kind)).toBe(expected);
  });
});
