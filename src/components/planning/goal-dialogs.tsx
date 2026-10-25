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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GOAL_KIND_LABEL } from "@/domain/labels";
import { centsToInput, formatMoney, parseMoney } from "@/domain/money";
import { useServerAction } from "@/hooks/use-server-action";
import { goalSchema, type GoalInput, type GoalValues } from "@/lib/schemas";
import type { Tables } from "@/lib/db/types";
import { contributeToGoal, createGoal, updateGoal } from "@/server/actions/planning";

export function GoalFormDialog({ goal, trigger }: { goal?: Tables<"financial_goals">; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const create = useServerAction(createGoal);
  const update = useServerAction(updateGoal);
  const pending = create.pending || update.pending;
  const serverErrors = goal ? update.fieldErrors : create.fieldErrors;
  const defaults: GoalInput = {
    name: goal?.name ?? "",
    kind: goal?.kind ?? "emergency",
    target: goal ? centsToInput(goal.target_cents) : "",
    saved: centsToInput(goal?.saved_cents ?? 0),
    targetDate: goal?.target_date ?? "",
    color: goal?.color ?? "#16a34a",
  };
  const form = useForm<GoalInput, unknown, GoalValues>({ resolver: zodResolver(goalSchema), defaultValues: defaults });
  const err = (key: keyof GoalInput) => form.formState.errors[key]?.message ?? serverErrors[key];

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
          <DialogTitle>{goal ? "Editar meta" : "Nova meta"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={form.handleSubmit(() => {
            const values = form.getValues();
            const done = () => setOpen(false);
            if (goal) update.run({ ...values, id: goal.id }, { onSuccess: done });
            else create.run(values, { onSuccess: done });
          })}
        >
          <FormField id="goal-name" label="Nome" error={err("name")}>
            <Input id="goal-name" placeholder="Ex.: Reserva de emergência" {...form.register("name")} />
          </FormField>
          <FormField id="goal-kind" label="Tipo">
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="goal-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(GOAL_KIND_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField id="goal-target" label="Valor desejado (R$)" error={err("target")}>
              <Input id="goal-target" inputMode="decimal" className="tabular" {...form.register("target")} />
            </FormField>
            <FormField id="goal-saved" label="Já guardado (R$)" error={err("saved")}>
              <Input id="goal-saved" inputMode="decimal" className="tabular" {...form.register("saved")} />
            </FormField>
          </div>
          <FormField id="goal-date" label="Prazo" error={err("targetDate")} hint="Opcional.">
            <Input id="goal-date" type="date" {...form.register("targetDate")} />
          </FormField>
          <FormField id="goal-color" label="Cor">
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => <ColorPicker id="goal-color" value={field.value} onChange={field.onChange} />}
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

/** Aporte ou retirada. Não cria lançamento: a meta registra quanto está reservado. */
export function GoalContributionDialog({ goal, trigger }: { goal: Tables<"financial_goals">; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const { run, pending, fieldErrors } = useServerAction(contributeToGoal);
  const cents = parseMoney(amount);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setAmount("");
          setDirection("in");
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{goal.name}</DialogTitle>
          <DialogDescription>Guardado hoje: {formatMoney(goal.saved_cents)}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (cents === null || cents <= 0) return;
            const signed = direction === "in" ? amount : `-${amount}`;
            run({ id: goal.id, amount: signed }, { onSuccess: () => setOpen(false) });
          }}
        >
          <Tabs value={direction} onValueChange={(v) => setDirection(v as "in" | "out")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="in">Guardar</TabsTrigger>
              <TabsTrigger value="out">Retirar</TabsTrigger>
            </TabsList>
          </Tabs>
          <FormField id="goal-amount" label="Valor (R$)" error={fieldErrors.amount}>
            <Input
              id="goal-amount"
              inputMode="decimal"
              className="tabular"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={pending || cents === null || cents <= 0}>
              {pending ? "Salvando…" : direction === "in" ? "Guardar" : "Retirar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
