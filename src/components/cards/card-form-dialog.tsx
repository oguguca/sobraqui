"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { ColorPicker } from "@/components/color-picker";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { centsToInput } from "@/domain/money";
import { useServerAction } from "@/hooks/use-server-action";
import { cardSchema, type CardInput, type CardValues } from "@/lib/schemas";
import type { Tables } from "@/lib/supabase/database.types";
import { createCard, updateCard } from "@/server/actions/cards";

const NONE = "__none__";

export function CardFormDialog({
  card,
  accounts,
  trigger,
}: {
  card?: Tables<"credit_cards">;
  accounts: { id: string; name: string }[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const create = useServerAction(createCard);
  const update = useServerAction(updateCard);
  const pending = create.pending || update.pending;
  const serverErrors = card ? update.fieldErrors : create.fieldErrors;

  const defaults: CardInput = {
    name: card?.name ?? "",
    brand: card?.brand ?? "",
    limit: card ? centsToInput(card.limit_cents) : "",
    closingDay: card?.closing_day ?? 1,
    dueDay: card?.due_day ?? 8,
    paymentAccountId: card?.payment_account_id ?? "",
    color: card?.color ?? "#8b5cf6",
  };
  const form = useForm<CardInput, unknown, CardValues>({ resolver: zodResolver(cardSchema), defaultValues: defaults });
  const err = (key: keyof CardInput) => form.formState.errors[key]?.message ?? serverErrors[key];

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues();
    const done = () => setOpen(false);
    if (card) update.run({ ...values, id: card.id }, { onSuccess: done });
    else create.run(values, { onSuccess: done });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{card ? "Editar cartão" : "Novo cartão"}</DialogTitle>
          <DialogDescription>
            Compras no dia do fechamento ou depois entram na fatura seguinte.
            {card && " Mudanças de dia valem para faturas ainda não criadas."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="card-name" label="Nome" error={err("name")}>
              <Input id="card-name" placeholder="Ex.: Nubank" {...form.register("name")} />
            </FormField>
            <FormField id="card-brand" label="Bandeira" error={err("brand")}>
              <Input id="card-brand" placeholder="Opcional" {...form.register("brand")} />
            </FormField>
          </div>
          <FormField id="card-limit" label="Limite total (R$)" error={err("limit")}>
            <Input id="card-limit" inputMode="decimal" className="tabular" {...form.register("limit")} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="card-closing" label="Dia do fechamento" error={err("closingDay")}>
              <Input id="card-closing" type="number" min={1} max={31} {...form.register("closingDay")} />
            </FormField>
            <FormField id="card-due" label="Dia do vencimento" error={err("dueDay")}>
              <Input id="card-due" type="number" min={1} max={31} {...form.register("dueDay")} />
            </FormField>
          </div>
          <FormField id="card-account" label="Conta usada para pagar" hint="Sugerida ao pagar a fatura.">
            <Controller
              control={form.control}
              name="paymentAccountId"
              render={({ field }) => (
                <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                  <SelectTrigger id="card-account" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhuma</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField id="card-color" label="Cor">
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => <ColorPicker id="card-color" value={field.value} onChange={field.onChange} />}
            />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
