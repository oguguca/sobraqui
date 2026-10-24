"use client";

import { Printer } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FormOptions } from "@/server/queries/core";

const ALL = "__all__";

export function ReportFilters({ options, from, to }: { options: FormOptions; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  const select = (key: string, label: string, items: { id: string; name: string }[]) => (
    <Select value={params.get(key) ?? ALL} onValueChange={(v) => set(key, v)}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}</SelectItem>
        {items.map((i) => (
          <SelectItem key={i.id} value={i.id}>
            {i.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-busy={pending} data-print-hidden>
      <Input type="date" aria-label="De" defaultValue={from} onChange={(e) => e.target.value && set("de", e.target.value)} />
      <Input type="date" aria-label="Até" defaultValue={to} onChange={(e) => e.target.value && set("ate", e.target.value)} />
      {select("conta", "Todas as contas", options.accounts)}
      {select("cartao", "Todos os cartões", options.cards)}
      {select(
        "categoria",
        "Todas as categorias",
        options.categories.filter((c) => c.kind !== "transfer"),
      )}
      <Button variant="outline" onClick={() => window.print()}>
        <Printer /> Imprimir / PDF
      </Button>
    </div>
  );
}
