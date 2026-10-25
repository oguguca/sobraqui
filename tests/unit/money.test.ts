import { describe, expect, it } from "vitest";

import { centsToInput, formatMoney, parseDecimal, parseMoney } from "@/domain/money";

describe("parseMoney", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["1234.56", 123456],
    ["1,234.56", 123456],
    ["R$ 10", 1000],
    ["R$ 1.500", 150000],
    ["0,5", 50],
    ["-5,00", -500],
    ["(12,30)", -1230],
    ["0,01", 1],
  ])("%s -> %d centavos", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(["", "abc", "1,2,3", "1,234", "12,345", "1.23.4", "--1", "R$"])(
    "rejeita %s",
    (input) => {
      expect(parseMoney(input)).toBeNull();
    },
  );

  it("não perde centavos com valores que quebram em ponto flutuante", () => {
    // 0.1 + 0.2 !== 0.3 em float; em centavos a soma é exata.
    expect(parseMoney("0,10")! + parseMoney("0,20")!).toBe(parseMoney("0,30"));
    expect(parseMoney("1.000.000,07")).toBe(100000007);
  });
});

describe("parseDecimal", () => {
  it("lê valores de arquivos de banco", () => {
    expect(parseDecimal("-45.90", ".")).toBe(-4590);
    expect(parseDecimal("1,234.5", ".")).toBe(123450);
    expect(parseDecimal("+10", ".")).toBe(1000);
    expect(parseDecimal("-1.234,56", ",")).toBe(-123456);
    expect(parseDecimal("12.345", ".")).toBeNull();
    expect(parseDecimal("", ".")).toBeNull();
  });
});

describe("formatação", () => {
  it("formata em reais", () => {
    expect(formatMoney(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(formatMoney(-500).replace(/\s/g, " ")).toBe("-R$ 5,00");
    expect(formatMoney(500, { signed: true }).replace(/\s/g, " ")).toBe("+R$ 5,00");
  });

  it("converte centavos para campo de formulário", () => {
    expect(centsToInput(123456)).toBe("1234,56");
    expect(centsToInput(-5)).toBe("-0,05");
  });
});

describe("toPlain", async () => {
  const { toPlain } = await import("@/server/db");
  it("remove símbolos, converte bigint e preserva Map/Date", () => {
    const row = { a: BigInt(1), d: new Date(0), [Symbol("x")]: 1, nested: [{ b: BigInt(2) }] };
    const plain = toPlain(row);
    expect(Object.getOwnPropertySymbols(plain)).toHaveLength(0);
    expect(plain).toEqual({ a: 1, d: new Date(0), nested: [{ b: 2 }] });
    const m = toPlain(new Map([["k", { v: BigInt(3) }]]));
    expect(m.get("k")).toEqual({ v: 3 });
  });
});
