import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { Money } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { formatPercent } from "@/domain/money";
import { cn } from "@/lib/utils";

/**
 * Indicador com variação em relação ao período anterior.
 * `upIsGood` decide a cor: receita subir é bom, despesa subir é ruim.
 */
export function StatCard({
  label,
  cents,
  change,
  upIsGood,
  tone,
  hint,
}: {
  label: string;
  cents: number;
  change: number | null;
  upIsGood: boolean;
  tone?: "auto" | "positive" | "negative";
  hint?: string;
}) {
  const direction = change === null || Math.abs(change) < 0.0005 ? "flat" : change > 0 ? "up" : "down";
  const good = direction === "flat" ? null : (direction === "up") === upIsGood;
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  return (
    <Card className="gap-0">
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <Money cents={cents} tone={tone} className="mt-1.5 block text-2xl font-semibold tracking-tight" />
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          {change === null ? (
            <span>{hint ?? "Sem base de comparação"}</span>
          ) : (
            <>
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium tabular",
                  good === true && "bg-positive-soft text-positive",
                  good === false && "bg-negative-soft text-negative",
                  good === null && "bg-muted",
                )}
              >
                <Icon className="size-3" aria-hidden />
                {formatPercent(Math.abs(change))}
              </span>
              <span>vs. período anterior</span>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
