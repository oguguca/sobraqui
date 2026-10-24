import type { Tables } from "@/lib/supabase/database.types";

export type Lookups = {
  accounts: Record<string, string>;
  cards: Record<string, string>;
  categories: Record<string, { name: string; color: string; icon: string; kind: string; archived: boolean }>;
};

/** Nomes para exibição, incluindo registros arquivados (o histórico continua legível). */
export function buildLookups(data: {
  accounts: Pick<Tables<"accounts">, "id" | "name">[];
  cards: Pick<Tables<"credit_cards">, "id" | "name">[];
  categories: Tables<"categories">[];
}): Lookups {
  return {
    accounts: Object.fromEntries(data.accounts.map((a) => [a.id, a.name])),
    cards: Object.fromEntries(data.cards.map((c) => [c.id, c.name])),
    categories: Object.fromEntries(
      data.categories.map((c) => [
        c.id,
        { name: c.name, color: c.color, icon: c.icon, kind: c.kind, archived: Boolean(c.archived_at) },
      ]),
    ),
  };
}
