"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatMonth } from "@/domain/dates";
import type { MonthlyTotals } from "@/domain/ledger";

import { ChartLegend, ChartTooltipBox, compactMoney } from "./chart-tooltip";

const INCOME = "var(--chart-income)";
const EXPENSE = "var(--chart-expense)";

/** Receitas x despesas por mês: colunas lado a lado, um eixo só. */
export function IncomeExpenseChart({ data, height = 260 }: { data: MonthlyTotals[]; height?: number }) {
  const rows = data.map((d) => ({ ...d, label: formatMonth(d.month, "short") }));
  return (
    <div className="grid gap-3">
      <ChartLegend
        items={[
          { label: "Receitas", color: INCOME },
          { label: "Despesas", color: EXPENSE },
        ]}
      />
      <div style={{ height }} role="img" aria-label="Gráfico de receitas e despesas por mês">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
            <YAxis
              tickFormatter={compactMoney}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              width={72}
              stroke="var(--muted-foreground)"
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                if (!active || !row) return null;
                return (
                  <ChartTooltipBox
                    title={formatMonth(row.month)}
                    rows={[
                      { label: "Receitas", cents: row.incomeCents, color: INCOME },
                      { label: "Despesas", cents: row.expenseCents, color: EXPENSE },
                      { label: "Resultado", cents: row.resultCents },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="incomeCents" name="Receitas" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="expenseCents" name="Despesas" fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
