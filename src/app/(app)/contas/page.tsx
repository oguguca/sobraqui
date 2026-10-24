import { Landmark, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { ColorDot, EmptyState, Money, PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ACCOUNT_TYPE_LABEL } from "@/domain/labels";
import { requireAuth } from "@/server/auth";
import { listAccounts } from "@/server/queries/core";

export const metadata: Metadata = { title: "Contas" };

export default async function AccountsPage({ searchParams }: PageProps<"/contas">) {
  const ctx = await requireAuth();
  const showArchived = (await searchParams).arquivadas === "1";
  const accounts = await listAccounts(ctx, { includeArchived: showArchived });
  const active = accounts.filter((a) => !a.archived_at);
  const total = active.reduce((sum, a) => sum + a.balance_cents, 0);

  const newButton = (
    <AccountFormDialog
      trigger={
        <Button>
          <Plus /> Nova conta
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Contas"
        description={
          active.length > 0 ? (
            <>
              Saldo somado: <Money cents={total} tone="auto" className="font-medium" />
            </>
          ) : (
            "Contas correntes, de pagamento, poupança e dinheiro em espécie."
          )
        }
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href={showArchived ? "/contas" : "/contas?arquivadas=1"}>
                {showArchived ? "Ocultar arquivadas" : "Ver arquivadas"}
              </Link>
            </Button>
            {newButton}
          </>
        }
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Nenhuma conta cadastrada"
          description="Cadastre suas contas para acompanhar o saldo de cada uma. O saldo é calculado pelos lançamentos."
          action={newButton}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <Link
              key={account.id}
              href={`/contas/${account.id}`}
              className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <CardContent className="flex h-full flex-col gap-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <ColorDot color={account.color} />
                      <span className="truncate font-medium">{account.name}</span>
                    </div>
                    {account.archived_at && <Badge variant="secondary">Arquivada</Badge>}
                  </div>
                  <Money cents={account.balance_cents} tone="auto" className="text-2xl font-semibold tracking-tight" />
                  <p className="mt-auto text-xs text-muted-foreground">
                    {ACCOUNT_TYPE_LABEL[account.type]}
                    {account.institution ? ` · ${account.institution}` : ""}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
