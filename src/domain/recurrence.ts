import type { ISODate } from "./dates";
import { addDays, addMonths, parts } from "./dates";

export type Frequency = "weekly" | "monthly" | "yearly";

export function nextOccurrence(date: ISODate, frequency: Frequency, anchorDay: number): ISODate {
  if (frequency === "weekly") return addDays(date, 7);
  const next = addMonths(date, frequency === "monthly" ? 1 : 12);
  // Mantém o dia original (ex.: 31) quando o mês seguinte permite.
  const { year, month } = parts(next);
  const max = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${next.slice(0, 8)}${String(Math.min(anchorDay, max)).padStart(2, "0")}`;
}

/**
 * Ocorrências de `next` até `until` (inclusive), respeitando `endOn`.
 * Retorna as datas e a próxima ocorrência ainda não gerada.
 */
export function occurrencesUntil(
  rule: { start_on: ISODate; next_occurrence_on: ISODate; end_on: ISODate | null; frequency: Frequency },
  until: ISODate,
  limit = 120,
): { dates: ISODate[]; next: ISODate } {
  const anchorDay = parts(rule.start_on).day;
  const dates: ISODate[] = [];
  let current = rule.next_occurrence_on;
  while (current <= until && (rule.end_on === null || current <= rule.end_on) && dates.length < limit) {
    dates.push(current);
    current = nextOccurrence(current, rule.frequency, anchorDay);
  }
  return { dates, next: current };
}
