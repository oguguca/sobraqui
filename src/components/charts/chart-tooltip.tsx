"use client";

import { formatMoney } from "@/domain/money";

export type TooltipRow = { label: string; cents: number; color?: string };

/** Tooltip padrão dos gráficos: título e linhas com amostra de cor + valor em texto neutro. */
export function ChartTooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1.5 font-medium">{title}</p>
      <div className="grid gap-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {row.color && <span className="size-2 rounded-[2px]" style={{ backgroundColor: row.color }} />}
              {row.label}
            </span>
            <span className="tabular font-medium">{formatMoney(row.cents)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export { compactMoney } from "@/domain/money";

export function ChartLegend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: item.color }} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
