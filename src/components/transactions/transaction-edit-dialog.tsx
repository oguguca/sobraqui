"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS } from "@/domain/labels";
import { centsToInput } from "@/domain/money";
import { useServerAction } from "@/hooks/use-server-action";
import type { Tables } from "@/lib/db/types";
import {
  transactionUpdateSchema,
  type TransactionUpdateInput,
  type TransactionUpdateValues,
} from "@/lib/transaction-schema";
import { updateTransaction } from "@/server/actions/transactions";

import type { Lookups } from "./lookups";

const NONE = "__none__";

export function TransactionEditDialog({
  transaction: t,
  lookups,
  open,
  onOpenChange,
}: {
  transaction: Tables<"transactions">;
  lookups: Lookups;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { run, pending, fieldErrors } = useServerAction(updateTransaction);
  const form = useForm<TransactionUpdateInput, unknown, TransactionUpdateValues>({
    resolver: zodResolver(transactionUpdateSchema),
    values: {
      id: t.id,
      description: t.description,
      amount: centsToInput(t.amount_cents),
      occurredOn: t.occurred_on,
      categoryId: t.category_id ?? "",
      notes: t.notes ?? "",
      status: t.status,
      paymentMethod: t.payment_method === "credit_card" ? null : t.payment_method,
    },
  });
  const errors = form.formState.errors;
  const err = (key: keyof TransactionUpdateInput) => errors[key]?.message ?? fieldErrors[key];

  const categoryKind = t.kind === "income" ? "income" : t.kind === "transfer" ? "transfer" : "expense";
  const categories = Object.entries(lookups.categories).filter(
    ([id, c]) => c.kind === categoryKind && (!c.archived || id === t.category_id),
  );
  const isInstallment = Boolean(t.installment_group_id);
  const onCard = Boolean(t.credit_card_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar lançamento</DialogTitle>
          <DialogDescription>
            {isInstallment
              ? `Parcela ${t.installment_number}/${t.installment_total}: a alteração vale só para esta parcela.`
              : "Para mudar o tipo, a conta ou o cartão, exclua e lance de novo."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit(() => run(form.getValues(), { onSuccess: () => onOpenChange(false) }))}
          className="grid gap-4"
          noValidate
        >
          <FormField id="edit-description" label="Descrição" error={err("description")}>
            <Input id="edit-description" {...form.register("description")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="edit-amount" label="Valor (R$)" error={err("amount")}>
              <Input id="edit-amount" inputMode="decimal" className="tabular" {...form.register("amount")} />
            </FormField>
            <FormField
              id="edit-date"
              label="Data"
              error={err("occurredOn")}
              hint={isInstallment ? "Parcelas mantêm a data original." : undefined}
            >
              <Input id="edit-date" type="date" disabled={isInstallment} {...form.register("occurredOn")} />
            </FormField>
          </div>
          {t.kind !== "transfer" && (
            <FormField id="edit-category" label="Categoria" error={err("categoryId")}>
              <Controller
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value || NONE} onValueChange={(v) => field.onChange(v === NONE ? "" : v)}>
                    <SelectTrigger id="edit-category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem categoria</SelectItem>
                      {categories.map(([id, c]) => (
                        <SelectItem key={id} value={id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          )}
          {t.kind === "expense" && !onCard && (
            <FormField id="edit-method" label="Forma de pagamento">
              <Controller
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <Select value={field.value ?? "other"} onValueChange={field.onChange}>
                    <SelectTrigger id="edit-method" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.filter((m) => m !== "credit_card").map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_METHOD_LABEL[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          )}
          {!onCard && (
            <FormField id="edit-status" label="Situação">
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="edit-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">Efetivada</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
          )}
          <FormField id="edit-notes" label="Observações" error={err("notes")}>
            <Textarea id="edit-notes" rows={2} {...form.register("notes")} />
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
