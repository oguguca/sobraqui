import { describe, expect, it } from "vitest";

import { budgetUsage, goalProgress, monthlyContributionNeeded } from "@/domain/budget";
import { occurrencesUntil } from "@/domain/recurrence";

describe("orçamento", () => {
  it("classifica o uso do limite", () => {
    expect(budgetUsage(10000, 5000).level).toBe("ok");
    expect(budgetUsage(10000, 8000).level).toBe("warning");
    expect(budgetUsage(10000, 10000).level).toBe("warning");
    expect(budgetUsage(10000, 10001).level).toBe("exceeded");
    expect(budgetUsage(10000, 12000).remainingCents).toBe(-2000);
  });
});

describe("metas", () => {
  it("calcula progresso e aporte mensal", () => {
    expect(goalProgress(2500, 10000)).toBe(0.25);
    expect(goalProgress(20000, 10000)).toBe(1);
    expect(monthlyContributionNeeded(2500, 10000, 3)).toBe(2500);
    expect(monthlyContributionNeeded(10000, 10000, 3)).toBeNull();
    expect(monthlyContributionNeeded(0, 10000, null)).toBeNull();
  });
});

describe("recorrência", () => {
  it("gera ocorrências mensais mantendo o dia original", () => {
    const { dates, next } = occurrencesUntil(
      { start_on: "2026-01-31", next_occurrence_on: "2026-01-31", end_on: null, frequency: "monthly" },
      "2026-04-30",
    );
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(next).toBe("2026-05-31");
  });

  it("respeita a data final", () => {
    const { dates } = occurrencesUntil(
      { start_on: "2026-10-01", next_occurrence_on: "2026-10-01", end_on: "2026-10-15", frequency: "weekly" },
      "2026-12-31",
    );
    expect(dates).toEqual(["2026-10-01", "2026-10-08", "2026-10-15"]);
  });
});
