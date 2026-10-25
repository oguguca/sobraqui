"use client";

import { Archive, ArchiveRestore, MoreHorizontal, Pencil, PiggyBank, Trash2 } from "lucide-react";

import { ConfirmAction } from "@/components/confirm-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { goalProgress, monthlyContributionNeeded } from "@/domain/budget";
import { diffDays, formatDate } from "@/domain/dates";
import { GOAL_KIND_LABEL } from "@/domain/labels";
import { formatMoney, formatPercent } from "@/domain/money";
import { useServerAction } from "@/hooks/use-server-action";
import type { Tables } from "@/lib/db/types";
import { deleteGoal, setGoalArchived } from "@/server/actions/planning";

import { GoalContributionDialog, GoalFormDialog } from "./goal-dialogs";

export function GoalCard({ goal, today }: { goal: Tables<"financial_goals">; today: string }) {
  const archive = useServerAction(setGoalArchived);
  const progress = goalProgress(goal.saved_cents, goal.target_cents);
  const done = goal.saved_cents >= goal.target_cents;
  const daysLeft = goal.target_date ? diffDays(today, goal.target_date) : null;
  const monthsLeft = daysLeft === null ? null : Math.max(0, Math.ceil(daysLeft / 30.44));
  const perMonth = monthlyContributionNeeded(goal.saved_cents, goal.target_cents, monthsLeft);
  const color = goal.color ?? "var(--positive)";
  const archived = Boolean(goal.archived_at);

  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{goal.name}</p>
            <p className="text-xs text-muted-foreground">{GOAL_KIND_LABEL[goal.kind]}</p>
          </div>
          <div className="flex items-center gap-1">
            {done && <Badge className="bg-positive-soft text-positive">Concluída</Badge>}
            {archived && <Badge variant="secondary">Arquivada</Badge>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${goal.name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <GoalFormDialog
                  goal={goal}
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Pencil /> Editar
                    </DropdownMenuItem>
                  }
                />
                <DropdownMenuItem
                  disabled={archive.pending}
                  onSelect={() => archive.run({ id: goal.id, archived: !archived })}
                >
                  {archived ? <ArchiveRestore /> : <Archive />} {archived ? "Reativar" : "Arquivar"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <ConfirmAction
                  title="Excluir meta?"
                  description="A meta será removida. Seus lançamentos não mudam."
                  confirmLabel="Excluir"
                  action={deleteGoal}
                  input={{ id: goal.id }}
                  trigger={
                    <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                      <Trash2 /> Excluir
                    </DropdownMenuItem>
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div>
          <p className="tabular text-2xl font-semibold tracking-tight">{formatMoney(goal.saved_cents)}</p>
          <p className="text-sm text-muted-foreground">de {formatMoney(goal.target_cents)}</p>
        </div>

        <div className="grid gap-1.5">
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label={`Progresso de ${goal.name}`}
          >
            <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, backgroundColor: color }} />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="tabular">{formatPercent(progress)}</span>
            {goal.target_date && (
              <span>
                {daysLeft !== null && daysLeft < 0 && !done ? "Prazo vencido" : `Até ${formatDate(goal.target_date)}`}
              </span>
            )}
          </div>
        </div>

        {perMonth !== null && (
          <p className="text-xs text-muted-foreground">
            Guarde cerca de <span className="font-medium text-foreground">{formatMoney(perMonth)}</span> por mês para
            chegar no prazo.
          </p>
        )}

        {!archived && (
          <GoalContributionDialog
            goal={goal}
            trigger={
              <Button variant="outline" size="sm" className="justify-self-start">
                <PiggyBank /> Guardar ou retirar
              </Button>
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
