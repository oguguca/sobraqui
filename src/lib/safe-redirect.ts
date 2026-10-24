/** Aceita só caminhos internos, evitando redirecionamento aberto ("//site.com", "https://..."). */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
