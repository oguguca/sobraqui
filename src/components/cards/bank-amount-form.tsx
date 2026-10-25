"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { centsToInput } from "@/domain/money";
import { useServerAction } from "@/hooks/use-server-action";
import { setInvoiceBankAmount } from "@/server/actions/cards";

/** Valor da fatura no app do banco; a diferença vira ajuste de juros/encargos. */
export function BankAmountForm({ invoiceId, bankAmountCents }: { invoiceId: string; bankAmountCents: number | null }) {
  const [value, setValue] = useState(bankAmountCents === null ? "" : centsToInput(bankAmountCents));
  const { run, pending, fieldErrors } = useServerAction(setInvoiceBankAmount);

  return (
    <form
      className="grid gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        run({ invoiceId, amount: value.trim() });
      }}
    >
      <label htmlFor={`bank-amount-${invoiceId}`} className="text-sm font-medium">
        Valor no app do banco
      </label>
      <div className="flex max-w-xs gap-2">
        <Input
          id={`bank-amount-${invoiceId}`}
          inputMode="decimal"
          placeholder="Ex.: 769,95"
          className="tabular"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" variant="outline" disabled={pending} aria-label="Salvar valor do banco">
          <Check />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {fieldErrors.amount ??
          "Opcional. A diferença vira “juros e encargos (ajuste)” e é recalculada quando você importa a fatura. Deixe vazio para remover."}
      </p>
    </form>
  );
}
