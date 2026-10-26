"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRANSACTION_KIND_LABEL } from "@/domain/labels";
import { cn } from "@/lib/utils";
import type { FormOptions } from "@/server/queries/core";

const ALL = "__all__";

export function TransactionFilters({ options }: { options: FormOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  // No celular os filtros ficam recolhidos; a busca continua sempre visível.
  const [open, setOpen] = useState(false);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "" || value === ALL) next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in changes)) next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  // Busca com atraso curto para não disparar uma consulta por tecla.
  useEffect(() => {
    if (q === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => update({ q }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = ["q", "from", "to", "kind", "status", "category", "account", "card"].some((k) => params.has(k));
  const activeCount = ["from", "to", "kind", "status", "category", "account", "card", "sort"].filter((k) => params.has(k)).length;

  const select = (key: string, placeholder: string, items: { value: string; label: string }[]) => (
    <Select value={params.get(key) ?? ALL} onValueChange={(v) => update({ [key]: v })}>
      <SelectTrigger className="w-full" aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="grid gap-3" aria-busy={pending} data-print-hidden>
      <div className="grid grid-cols-[1fr_auto] gap-3 md:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar pela descrição"
            className="pl-8"
            aria-label="Buscar pela descrição"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="md:hidden"
          aria-expanded={open}
          aria-controls="transaction-filters-more"
          onClick={() => setOpen((v) => !v)}
        >
          <SlidersHorizontal /> Filtros
          {activeCount > 0 && (
            <span className="tabular rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{activeCount}</span>
          )}
        </Button>
        <div className={cn("col-span-2 grid grid-cols-2 gap-3 md:contents", !open && "max-md:hidden")}>
          <Input
            type="date"
            aria-label="De"
            value={params.get("from") ?? ""}
            onChange={(e) => update({ from: e.target.value })}
          />
          <Input type="date" aria-label="Até" value={params.get("to") ?? ""} onChange={(e) => update({ to: e.target.value })} />
        </div>
      </div>
      <div
        id="transaction-filters-more"
        className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6", !open && "max-md:hidden")}
      >
        {select(
          "kind",
          "Todos os tipos",
          Object.entries(TRANSACTION_KIND_LABEL).map(([value, label]) => ({ value, label })),
        )}
        {select("status", "Todas as situações", [
          { value: "paid", label: "Efetivadas" },
          { value: "pending", label: "Pendentes" },
        ])}
        {select(
          "category",
          "Todas as categorias",
          [{ value: "none", label: "Sem categoria" }, ...options.categories.map((c) => ({ value: c.id, label: c.name }))],
        )}
        {select(
          "account",
          "Todas as contas",
          options.accounts.map((a) => ({ value: a.id, label: a.name })),
        )}
        {select(
          "card",
          "Todos os cartões",
          options.cards.map((c) => ({ value: c.id, label: c.name })),
        )}
        <Select value={params.get("sort") ?? "date_desc"} onValueChange={(v) => update({ sort: v === "date_desc" ? null : v })}>
          <SelectTrigger className="w-full" aria-label="Ordenar">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date_desc">Mais recentes</SelectItem>
            <SelectItem value="date_asc">Mais antigas</SelectItem>
            <SelectItem value="amount_desc">Maior valor</SelectItem>
            <SelectItem value="amount_asc">Menor valor</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {hasFilters && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
          >
            <X /> Limpar filtros
          </Button>
        </div>
      )}
    </div>
  );
}
