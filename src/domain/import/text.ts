/** Decodifica o arquivo como UTF-8 e cai para Windows-1252 (comum em OFX de bancos). */
export function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.replace(/^﻿/, "");
}

/** Minúsculas, sem acentos e espaços repetidos. Usado em cabeçalhos e deduplicação. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Descrição limpa para exibição e gravação. */
export function cleanDescription(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 200);
}
