"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm, useWatch, type Control } from "react-hook-form";

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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FREQUENCY_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_METHODS } from "@/domain/labels";
import { formatMoney, parseMoney } from "@/domain/money";
import { useServerAction } from "@/hooks/use-server-action";
import {
  transactionFormSchema,
  type TransactionFormInput,
  type TransactionFormValues,
  usesCreditCard,
} from "@/lib/transaction-schema";
import { createTransaction } from "@/server/actions/transactions";
import type { FormOptions } from "@/server/queries/core";

const NONE = "__none__";

type Mode = TransactionFormInput["mode"];

const MODE_LABEL: Record<Mode, string> = {
  expense: "Despesa",
  income: "Receita",
  transfer: "Transferência",
  refund: "Estorno",
};

export function TransactionFormDialog({
  options,
  today,
  trigger,
  defaults,
  lockMode = false,
  title = "Novo lançamento",
}: {
  options: FormOptions;
  today: string;
  trigger: React.ReactNode;
  defaults?: Partial<TransactionFormInput>;
  /** Esconde a escolha de tipo (abas Entradas e Saídas). */
  lockMode?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const { run, pending, fieldErrors } = useServerAction(createTransaction);

  const initial: TransactionFormInput = {
    mode: "expense",
    description: "",
    amount: "",
    occurredOn: today,
    categoryId: "",
    notes: "",
    source: "account",
    paymentMethod: "pix",
    accountId: options.accounts[0]?.id ?? "",
    destinationAccountId: "",
    cardId: options.cards[0]?.id ?? "",
    status: "paid",
    installments: 1,
    repeat: "none",
    ...defaults,
  };

  const form = useForm<TransactionFormInput, unknown, TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: initial,
  });
  const [mode, source, installments, amount, paymentMethod, status] = useWatch({
    control: form.control,
    name: ["mode", "source", "installments", "amount", "paymentMethod", "status"],
  });
  const usesCard = usesCreditCard({ mode, source, paymentMethod });
  const categoryKind = mode === "income" ? "income" : mode === "transfer" ? "transfer" : "expense";
  const categories = options.categories.filter((c) => c.kind === categoryKind);
  const errors = form.formState.errors;
  const err = (key: keyof TransactionFormInput) => errors[key]?.message ?? fieldErrors[key];

  const installmentCount = Number(installments) || 1;
  const amountCents = parseMoney(String(amount ?? "")) ?? 0;

  const onSubmit = form.handleSubmit(() => {
    run(form.getValues(), {
      onSuccess: () => {
        setOpen(false);
        form.reset(initial);
      },
    });
  });

  const noAccounts = options.accounts.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) form.reset(initial);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "income"
              ? "Salário, freelance, reembolsos e outros valores que entraram."
              : mode === "expense"
                ? "No crédito, a compra entra na fatura do cartão; nas outras formas, sai da conta."
                : "Transferências entre suas contas não contam como receita nem despesa."}
          </DialogDescription>
        </DialogHeader>

        {noAccounts && options.cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">Cadastre uma conta ou um cartão antes de lançar.</p>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            {!lockMode && (
            <Controller
              control={form.control}
              name="mode"
              render={({ field }) => (
                <Tabs
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    form.setValue("categoryId", "");
                    if (v !== "expense") form.setValue("installments", 1);
                    if (v === "transfer" || v === "income") form.setValue("source", "account");
                  }}
                >
                  <TabsList className="grid w-full grid-cols-4">
                    {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
                      <TabsTrigger key={m} value={m}>
                        {MODE_LABEL[m]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}
            />
            )}

            <FormField id="tx-description" label="Descrição" error={err("description")}>
              <Input
                id="tx-description"
                placeholder={mode === "income" ? "Ex.: Salário, freelance" : "Ex.: Mercado"} autoComplete="off" {...form.register("description")} />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="tx-amount" label={installmentCount > 1 ? "Valor total (R$)" : "Valor (R$)"} error={err("amount")}>
                <Input id="tx-amount" inputMode="decimal" placeholder="0,00" className="tabular" {...form.register("amount")} />
              </FormField>
              <FormField
                id="tx-date"
                label={usesCard ? "Data da compra" : status === "pending" ? "Vencimento" : "Data"}
                error={err("occurredOn")}
              >
                <Input id="tx-date" type="date" {...form.register("occurredOn")} />
              </FormField>
            </div>

            {mode === "expense" && (
              <FormField
                id="tx-method"
                label="Forma de pagamento"
                error={err("paymentMethod")}
                hint={
                  paymentMethod === "credit_card" && options.cards.length === 0
                    ? "Cadastre um cartão em Cartões para lançar no crédito."
                    : paymentMethod === "boleto"
                      ? "Boleto ainda não pago? Marque a situação como “A pagar” e use a data do vencimento."
                      : undefined
                }
              >
                <Controller
                  control={form.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        if (v === "credit_card") {
                          form.setValue("repeat", "none");
                          form.setValue("status", "paid");
                        } else {
                          form.setValue("installments", 1);
                        }
                        if (v === "boleto") form.setValue("status", "pending");
                      }}
                    >
                      <SelectTrigger id="tx-method" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem
                            key={m}
                            value={m}
                            disabled={(m === "credit_card" && options.cards.length === 0) || (m !== "credit_card" && noAccounts)}
                          >
                            {PAYMENT_METHOD_LABEL[m]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            )}

            {mode === "refund" && options.cards.length > 0 && (
              <FormField id="tx-source" label="Pago com">
                <Controller
                  control={form.control}
                  name="source"
                  render={({ field }) => (
                    <Tabs
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v);
                        if (v === "account") form.setValue("installments", 1);
                        else form.setValue("repeat", "none");
                      }}
                    >
                      <TabsList id="tx-source" className="grid w-full grid-cols-2">
                        <TabsTrigger value="account" disabled={noAccounts}>
                          Conta
                        </TabsTrigger>
                        <TabsTrigger value="card">Cartão de crédito</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  )}
                />
              </FormField>
            )}

            {usesCard ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  id="tx-card"
                  label="Cartão"
                  control={form.control}
                  name="cardId"
                  error={err("cardId")}
                  items={options.cards.map((c) => ({ value: c.id, label: c.name }))}
                />
                {mode === "expense" && (
                  <FormField
                    id="tx-installments"
                    label="Parcelas"
                    error={err("installments")}
                    hint={
                      installmentCount > 1 && amountCents >= installmentCount
                        ? `${installmentCount}× de ${formatMoney(Math.floor(amountCents / installmentCount))}`
                        : undefined
                    }
                  >
                    <Input
                      id="tx-installments"
                      type="number"
                      min={1}
                      max={72}
                      {...form.register("installments")}
                    />
                  </FormField>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField
                  id="tx-account"
                  label={mode === "transfer" ? "De" : "Conta"}
                  control={form.control}
                  name="accountId"
                  error={err("accountId")}
                  items={options.accounts.map((a) => ({ value: a.id, label: a.name }))}
                />
                {mode === "transfer" ? (
                  <SelectField
                    id="tx-destination"
                    label="Para"
                    control={form.control}
                    name="destinationAccountId"
                    error={err("destinationAccountId")}
                    items={options.accounts.map((a) => ({ value: a.id, label: a.name }))}
                  />
                ) : (
                  <SelectField
                    id="tx-status"
                    label="Situação"
                    control={form.control}
                    name="status"
                    items={[
                      { value: "paid", label: mode === "income" ? "Recebido" : "Pago" },
                      { value: "pending", label: mode === "income" ? "A receber" : "A pagar" },
                    ]}
                  />
                )}
              </div>
            )}

            {mode !== "transfer" && (
              <SelectField
                id="tx-category"
                label="Categoria"
                control={form.control}
                name="categoryId"
                error={err("categoryId")}
                allowNone="Sem categoria"
                items={categories.map((c) => ({ value: c.id, label: c.name }))}
              />
            )}

            {(mode === "expense" || mode === "income") && !usesCard && (
              <SelectField
                id="tx-repeat"
                label="Repetir"
                control={form.control}
                name="repeat"
                error={err("repeat")}
                items={[
                  { value: "none", label: "Não repetir" },
                  ...(["monthly", "weekly", "yearly"] as const).map((f) => ({ value: f, label: FREQUENCY_LABEL[f] })),
                ]}
              />
            )}

            <FormField id="tx-notes" label="Observações" error={err("notes")}>
              <Textarea id="tx-notes" rows={2} placeholder="Opcional" {...form.register("notes")} />
            </FormField>

            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando…" : "Salvar lançamento"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

type FieldName = "cardId" | "accountId" | "destinationAccountId" | "status" | "categoryId" | "repeat";

function SelectField({
  id,
  label,
  control,
  name,
  items,
  error,
  allowNone,
}: {
  id: string;
  label: string;
  control: Control<TransactionFormInput, unknown, TransactionFormValues>;
  name: FieldName;
  items: { value: string; label: string }[];
  error?: string;
  allowNone?: string;
}) {
  return (
    <FormField id={id} label={label} error={error}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select
            value={(field.value as string | null | undefined) || (allowNone ? NONE : "")}
            onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
          >
            <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error) || undefined}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {allowNone && <SelectItem value={NONE}>{allowNone}</SelectItem>}
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </FormField>
  );
}
