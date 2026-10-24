import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Datas de calendário trafegam como "AAAA-MM-DD" (ISODate) e "AAAA-MM" (ISOMonth).
// Elas não têm fuso: o fuso do usuário só entra para descobrir "hoje".

export type ISODate = string;
export type ISOMonth = string;

export const DEFAULT_TIMEZONE = "America/Sao_Paulo";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

export function isISODate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function isISOMonth(value: string): boolean {
  const m = ISO_MONTH.exec(value);
  return Boolean(m && Number(m[2]) >= 1 && Number(m[2]) <= 12);
}

export function parts(date: ISODate): { year: number; month: number; day: number } {
  const m = ISO_DATE.exec(date);
  if (!m) throw new Error(`Data inválida: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function toISODate(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** "Hoje" no fuso informado. */
export function todayIn(timezone: string = DEFAULT_TIMEZONE, now: Date = new Date()): ISODate {
  // en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Soma meses mantendo o dia, limitado ao último dia do mês (31/01 + 1 = 28/02). */
export function addMonths(date: ISODate, months: number): ISODate {
  const { year, month, day } = parts(date);
  const index = year * 12 + (month - 1) + months;
  const y = Math.floor(index / 12);
  const mo = (index % 12) + 1;
  return toISODate(y, mo, Math.min(day, daysInMonth(y, mo)));
}

export function addDays(date: ISODate, days: number): ISODate {
  const { year, month, day } = parts(date);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Diferença em dias de calendário (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  const pa = parts(a);
  const pb = parts(b);
  const ta = Date.UTC(pa.year, pa.month - 1, pa.day);
  const tb = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((tb - ta) / 86_400_000);
}

export function monthOf(date: ISODate): ISOMonth {
  return date.slice(0, 7);
}

export function monthStart(month: ISOMonth): ISODate {
  return `${month}-01`;
}

export function monthEnd(month: ISOMonth): ISODate {
  const [y, m] = month.split("-").map(Number);
  return toISODate(y, m, daysInMonth(y, m));
}

export function addMonthsToMonth(month: ISOMonth, months: number): ISOMonth {
  return monthOf(addMonths(monthStart(month), months));
}

/** Meses de `from` até `to`, inclusive. */
export function monthsBetween(from: ISOMonth, to: ISOMonth): ISOMonth[] {
  const result: ISOMonth[] = [];
  for (let m = from; m <= to && result.length < 600; m = addMonthsToMonth(m, 1)) {
    result.push(m);
  }
  return result;
}

export type DateRange = { from: ISODate; to: ISODate };

export function monthRange(month: ISOMonth): DateRange {
  return { from: monthStart(month), to: monthEnd(month) };
}

/** Período imediatamente anterior com a mesma duração. */
export function previousRange(range: DateRange): DateRange {
  const { from, to } = range;
  // Mês fechado: compara com o mês anterior inteiro.
  if (from === monthStart(monthOf(from)) && to === monthEnd(monthOf(from))) {
    return monthRange(addMonthsToMonth(monthOf(from), -1));
  }
  const length = diffDays(from, to) + 1;
  return { from: addDays(from, -length), to: addDays(from, -1) };
}

export function isWithin(date: ISODate, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

function toLocalDate(date: ISODate): Date {
  const { year, month, day } = parts(date);
  return new Date(year, month - 1, day);
}

export function formatDate(date: ISODate): string {
  return format(toLocalDate(date), "dd/MM/yyyy");
}

export function formatDateShort(date: ISODate): string {
  return format(toLocalDate(date), "dd MMM", { locale: ptBR });
}

export function formatMonth(month: ISOMonth, style: "long" | "short" = "long"): string {
  const pattern = style === "long" ? "MMMM 'de' yyyy" : "MMM/yy";
  return format(toLocalDate(monthStart(month)), pattern, { locale: ptBR });
}

export function formatDateTime(iso: string, timezone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}
