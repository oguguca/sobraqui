import { describe, expect, it } from "vitest";

import { parseCsv } from "@/domain/import/csv";
import {
  buildDedupeKeys,
  buildPreview,
  classify,
  parseStatementFile,
  suggestPaymentMethod,
} from "@/domain/import/pipeline";
import type { RawRecord } from "@/domain/import/types";

const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text);

const NUBANK_ACCOUNT = [
  "Data,Valor,Identificador,Descrição",
  "01/10/2026,5000.00,id-salario,Transferência recebida pelo Pix - EMPRESA LTDA",
  "02/10/2026,-45.90,id-padaria,Compra no débito - Padaria Pão Bom",
  '03/10/2026,-1200.00,id-fatura,"Pagamento de fatura"',
  "04/10/2026,12.00,id-estorno,Estorno - Padaria Pão Bom",
].join("\r\n");

const NUBANK_CARD = [
  "date,title,amount",
  "2026-10-01,Padaria,45.90",
  "2026-10-01,Padaria,45.90",
  "2026-10-03,Pagamento recebido,-500.00",
  "2026-10-04,Estorno de compra,-10.00",
].join("\n");

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261005000000[-3:BRT]<TRNAMT>-25.50<FITID>abc-1<MEMO>Mercado &amp; Cia
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261006<TRNAMT>100.00<FITID>abc-2<NAME>Pix recebido
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>2026-bad<TRNAMT>-1.00<FITID>abc-3
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("CSV", () => {
  it("lê aspas, aspas escapadas, quebras de linha e ponto e vírgula", () => {
    const t = parseCsv('a;b\r\n"x;1";"diz ""oi""\nlinha 2"\r\n\r\n');
    expect(t.delimiter).toBe(";");
    expect(t.headers).toEqual(["a", "b"]);
    expect(t.rows).toEqual([{ line: 2, cells: ["x;1", 'diz "oi"\nlinha 2'] }]);
  });
});

describe("parseStatementFile", () => {
  it("reconhece o extrato da conta Nubank", () => {
    const r = parseStatementFile(bytes(NUBANK_ACCOUNT), "nubank.csv");
    if (!r.ok) throw new Error("esperava sucesso");
    expect(r.format).toBe("nubank_account_csv");
    expect(r.detectedTarget).toBe("account");
    expect(r.records[1]).toMatchObject({
      occurredOn: "2026-10-02",
      signedCents: -4590,
      externalId: "id-padaria",
      description: "Compra no débito - Padaria Pão Bom",
    });
  });

  it("reconhece a fatura do cartão Nubank e inverte o sinal", () => {
    const r = parseStatementFile(bytes(NUBANK_CARD), "fatura.csv");
    if (!r.ok) throw new Error("esperava sucesso");
    expect(r.format).toBe("nubank_card_csv");
    expect(r.records.map((x) => x.signedCents)).toEqual([-4590, -4590, 50000, 1000]);
  });

  it("lê OFX SGML, decodifica entidades e reporta linhas inválidas", () => {
    const r = parseStatementFile(bytes(OFX), "extrato.ofx");
    if (!r.ok) throw new Error("esperava sucesso");
    expect(r.format).toBe("ofx");
    expect(r.records).toHaveLength(2);
    expect(r.records[0]).toMatchObject({
      occurredOn: "2026-10-05",
      signedCents: -2550,
      externalId: "abc-1",
      description: "Mercado & Cia",
    });
    expect(r.errors).toHaveLength(1);
  });

  it("lê arquivo em Windows-1252", () => {
    const latin1 = Uint8Array.from([
      ...bytes("Data,Valor,Identificador,Descri"), 0xe7, 0xe3, ...bytes("o\n01/10/2026,-1.00,x,Caf"), 0xe9,
    ]);
    const r = parseStatementFile(latin1, "a.csv");
    if (!r.ok) throw new Error("esperava sucesso");
    expect(r.records[0].description).toBe("Café");
  });

  it("pede mapeamento para CSV desconhecido e aplica o mapeamento", () => {
    const csv = "Quando;Histórico;Quantia\n05/10/2026;Aluguel;-1.500,00\n";
    const first = parseStatementFile(bytes(csv), "banco.csv");
    expect(first).toMatchObject({ ok: false, needsMapping: true, headers: ["Quando", "Histórico", "Quantia"] });

    const mapped = parseStatementFile(bytes(csv), "banco.csv", {
      dateColumn: 0,
      descriptionColumn: 1,
      amountColumn: 2,
      idColumn: null,
      dateFormat: "dd/MM/yyyy",
      decimal: ",",
      invertSign: false,
    });
    if (!mapped.ok) throw new Error("esperava sucesso");
    expect(mapped.records[0]).toMatchObject({ occurredOn: "2026-10-05", signedCents: -150000 });
  });

  it.each([
    ["", "a.csv", "vazio"],
    ["Data,Valor,Identificador,Descrição\n", "a.csv", "cabeçalho"],
    ["qualquer coisa", "a.pdf", "não suportado"],
    ["Data,Valor,Identificador,Descrição\n99/99/2026,abc,x,y\n", "a.csv", "Nenhuma linha válida"],
  ])("rejeita arquivo inválido (%#)", (content, name, message) => {
    const r = parseStatementFile(bytes(content), name);
    expect(r.ok).toBe(false);
    if (!r.ok && !r.needsMapping) expect(r.error).toContain(message);
  });
});

