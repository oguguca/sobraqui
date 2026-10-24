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
import { formatMonth } from "@/domain/dates";
import { centsToInput } from "@/domain/money";
import { useServerAction } from "@/hooks/use-server-action";
import { budgetSchema, type BudgetInput, type BudgetValues } from "@/lib/schemas";
import { setBudget } from "@/server/actions/planning";

export function BudgetDialog({
  month,
  categories,
  categoryId,
  limitCents,
  trigger,
}: {
  month: string;
  categories: { id: string; name: string }[];
  categoryId?: string;
  limitCents?: number;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { run, pending, fieldErrors } = useServerAction(setBudget);
  const defaults: BudgetInput = {
    month,
    categoryId: categoryId ?? categories[0]?.id ?? "",
    limit: limitCents ? centsToInput(limitCents) : "",
  };
  const form = useForm<BudgetInput, unknown, BudgetValues>({ resolver: zodResolver(budgetSchema), defaultValues: defaults });
  const err = (key: keyof BudgetInput) => form.formState.errors[key]?.message ?? fieldErrors[key];

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
          <DialogTitle>{categoryId ? "Editar limite" : "Definir limite"}</DialogTitle>
          <DialogDescription className="first-letter:uppercase">{formatMonth(month)}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit(() => run(form.getValues(), { onSuccess: () => setOpen(false) }))}
        >
          <FormField id="budget-category" label="Categoria" error={err("categoryId")}>
            <Controller
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={Boolean(categoryId)}>
                  <SelectTrigger id="budget-category" className="w-full">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <FormField id="budget-limit" label="Limite mensal (R$)" error={err("limit")}>
            <Input id="budget-limit" inputMode="decimal" className="tabular" {...form.register("limit")} />
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
