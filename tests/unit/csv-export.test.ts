import { describe, expect, it } from "vitest";

import { csvAmount, csvCell, toCsv } from "@/domain/csv-export";

describe("exportação CSV", () => {
  it("formata valores com vírgula decimal", () => {
    expect(csvAmount(123456)).toBe("1234,56");
    expect(csvAmount(-5)).toBe("-0,05");
  });

  it("escapa separadores e aspas", () => {
    expect(csvCell('diz "oi"; tchau')).toBe('"diz ""oi""; tchau"');
  });

  it("neutraliza fórmulas em textos", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell(-10)).toBe("-10");
  });

  it("monta o arquivo com BOM e CRLF", () => {
    expect(toCsv(["a", "b"], [["1", null]])).toBe("﻿a;b\r\n1;\r\n");
  });
});
