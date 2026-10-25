"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { centsToInput, formatMoney, parseMoney } from "@/domain/money";
import { useServerAction } from "@/hooks/use-server-action";
import {
  invoicePaymentSchema,
  type InvoicePaymentInput,
  type InvoicePaymentValues,
} from "@/lib/schemas";
import { payInvoice } from "@/server/actions/cards";

/**
 * Pagamento de fatura. "pay" já vem com o total em aberto; "reduce" abate só
 * uma parte (antecipar pagamento ou parcelas), e mostra quanto continua em aberto.
 */
export function PayInvoiceDialog({
  invoiceId,
  remainingCents,
  accounts,
  defaultAccountId,
  today,
  trigger,
  variant = "pay",
}: {
  invoiceId: string;
  remainingCents: number;
  accounts: { id: string; name: string }[];
  defaultAccountId: string | null;
  today: string;
  trigger: React.ReactNode;
  variant?: "pay" | "reduce";
}) {
  const [open, setOpen] = useState(false);
  const { run, pending, fieldErrors } = useServerAction(payInvoice);
  const reduce = variant === "reduce";
  const defaults: InvoicePaymentInput = {
    invoiceId,
    source: accounts.length === 0 ? "external" : "account",
    accountId: defaultAccountId ?? accounts[0]?.id ?? "",
    origin: "",
    amount: reduce ? "" : centsToInput(remainingCents),
    paidOn: today,
  };
  const form = useForm<InvoicePaymentInput, unknown, InvoicePaymentValues>({
    resolver: zodResolver(invoicePaymentSchema),
    defaultValues: defaults,
  });
  const [amount, source] = useWatch({
    control: form.control,
    name: ["amount", "source"],
  });
  const external = source === "external";
  const amountCents = parseMoney(String(amount ?? ""));
  const left =
    amountCents !== null && amountCents > 0
      ? remainingCents - amountCents
      : null;
  const err = (key: keyof InvoicePaymentInput) =>
    form.formState.errors[key]?.message ?? fieldErrors[key];

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
          <DialogTitle>
            {reduce ? "Abater da fatura" : "Pagar fatura"}
          </DialogTitle>
          <DialogDescription>
            Em aberto: {formatMoney(remainingCents)}.{" "}
            {reduce
              ? "Pague uma parte agora: diminui o saldo da fatura e libera limite."
              : "O pagamento não conta como despesa — as compras já foram contadas."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit(() =>
            run(form.getValues(), { onSuccess: () => setOpen(false) }),
          )}
        >
          <FormField id="pay-source" label="Origem do dinheiro">
            <Controller
              control={form.control}
              name="source"
              render={({ field }) => (
                <Tabs value={field.value} onValueChange={field.onChange}>
                  <TabsList id="pay-source" className="grid w-full grid-cols-2">
                    <TabsTrigger
                      value="account"
                      disabled={accounts.length === 0}
                    >
                      Saldo de uma conta
                    </TabsTrigger>
                    <TabsTrigger value="external">Outro dinheiro</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            />
          </FormField>
          {external ? (
            <FormField
              id="pay-origin"
              label="De onde veio (opcional)"
              error={err("origin")}
              hint="Dinheiro vivo, cashback, alguém pagou por você… Não mexe no saldo das suas contas."
            >
              <Input
                id="pay-origin"
                placeholder="Ex.: dinheiro vivo"
                autoComplete="off"
                {...form.register("origin")}
              />
            </FormField>
          ) : (
            <FormField
              id="pay-account"
              label="Conta"
              error={err("accountId")}
              hint="O valor sai do saldo desta conta."
            >
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
          )}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              id="pay-amount"
              label={reduce ? "Valor a abater (R$)" : "Valor (R$)"}
              error={err("amount")}
            >
              <Input
                id="pay-amount"
                inputMode="decimal"
                placeholder="0,00"
                className="tabular"
                autoFocus={reduce}
                {...form.register("amount")}
              />
            </FormField>
            <FormField id="pay-date" label="Data" error={err("paidOn")}>
              <Input id="pay-date" type="date" {...form.register("paidOn")} />
            </FormField>
          </div>
          {left !== null && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {left < 0 ? (
                <span className="text-negative">
                  O valor passa do saldo em aberto.
                </span>
              ) : left === 0 ? (
                "A fatura fica quitada."
              ) : (
                <>
                  Continua em aberto:{" "}
                  <span className="font-medium text-foreground tabular">
                    {formatMoney(left)}
                  </span>
                </>
              )}
            </p>
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={pending || (left !== null && left < 0)}
            >
              {pending
                ? "Registrando…"
                : reduce
                  ? "Abater"
                  : "Registrar pagamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
