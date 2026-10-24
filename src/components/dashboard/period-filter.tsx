"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addMonthsToMonth, formatDate, formatMonth, monthOf } from "@/domain/dates";

const ALL = "__all__";

/** Navegação por mês, intervalo personalizado e filtro de conta, tudo na URL. */
export function PeriodFilter({
  month,
  range,
  today,
  accounts,
  accountId,
  showAccount = true,
  allowRange = true,
}: {
  month: string | null;
  range: { from: string; to: string };
  today: string;
  accounts: { id: string; name: string }[];
  accountId: string | null;
  showAccount?: boolean;
  /** Permite escolher um intervalo de datas além do mês. */
  allowRange?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [open, setOpen] = useState(false);

  function go(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === ALL) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  const current = month ?? monthOf(range.to);
  const isCurrentMonth = month === monthOf(today);

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending} data-print-hidden>
      <div className="flex items-center rounded-lg border bg-card">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Mês anterior"
          onClick={() => go({ mes: addMonthsToMonth(current, -1), de: null, ate: null })}
        >
          <ChevronLeft />
        </Button>
        {!allowRange ? (
          <span className="min-w-40 px-3 text-center text-sm font-medium first-letter:uppercase">
            {formatMonth(current)}
          </span>
        ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="min-w-40 font-medium capitalize">
              {month ? formatMonth(month) : `${formatDate(range.from)} – ${formatDate(range.to)}`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="center">
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (from && to && from <= to) {
                  go({ de: from, ate: to, mes: null });
                  setOpen(false);
                }
              }}
            >
              <p className="text-sm font-medium">Intervalo personalizado</p>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" aria-label="De" value={from} onChange={(e) => setFrom(e.target.value)} />
                <Input type="date" aria-label="Até" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              {from > to && <p className="text-xs text-destructive">A data inicial precisa ser anterior à final.</p>}
              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    go({ mes: null, de: null, ate: null });
                    setOpen(false);
                  }}
                >
                  Mês atual
                </Button>
                <Button type="submit" size="sm" disabled={!from || !to || from > to}>
                  Aplicar
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Próximo mês"
          onClick={() => go({ mes: addMonthsToMonth(current, 1), de: null, ate: null })}
        >
          <ChevronRight />
        </Button>
      </div>
      {!isCurrentMonth && (
        <Button variant="ghost" size="sm" onClick={() => go({ mes: null, de: null, ate: null })}>
          Hoje
        </Button>
      )}
      {showAccount && accounts.length > 1 && (
        <Select value={accountId ?? ALL} onValueChange={(v) => go({ conta: v })}>
          <SelectTrigger className="w-48" aria-label="Conta">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as contas</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
