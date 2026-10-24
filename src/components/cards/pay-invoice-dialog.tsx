"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

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
import { centsToInput, formatMoney } from "@/domain/money";
import { useServerAction } from "@/hooks/use-server-action";
import { invoicePaymentSchema, type InvoicePaymentInput, type InvoicePaymentValues } from "@/lib/schemas";
import { payInvoice } from "@/server/actions/cards";

export function PayInvoiceDialog({
  invoiceId,
  remainingCents,
  accounts,
  defaultAccountId,
  today,
  trigger,
}: {
  invoiceId: string;
  remainingCents: number;
  accounts: { id: string; name: string }[];
  defaultAccountId: string | null;
  today: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { run, pending, fieldErrors } = useServerAction(payInvoice);
  const defaults: InvoicePaymentInput = {
    invoiceId,
    accountId: defaultAccountId ?? accounts[0]?.id ?? "",
    amount: centsToInput(remainingCents),
    paidOn: today,
  };
  const form = useForm<InvoicePaymentInput, unknown, InvoicePaymentValues>({
    resolver: zodResolver(invoicePaymentSchema),
    defaultValues: defaults,
  });
  const err = (key: keyof InvoicePaymentInput) => form.formState.errors[key]?.message ?? fieldErrors[key];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(defaults);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pagar fatura</DialogTitle>
          <DialogDescription>
            Em aberto: {formatMoney(remainingCents)}. O pagamento sai da conta e não conta como despesa — as compras já
            foram contadas.
          </DialogDescription>
        </DialogHeader>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Cadastre uma conta para registrar o pagamento.</p>
        ) : (
          <form
            className="grid gap-4"
            noValidate
            onSubmit={form.handleSubmit(() => run(form.getValues(), { onSuccess: () => setOpen(false) }))}
          >
            <FormField id="pay-account" label="Conta" error={err("accountId")}>
              <Controller
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="pay-account" className="w-full">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
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
            <div className="grid grid-cols-2 gap-4">
              <FormField id="pay-amount" label="Valor (R$)" error={err("amount")}>
                <Input id="pay-amount" inputMode="decimal" className="tabular" {...form.register("amount")} />
              </FormField>
              <FormField id="pay-date" label="Data" error={err("paidOn")}>
                <Input id="pay-date" type="date" {...form.register("paidOn")} />
              </FormField>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Registrando…" : "Registrar pagamento"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
