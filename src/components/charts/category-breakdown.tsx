"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { formatMoney, formatPercent } from "@/domain/money";

import { ChartTooltipBox } from "./chart-tooltip";

export type CategorySlice = { categoryId: string | null; name: string; color: string; cents: number };

const MAX_SLICES = 6;

/** Rosca + lista. A lista é a legenda e a tabela; a cor de cada fatia é a da própria categoria. */
export function CategoryBreakdown({ data }: { data: CategorySlice[] }) {
  const total = data.reduce((s, d) => s + d.cents, 0);
  const top = data.slice(0, MAX_SLICES);
  const rest = data.slice(MAX_SLICES).reduce((s, d) => s + d.cents, 0);
  const slices = rest > 0 ? [...top, { categoryId: "__other__", name: "Outras", color: "#94a3b8", cents: rest }] : top;

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[180px_1fr]">
      <div className="mx-auto size-[180px]" role="img" aria-label="Gráfico de despesas por categoria">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="cents"
              nameKey="name"
              innerRadius={58}
              outerRadius={86}
              paddingAngle={slices.length > 1 ? 1.5 : 0}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.categoryId ?? "none"} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const s = payload?.[0]?.payload as CategorySlice | undefined;
                if (!active || !s) return null;
                return (
                  <ChartTooltipBox
                    title={`${s.name} · ${formatPercent(total > 0 ? s.cents / total : 0)}`}
                    rows={[{ label: "Gasto", cents: s.cents, color: s.color }]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid gap-2.5 text-sm">
        {slices.map((s) => {
          const share = total > 0 ? s.cents / total : 0;
          return (
            <li key={s.categoryId ?? "none"} className="grid gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: s.color }} aria-hidden />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="tabular text-xs text-muted-foreground">{formatPercent(share)}</span>
                  <span className="tabular font-medium">{formatMoney(s.cents)}</span>
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${share * 100}%`, backgroundColor: s.color }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
