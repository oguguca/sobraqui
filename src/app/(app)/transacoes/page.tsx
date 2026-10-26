import { ArrowLeftRight, Download, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Pagination } from "@/components/pagination";
import { EmptyState, PageHeader } from "@/components/shared";
import { TransactionFilters } from "@/components/transactions/transaction-filters";
import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import { TransactionsTable } from "@/components/transactions/transactions-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAuth } from "@/server/auth";
import { loadLedgerContext } from "@/server/queries/context";
import { listTransactions, parseTransactionFilters } from "@/server/queries/transactions";
import { materializeRecurring } from "@/server/recurring";

export const metadata: Metadata = { title: "Transações" };

export default async function TransactionsPage({ searchParams }: PageProps<"/transacoes">) {
  const ctx = await requireAuth();
  const params = await searchParams;
  const filters = parseTransactionFilters(params);
  await materializeRecurring(ctx);
  const [ledger, result] = await Promise.all([loadLedgerContext(ctx), listTransactions(ctx, filters)]);

  const exportParams = new URLSearchParams();
  for (const key of ["q", "from", "to", "kind", "status", "category", "account", "card"] as const) {
    const value = filters[key];
    if (value) exportParams.set(key, value);
  }

  const newButton = (
    <TransactionFormDialog
      options={ledger.formOptions}
      today={ledger.today}
      trigger={
        <Button>
          <Plus /> Novo lançamento
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Transações"
        description="Receitas, despesas, transferências e compras no cartão."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/api/export/transactions?${exportParams.toString()}`} prefetch={false}>
                <Download /> Exportar CSV
              </Link>
            </Button>
            {/* No celular o lançamento fica no botão "+" da barra inferior. */}
            <div className="max-md:hidden">{newButton}</div>
          </>
        }
      />
      <div className="grid gap-4">
        <TransactionFilters options={ledger.formOptions} />
        <Card className="py-2">
          <CardContent className="px-2 sm:px-4">
            {result.rows.length === 0 ? (
              <EmptyState
                className="my-4 border-0"
                icon={ArrowLeftRight}
                title={result.total === 0 && filters.page === 1 ? "Nenhum lançamento encontrado" : "Página vazia"}
                description="Registre um lançamento ou importe um extrato do seu banco."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    {newButton}
                    <Button variant="outline" asChild>
                      <Link href="/importacao">Importar extrato</Link>
                    </Button>
                  </div>
                }
              />
            ) : (
              <>
                <TransactionsTable rows={result.rows} lookups={ledger.lookups} accountId={filters.account} />
                <Pagination
                  page={filters.page}
                  total={result.total}
                  pageSize={result.pageSize}
                  basePath="/transacoes"
                  params={params}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
