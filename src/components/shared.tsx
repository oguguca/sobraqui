import type { LucideIcon } from "lucide-react";

import { MoneyCountUp } from "@/components/motion/money-count-up";
import { formatMoney } from "@/domain/money";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2" data-print-hidden>
          {actions}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

type Tone = "auto" | "positive" | "negative" | "neutral";

/** Valor em reais. `tone="auto"` pinta pelo sinal; `animate` conta até o valor ao abrir. */
export function Money({
  cents,
  tone = "neutral",
  signed = false,
  animate = false,
  className,
}: {
  cents: number;
  tone?: Tone;
  signed?: boolean;
  animate?: boolean;
  className?: string;
}) {
  const resolved = tone === "auto" ? (cents > 0 ? "positive" : cents < 0 ? "negative" : "neutral") : tone;
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        resolved === "positive" && "text-positive",
        resolved === "negative" && "text-negative",
        className,
      )}
    >
      {animate ? <MoneyCountUp cents={cents} signed={signed} /> : formatMoney(cents, { signed })}
    </span>
  );
}

export function ColorDot({ color, className }: { color: string | null; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color ?? "var(--muted-foreground)" }}
    />
  );
}
