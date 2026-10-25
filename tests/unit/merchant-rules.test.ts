import { describe, expect, it } from "vitest";

import { categoryFromDescription } from "@/domain/import/merchant-rules";

describe("categoria pela descrição", () => {
  it.each([
    ["Transferência enviada pelo Pix|KEETA DELIVERY", "Alimentação"],
    ["IFOOD *RESTAURANTE", "Alimentação"],
    ["UBER DO BRASIL TECNOLOGIA LTDA.", "Transporte"],
    ["Shopee *Zupax", "Compras"],
    ["Mlp*Netshoes-Ff Com Es 2/5", "Compras"],
    ["Spotify", "Assinaturas"],
    ["Drogasil 123", "Saúde"],
    ["IOF de compra internacional", "Juros e tarifas"],
    ["Saldo em rotativo", "Juros e tarifas"],
    ["Transferência enviada|Maria Silva", "Pix para pessoas"],
    ["Transferência enviada|BPLACE COMERCIAL", null],
    ["Algo desconhecido", null],
  ])("%s -> %s", (description, expected) => {
    expect(categoryFromDescription(description)).toBe(expected);
  });
});
