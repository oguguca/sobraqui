import { ArrowLeft, ArrowLeftRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AccountActions } from "@/components/accounts/account-actions";
import { Pagination } from "@/components/pagination";
import { ColorDot, EmptyState, Money, PageHeader } from "@/components/shared";
import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCOUNT_TYPE_LABEL } from "@/domain/labels";
import { requireAuth } from "@/server/auth";
import { loadLedgerContext } from "@/server/queries/context";
import { getAccount } from "@/server/queries/core";
import { listTransactions, parseTransactionFilters, pendingEffect } from "@/server/queries/transactions";

export const metadata: Metadata = { title: "Conta" };

export default async function AccountPage({ params, searchParams }: PageProps<"/contas/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireAuth();
  const account = await getAccount(ctx, id);
  if (!account) notFound();

  const search = await searchParams;
  const filters = { ...parseTransactionFilters(search), account: id };
  const [ledger, result, pending] = await Promise.all([
    loadLedgerContext(ctx),
    listTransactions(ctx, filters),
    pendingEffect(ctx, id),
  ]);

  return (
    <>
      <Link href="/contas" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Contas
      </Link>
      <PageHeader
        title={account.name}
        description={
          <span className="flex items-center gap-2">
            <ColorDot color={account.color} />
            {ACCOUNT_TYPE_LABEL[account.type]}
            {account.institution ? ` · ${account.institution}` : ""}
            {account.archived_at && <Badge variant="secondary">Arquivada</Badge>}
          </span>
        }
        actions={
          <>
            <AccountActions account={account} />
            {!account.archived_at && (
              <TransactionFormDialog
                options={ledger.formOptions}
                today={ledger.today}
                defaults={{ accountId: account.id }}
                trigger={
                  <Button>
                    <Plus /> Lançar
                  </Button>
                }
              />
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat label="Saldo atual" cents={account.balance_cents} tone="auto" className="col-span-2 sm:col-span-1" />
        <Stat label="Saldo inicial" cents={account.initial_balance_cents} />
        <Stat
          label="Pendente nesta conta"
          cents={pending.cents}
          tone="auto"
          hint={`${pending.count} lançamento(s) a pagar ou receber`}
        />
      </div>

      <Card className="py-2">
        <CardHeader className="px-4 pt-4">
          <CardTitle>Movimentações</CardTitle>
          <CardDescription>Inclui transferências de e para esta conta e pagamentos de fatura.</CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-4">
          {result.rows.length === 0 ? (
            <EmptyState className="my-4 border-0" icon={ArrowLeftRight} title="Sem movimentações nesta conta" />
          ) : (
            <>
              <TransactionsTable rows={result.rows} lookups={ledger.lookups} accountId={account.id} compact />
              <Pagination
                page={filters.page}
                total={result.total}
                pageSize={result.pageSize}
                basePath={`/contas/${account.id}`}
                params={search}
              />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Stat({
  label,
  cents,
  tone,
  hint,
  className,
}: {
  label: string;
  cents: number;
  tone?: "auto";
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <Money cents={cents} tone={tone} className="mt-1 block text-xl font-semibold tracking-tight sm:text-2xl" />
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
