import { Ellipsis } from "lucide-react";
import Link from "next/link";

import { CATEGORY_ICONS } from "@/components/category-icon";
import type { CategoryIconName } from "@/components/category-icon-names";
import { formatMoney, formatPercent } from "@/domain/money";

export type CategorySlice = { categoryId: string | null; name: string; color: string; icon: string | null; cents: number };

const MAX_ROWS = 6;

/**
 * Maiores categorias de gasto: cor, ícone, nome e valor, com barra relativa à
 * maior categoria (a maior enche a barra). O que está sem categoria vira um
 * atalho discreto no fim, para não competir com a lista.
 */
export function CategorySpending({ data, totalCents }: { data: CategorySlice[]; totalCents: number }) {
  const uncategorized = data.find((d) => d.categoryId === null);
  const rows = data.filter((d) => d.categoryId !== null).slice(0, MAX_ROWS);
  const max = Math.max(...rows.map((r) => r.cents), 1);

  return (
    <div className="grid gap-4">
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum gasto categorizado no período.</p>
      ) : (
        <ul className="grid gap-4">
          {rows.map((r) => {
            const Icon = r.icon ? (CATEGORY_ICONS[r.icon as CategoryIconName] ?? Ellipsis) : Ellipsis;
            return (
              <li key={r.categoryId}>
                <Link
                  href={`/transacoes?category=${r.categoryId}`}
                  className="group grid gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={`${r.name}: ${formatPercent(totalCents > 0 ? r.cents / totalCents : 0)} dos gastos`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                      <Icon className="size-4 shrink-0" style={{ color: r.color }} aria-hidden />
                      <span className="truncate text-sm font-medium group-hover:underline">{r.name}</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular">{formatMoney(r.cents)}</span>
                  </span>
                  <span className="block h-2.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${Math.max(2, (r.cents / max) * 100)}%`, backgroundColor: r.color }}
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {uncategorized && (
        <Link
          href="/transacoes?category=none"
          className="flex items-center justify-between gap-3 rounded-xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <span>
            <span className="font-medium text-foreground tabular">{formatMoney(uncategorized.cents)}</span> sem categoria
          </span>
          <span className="font-medium">Categorizar →</span>
        </Link>
      )}
    </div>
  );
}
