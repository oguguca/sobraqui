import { Plus, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { GoalCard } from "@/components/planning/goal-card";
import { GoalFormDialog } from "@/components/planning/goal-dialogs";
import { EmptyState, PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { todayIn } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { requireAuth } from "@/server/auth";

export const metadata: Metadata = { title: "Metas" };

export default async function GoalsPage({ searchParams }: PageProps<"/metas">) {
  const ctx = await requireAuth();
  const showArchived = (await searchParams).arquivadas === "1";
  let q = ctx.supabase.from("financial_goals").select("*").order("created_at");
  if (!showArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const goals = data ?? [];
  const today = todayIn(ctx.user.timezone);
  const saved = goals.filter((g) => !g.archived_at).reduce((s, g) => s + g.saved_cents, 0);

  const newButton = (
    <GoalFormDialog
      trigger={
        <Button>
          <Plus /> Nova meta
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Metas"
        description={
          goals.length > 0
            ? `${formatMoney(saved)} reservados nas metas ativas.`
            : "Reserva de emergência, compra de um bem, quitação de dívida."
        }
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href={showArchived ? "/metas" : "/metas?arquivadas=1"}>
                {showArchived ? "Ocultar arquivadas" : "Ver arquivadas"}
              </Link>
            </Button>
            {newButton}
          </>
        }
      />
      {goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhuma meta criada"
          description="Defina um valor e, se quiser, um prazo. O sistema calcula quanto guardar por mês."
          action={newButton}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} today={today} />
          ))}
        </div>
      )}
    </>
  );
}
