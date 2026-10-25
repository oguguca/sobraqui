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
import { ACCOUNT_TYPE_LABEL } from "@/domain/labels";
import { centsToInput } from "@/domain/money";
import { useServerAction } from "@/hooks/use-server-action";
import { accountSchema, type AccountInput, type AccountValues } from "@/lib/schemas";
import type { Tables } from "@/lib/db/types";
import { createAccount, updateAccount } from "@/server/actions/accounts";

export function AccountFormDialog({
  account,
  trigger,
}: {
  account?: Tables<"accounts">;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const create = useServerAction(createAccount);
  const update = useServerAction(updateAccount);
  const pending = create.pending || update.pending;
  const serverErrors = account ? update.fieldErrors : create.fieldErrors;

  const defaults: AccountInput = {
    name: account?.name ?? "",
    type: account?.type ?? "checking",
    institution: account?.institution ?? "",
    initialBalance: centsToInput(account?.initial_balance_cents ?? 0),
    color: account?.color ?? "#0ea5e9",
  };
  const form = useForm<AccountInput, unknown, AccountValues>({ resolver: zodResolver(accountSchema), defaultValues: defaults });
  const errors = form.formState.errors;
  const err = (key: keyof AccountInput) => errors[key]?.message ?? serverErrors[key];

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues();
    const done = () => {
      setOpen(false);
      if (!account) form.reset(defaults);
    };
    if (account) update.run({ ...values, id: account.id }, { onSuccess: done });
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
          <DialogTitle>{account ? "Editar conta" : "Nova conta"}</DialogTitle>
          <DialogDescription>
            O saldo atual é calculado a partir do saldo inicial e dos lançamentos.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField id="account-name" label="Nome" error={err("name")}>
            <Input id="account-name" placeholder="Ex.: Nubank" {...form.register("name")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="account-type" label="Tipo" error={err("type")}>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="account-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACCOUNT_TYPE_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField id="account-institution" label="Instituição" error={err("institution")}>
              <Input id="account-institution" placeholder="Opcional" {...form.register("institution")} />
            </FormField>
          </div>
          <FormField
            id="account-initial"
            label="Saldo inicial (R$)"
            error={err("initialBalance")}
            hint="Saldo antes do primeiro lançamento registrado aqui. Pode ser negativo."
          >
            <Input id="account-initial" inputMode="decimal" className="tabular" {...form.register("initialBalance")} />
          </FormField>
          <FormField id="account-color" label="Cor" error={err("color")}>
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => <ColorPicker id="account-color" value={field.value} onChange={field.onChange} />}
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
