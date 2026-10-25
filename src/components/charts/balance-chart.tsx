"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatDate, formatDateShort } from "@/domain/dates";
import type { BalancePoint } from "@/domain/ledger";

import { ChartTooltipBox, compactMoney } from "./chart-tooltip";

const LINE = "var(--chart-balance)";

/** Saldo no fim de cada dia. Série única: o título do card a identifica. */
export function BalanceChart({
  data,
  height = 220,
  compact = false,
}: {
  data: BalancePoint[];
  height?: number;
  /** Sem eixos nem grade (cartões pequenos); o tooltip mostra os valores. */
  compact?: boolean;
}) {
  return (
    <div style={{ height }} role="img" aria-label="Gráfico da evolução do saldo">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={compact ? { top: 8, right: 0, bottom: 0, left: 0 } : { top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE} stopOpacity={compact ? 0.25 : 0.12} />
              <stop offset="100%" stopColor={LINE} stopOpacity={0} />
            </linearGradient>
          </defs>
          {!compact && <CartesianGrid vertical={false} stroke="var(--chart-grid)" />}
          <XAxis
            hide={compact}
            dataKey="date"
            tickFormatter={formatDateShort}
            tickLine={false}
            axisLine={false}
            fontSize={12}
            minTickGap={32}
            stroke="var(--muted-foreground)"
          />
          <YAxis
            hide={compact}
            tickFormatter={compactMoney}
            tickLine={false}
            axisLine={false}
            fontSize={12}
            width={72}
            domain={["auto", "auto"]}
            stroke="var(--muted-foreground)"
          />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as BalancePoint | undefined;
              if (!active || !point) return null;
              return <ChartTooltipBox title={formatDate(point.date)} rows={[{ label: "Saldo", cents: point.balanceCents }]} />;
            }}
          />
          <Area
            type="monotone"
            dataKey="balanceCents"
            stroke={LINE}
            strokeWidth={2}
            fill="url(#balance-fill)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
