import { describe, expect, it } from "vitest";

import {
  addMonths,
  formatDate,
  formatMonth,
  isISODate,
  isWithin,
  monthRange,
  monthsBetween,
  previousRange,
  todayIn,
} from "@/domain/dates";

describe("datas", () => {
  it("valida datas de calendário", () => {
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(isISODate("2026-13-01")).toBe(false);
  });

  it("soma meses limitando ao fim do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("calcula intervalo do mês e o período anterior", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousRange(monthRange("2026-03"))).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousRange({ from: "2026-10-11", to: "2026-10-20" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-10",
    });
  });

  it("filtra datas pelo intervalo, inclusive nas bordas", () => {
    const range = { from: "2026-10-01", to: "2026-10-31" };
    expect(isWithin("2026-10-01", range)).toBe(true);
    expect(isWithin("2026-10-31", range)).toBe(true);
    expect(isWithin("2026-09-30", range)).toBe(false);
    expect(isWithin("2026-11-01", range)).toBe(false);
  });

  it("lista meses", () => {
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("usa o fuso do usuário para descobrir hoje", () => {
    // 02:30 UTC de 1º de novembro ainda é 31 de outubro em São Paulo (UTC-3).
    const instant = new Date("2026-11-01T02:30:00Z");
    expect(todayIn("America/Sao_Paulo", instant)).toBe("2026-10-31");
    expect(todayIn("UTC", instant)).toBe("2026-11-01");
  });

  it("formata no padrão brasileiro", () => {
    expect(formatDate("2026-10-05")).toBe("05/10/2026");
    expect(formatMonth("2026-10")).toBe("outubro de 2026");
  });
});