describe("classificação", () => {
  const rec = (signedCents: number, description: string): RawRecord => ({
    line: 2,
    occurredOn: "2026-10-01",
    signedCents,
    description,
    externalId: null,
    rawCategory: null,
  });

  it("conta: entradas, saídas, estornos e pagamento de fatura", () => {
    expect(classify(rec(100, "Salário"), "account").action).toBe("income");
    expect(classify(rec(-100, "Mercado"), "account").action).toBe("expense");
    expect(classify(rec(100, "Estorno - Loja"), "account").action).toBe("refund");
    expect(classify(rec(-100, "Pagamento de fatura"), "account").action).toBe("invoice_payment");
  });

  it("cartão: pagamento recebido é ignorado para não duplicar com o extrato", () => {
    expect(classify(rec(-100, "Uber"), "card").action).toBe("expense");
    expect(classify(rec(500, "Pagamento recebido"), "card").action).toBe("skip");
    expect(classify(rec(10, "Estorno de compra"), "card").action).toBe("refund");
  });
});

describe("deduplicação", () => {
  const rec = (description: string, externalId: string | null = null): RawRecord => ({
    line: 2,
    occurredOn: "2026-10-01",
    signedCents: -4590,
    description,
    externalId,
    rawCategory: null,
  });

  it("mantém compras iguais no mesmo dia como transações distintas", () => {
    const keys = buildDedupeKeys([rec("Padaria"), rec("Padaria")], "card:1");
    expect(new Set(keys).size).toBe(2);
  });

  it("gera as mesmas chaves ao reimportar o mesmo arquivo", () => {
    const records = [rec("Padaria"), rec("PADARIA "), rec("Mercado")];
    expect(buildDedupeKeys(records, "card:1")).toEqual(buildDedupeKeys(records, "card:1"));
  });

  it("usa o identificador do banco quando existe", () => {
    expect(buildDedupeKeys([rec("Qualquer", "fit-9")], "acc:1")).toEqual(["ext:acc:1:fit-9"]);
  });

  it("chaves dependem da conta de destino", () => {
    expect(buildDedupeKeys([rec("Padaria")], "acc:1")).not.toEqual(buildDedupeKeys([rec("Padaria")], "acc:2"));
  });

  it("marca duplicatas já importadas e possíveis lançamentos manuais", () => {
    const records = [rec("Padaria", "a"), rec("Mercado", "b"), rec("Farmácia", "c"), rec("Repetida", "a")];
    const preview = buildPreview(
      records,
      "account",
      "acc:1",
      new Set(["ext:acc:1:a"]),
      [{ occurred_on: "2026-10-01", amount_cents: 4590, kind: "expense" }],
    );
    expect(preview.map((p) => [p.duplicate, p.possibleManualDuplicate, p.suggestedAction])).toEqual([
      [true, false, "skip"],
      [false, true, "skip"],
      // Só um lançamento manual parecido: a segunda linha igual não é marcada.
      [false, false, "expense"],
      [true, false, "skip"],
    ]);
  });
});

describe("forma de pagamento sugerida", () => {
  it.each([
    ["Transferência enviada pelo Pix - Fulano", "pix"],
    ["Compra no débito - Padaria", "debit_card"],
    ["Pagamento de boleto efetuado - Energia", "boleto"],
    ["TED enviada", "transfer"],
    ["Saque", "cash"],
    ["Mercado", null],
  ])("%s -> %s", (description, expected) => {
    expect(suggestPaymentMethod(description, "account")).toBe(expected);
  });

  it("fatura de cartão é sempre crédito", () => {
    expect(suggestPaymentMethod("Padaria", "card")).toBe("credit_card");
  });
});
