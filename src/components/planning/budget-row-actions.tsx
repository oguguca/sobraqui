"use client";

import { Copy, Pencil, Trash2 } from "lucide-react";

import { ConfirmAction } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { useServerAction } from "@/hooks/use-server-action";
import { copyPreviousBudgets, deleteBudget } from "@/server/actions/planning";

import { BudgetDialog } from "./budget-dialog";

export function BudgetRowActions({
  budgetId,
  month,
  category,
  limitCents,
}: {
  budgetId: string;
  month: string;
  category: { id: string; name: string };
  limitCents: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <BudgetDialog
        month={month}
        categories={[category]}
        categoryId={category.id}
        limitCents={limitCents}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Editar limite de ${category.name}`}>
            <Pencil />
          </Button>
        }
      />
      <ConfirmAction
        title="Remover limite?"
        description={`O limite de ${category.name} deste mês será removido. Os lançamentos não mudam.`}
        confirmLabel="Remover"
        action={deleteBudget}
        input={{ id: budgetId }}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Remover limite de ${category.name}`}>
            <Trash2 />
          </Button>
        }
      />
    </div>
  );
}

export function CopyBudgetsButton({ month }: { month: string }) {
  const { run, pending } = useServerAction(copyPreviousBudgets);
  return (
    <Button variant="outline" disabled={pending} onClick={() => run({ month })}>
      <Copy /> {pending ? "Copiando…" : "Copiar do mês anterior"}
    </Button>
  );
}
