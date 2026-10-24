// Dinheiro é sempre um inteiro de centavos. Conversões para texto só na borda.

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, signDisplay: Intl.NumberFormatOptions["signDisplay"]) {
  const key = `${currency}:${signDisplay}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("pt-BR", { style: "currency", currency, signDisplay });
    formatters.set(key, f);
  }
  return f;
}

export function formatMoney(
  cents: number,
  options: { currency?: string; signed?: boolean } = {},
): string {
  const f = formatter(options.currency ?? "BRL", options.signed ? "exceptZero" : "auto");
  // Divisão apenas para exibição; os cálculos continuam em centavos.
  return f.format(cents / 100);
}

/** Valor para preencher um campo de formulário, ex.: 1234,56. */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const int = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}${int},${frac}`;
}

/**
 * Converte texto digitado por pessoas ("1.234,56", "R$ 10", "-5,5", "1234.56")
 * em centavos. Retorna null se o texto não for um valor válido.
 */
export function parseMoney(input: string): number | null {
  let s = input.trim().replace(/\s| /g, "").replace(/^R\$/i, "");
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/^R\$/i, "");
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let intPart: string;
  let fracPart = "";

  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    const [i, f, ...rest] = s.split(decimal);
    if (rest.length > 0) return null;
    if (!isGroupedInteger(i, thousands)) return null;
    intPart = i.split(thousands).join("");
    fracPart = f ?? "";
  } else if (lastComma >= 0) {
    const split = splitOnce(s, ",");
    if (!split) return null;
    [intPart, fracPart] = split;
  } else if (lastDot >= 0) {
    // "1.234" e "1.234.567" são milhares; "12.5" e "1234.56" são decimais.
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      intPart = s.replace(/\./g, "");
    } else {
      const parts = splitOnce(s, ".");
      if (!parts) return null;
      [intPart, fracPart] = parts;
    }
  } else {
    intPart = s;
  }

  return toCents(intPart, fracPart, negative);
}

/**
 * Converte um número decimal em texto com separador conhecido, como
 * aparece em arquivos de banco ("-1234.56"), sem passar por float.
 */
export function parseDecimal(input: string, decimal: "." | ","): number | null {
  let s = input.trim();
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  const thousands = decimal === "." ? "," : ".";
  const parts = s.split(decimal);
  if (parts.length > 2) return null;
  const [rawInt, frac = ""] = parts;
  if (!isGroupedInteger(rawInt, thousands)) return null;
  return toCents(rawInt.split(thousands).join(""), frac, negative);
}

function isGroupedInteger(value: string, thousands: string): boolean {
  if (!value.includes(thousands)) return /^\d+$/.test(value);
  const escaped = thousands === "." ? "\\." : ",";
  return new RegExp(`^\\d{1,3}(${escaped}\\d{3})+$`).test(value);
}

function splitOnce(value: string, sep: string): [string, string] | null {
  const parts = value.split(sep);
  if (parts.length !== 2) return null;
  return [parts[0], parts[1]];
}

function toCents(intPart: string, fracPart: string, negative: boolean): number | null {
  if (!/^\d*$/.test(intPart) || !/^\d{0,2}$/.test(fracPart)) return null;
  if (intPart === "" && fracPart === "") return null;
  const cents = Number(intPart || "0") * 100 + Number(fracPart.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Percentual com uma casa decimal, para exibição. */
export function formatPercent(ratio: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(ratio);
}
