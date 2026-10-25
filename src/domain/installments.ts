import { formatMoney, formatPercent } from "./money";

/**
 * Como o usuário informa o parcelamento no cartão:
 * - none: sem juros, o total é o valor à vista;
 * - installment: informa o valor de cada parcela (o total é parcela × quantidade);
 * - total: informa o total já com juros.
 */
export type InterestMode = "none" | "installment" | "total";

/** Total que vai para as faturas. Sem valor informado, fica o valor à vista. */
export function financedTotal(cashCents: number, count: number, mode: InterestMode, informedCents: number | null): number {
  if (mode === "none" || informedCents === null) return cashCents;
  return mode === "installment" ? informedCents * count : informedCents;
}

/**
 * Taxa mensal equivalente pela tabela Price: resolve
 * à vista = parcela × (1 − (1 + i)^−n) / i. Sem juros (ou com desconto), null.
 */
export function monthlyInterestRate(cashCents: number, totalCents: number, count: number): number | null {
  if (count < 2 || cashCents <= 0 || totalCents <= cashCents) return null;
  const payment = totalCents / count;
  const presentValue = (i: number) => (payment * (1 - (1 + i) ** -count)) / i;
  // presentValue cai conforme a taxa sobe: busca binária entre ~0 e 100% ao mês.
  let low = 1e-9;
  let high = 1;
  for (let step = 0; step < 80; step++) {
    const mid = (low + high) / 2;
    if (presentValue(mid) > cashCents) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function interestSummary(cashCents: number, totalCents: number, count: number) {
  return {
    interestCents: totalCents - cashCents,
    totalRate: cashCents > 0 ? (totalCents - cashCents) / cashCents : 0,
    monthlyRate: monthlyInterestRate(cashCents, totalCents, count),
  };
}

/** Texto guardado nas observações da compra parcelada com juros. */
export function interestNote(cashCents: number, totalCents: number, count: number): string {
  const s = interestSummary(cashCents, totalCents, count);
  const monthly = s.monthlyRate === null ? "" : `, ≈${formatPercent(s.monthlyRate)} a.m.`;
  return (
    `Parcelado em ${count}× com juros: à vista ${formatMoney(cashCents)}, total ${formatMoney(totalCents)}, ` +
    `juros ${formatMoney(s.interestCents)} (${formatPercent(s.totalRate)} no total${monthly}).`
  );
}
