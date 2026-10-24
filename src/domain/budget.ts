export type BudgetLevel = "ok" | "warning" | "exceeded";

/** A partir de quanto do limite o orçamento entra em alerta. */
export const BUDGET_WARNING_RATIO = 0.8;

export type BudgetUsage = {
  limitCents: number;
  spentCents: number;
  remainingCents: number;
  ratio: number;
  level: BudgetLevel;
};

export function budgetUsage(limitCents: number, spentCents: number): BudgetUsage {
  const spent = Math.max(0, spentCents);
  const ratio = limitCents > 0 ? spent / limitCents : 0;
  const level: BudgetLevel =
    spent > limitCents ? "exceeded" : ratio >= BUDGET_WARNING_RATIO ? "warning" : "ok";
  return {
    limitCents,
    spentCents: spent,
    remainingCents: limitCents - spent,
    ratio,
    level,
  };
}

/** Progresso de uma meta, de 0 a 1. */
export function goalProgress(savedCents: number, targetCents: number): number {
  if (targetCents <= 0) return 0;
  return Math.min(1, Math.max(0, savedCents / targetCents));
}

/** Quanto guardar por mês para cumprir a meta no prazo. null sem prazo ou já cumprida. */
export function monthlyContributionNeeded(
  savedCents: number,
  targetCents: number,
  monthsLeft: number | null,
): number | null {
  const missing = targetCents - savedCents;
  if (missing <= 0 || monthsLeft === null) return null;
  return Math.ceil(missing / Math.max(1, monthsLeft));
}
