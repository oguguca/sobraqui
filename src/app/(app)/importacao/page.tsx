import { History } from "lucide-react";
import type { Metadata } from "next";

import { ClearImports } from "@/components/import/clear-imports";
import { ResetEverything } from "@/components/settings/reset-everything";
import { ImportHistory } from "@/components/import/import-history";
import { ImportWizard } from "@/components/import/import-wizard";
import { OpenFinanceSync } from "@/components/import/open-finance-sync";
import { EmptyState, PageHeader } from "@/components/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { errorMessage } from "@/server/action";
import { openInvoiceCycle } from "@/domain/credit-card";
import { monthOf, monthStart } from "@/domain/dates";
import { requireAuth } from "@/server/auth";
import { isPluggyConfigured, listPluggyAccounts } from "@/server/pluggy";
import { loadLedgerContext } from "@/server/queries/context";

export const metadata: Metadata = { title: "Importação" };

export default async function ImportPage() {
  const ctx = await requireAuth();
  const [ledger, batches, importedCount] = await Promise.all([
    loadLedgerContext(ctx),
    ctx.db((tx) =>
      tx.importBatch.findMany({ where: { user_id: ctx.user.id }, orderBy: { created_at: "desc" }, take: 50 }),
    ),
    ctx.db((tx) => tx.transaction.count({ where: { user_id: ctx.user.id, import_batch_id: { not: null } } })),
  ]);
  const targets = { ...ledger.lookups.accounts, ...ledger.lookups.cards };
  const firstCard = ledger.activeCards[0];
  const cycle = firstCard ? openInvoiceCycle(ledger.today, firstCard.closing_day, firstCard.due_day) : null;
  const cycleRange = cycle
    ? { from: cycle.from, to: cycle.to }
    : { from: monthStart(monthOf(ledger.today)), to: ledger.today };

  // Open Finance: falha na Pluggy não derruba a página; só mostra o aviso.
  let openFinance: { accounts: Awaited<ReturnType<typeof listPluggyAccounts>> } | { error: string } | null = null;
  if (isPluggyConfigured()) {
    try {
      openFinance = { accounts: await listPluggyAccounts() };
    } catch (err) {
      openFinance = { error: errorMessage(err) };
    }
  }

  return (
    <>
      <PageHeader
        title="Importação bancária"
        description="Importe extratos e faturas exportados pelo app do banco. Nunca pedimos sua senha bancária."
      />
      {openFinance && (
        <div className="mb-6">
          {"error" in openFinance ? (
            <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{openFinance.error}</p>
          ) : (
            <OpenFinanceSync
              accounts={openFinance.accounts.map(({ id, type, subtype, name, marketingName, number, balance }) => ({
                id,
                type,
                subtype,
                name,
                marketingName,
                number,
                balance,
              }))}
              options={ledger.formOptions}
              today={ledger.today}
              defaultRange={cycleRange}
            />
          )}
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold tracking-tight">Importar arquivo (CSV ou OFX)</h2>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <ImportWizard options={ledger.formOptions} today={ledger.today} />
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Como exportar do Nubank</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">Extrato da conta (CSV ou OFX)</p>
              <p>
                No app, a opção de exportar fica no extrato da conta: escolha o período e o formato (CSV ou OFX).
              </p>
            </div>
            <div>
              <p className="font-medium text-foreground">Fatura do cartão (CSV)</p>
              <p>A exportação fica na tela da fatura. Cada arquivo corresponde a uma fatura.</p>
            </div>
            <p>
              Os caminhos no app podem mudar com atualizações do Nubank. Transações repetidas são detectadas pelo
              identificador do banco ou por data, valor e descrição, então reimportar o mesmo período é seguro.
            </p>
            <p>
              Pagamentos de fatura que aparecem na fatura do cartão são ignorados por padrão: registre-os pelo extrato da
              conta para que a saída de dinheiro seja contada uma única vez.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Histórico de importações</CardTitle>
          <CardDescription>Desfazer remove só as transações daquele arquivo.</CardDescription>
        </CardHeader>
        <CardContent>
          {!batches?.length ? (
            <EmptyState icon={History} title="Nenhuma importação ainda" className="border-0" />
          ) : (
            <ImportHistory batches={batches} targets={targets} timezone={ctx.user.timezone} />
          )}
        </CardContent>
      </Card>

      <ClearImports importedCount={importedCount} />
      <ResetEverything className="mt-4 ring-destructive/40" />
    </>
  );
}
