import { ArrowUpRight, Nfc } from "lucide-react";
import Link from "next/link";

import { formatDate } from "@/domain/dates";
import { formatMoney } from "@/domain/money";

/** Cartão de crédito em destaque: fatura a pagar, vencimento e limite disponível. */
export function CreditCardVisual({
  cardId,
  name,
  brand,
  billCents,
  dueDate,
  overdue,
  availableCents,
  limitCents,
}: {
  cardId: string;
  name: string;
  brand: string | null;
  billCents: number;
  dueDate: string | null;
  overdue: boolean;
  availableCents: number;
  limitCents: number;
}) {
  const usedRatio = limitCents > 0 ? Math.min(1, Math.max(0, (limitCents - availableCents) / limitCents)) : 0;
  return (
    <Link
      href={`/cartoes/${cardId}`}
      className="group relative block overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-[#3b1f57] via-[#2b1640] to-[#1f0f30] p-5 text-white shadow-lg shadow-[#2b1640]/25 ring-1 ring-white/10 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Brilho decorativo, como num cartão físico. */}
      <span aria-hidden className="absolute -top-16 -right-10 size-48 rounded-full bg-[#9b7bea]/25 blur-2xl" />
      {/* O ponto que sobra, em lima, como no guia da marca. */}
      <span aria-hidden className="absolute top-[4.6rem] right-6 size-8 rounded-full bg-[#c8f04a]" />
      <div className="relative flex items-start justify-between">
        <span className="text-sm font-semibold tracking-wide uppercase">{brand ?? "Cartão"}</span>
        <Nfc className="size-5 opacity-80" aria-hidden />
      </div>
      <p className="relative mt-5 text-xs text-white/70">Fatura a pagar</p>
      <p className="relative mt-0.5 text-3xl font-semibold tracking-tight tabular">{formatMoney(billCents)}</p>
      <div className="relative mt-4 h-1.5 overflow-hidden rounded-full bg-white/20" aria-hidden>
        <div className="h-full rounded-full bg-[#c8f04a]" style={{ width: `${usedRatio * 100}%` }} />
      </div>
      <div className="relative mt-3 flex items-end justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-white/80">{name}</span>
        <span className="shrink-0 text-right">
          <span className="block text-white/70">{overdue ? "Venceu" : "Vence"}</span>
          <span className="font-medium tabular">{dueDate ? formatDate(dueDate) : "—"}</span>
        </span>
      </div>
      <p className="relative mt-3 text-xs text-white/80">
        Disponível <span className="font-medium text-white tabular">{formatMoney(availableCents)}</span> de{" "}
        {formatMoney(limitCents)}
      </p>
      <ArrowUpRight
        aria-hidden
        className="absolute right-4 bottom-4 size-4 opacity-0 transition-opacity group-hover:opacity-80"
      />
    </Link>
  );
}
