import { CreditCard, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CardFormDialog } from "@/components/cards/card-form-dialog";
import { ColorDot, EmptyState, Money, PageHeader } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { INVOICE_STATUS_LABEL } from "@/domain/credit-card";
import { formatDate, todayIn } from "@/domain/dates";
import { requireAuth } from "@/server/auth";
import { currentInvoiceMonth, invoiceOrPlaceholder, listInvoices } from "@/server/queries/cards";
import { listAccounts, listCards } from "@/server/queries/core";

export const metadata: Metadata = { title: "Cartões" };

export default async function CardsPage({ searchParams }: PageProps<"/cartoes">) {
  const ctx = await requireAuth();
  const showArchived = (await searchParams).arquivados === "1";
  const today = todayIn(ctx.user.timezone);
  const [cards, accounts] = await Promise.all([listCards(ctx, { includeArchived: showArchived }), listAccounts(ctx)]);
  const accountOptions = accounts.map((a) => ({ id: a.id, name: a.name }));

  const withInvoice = await Promise.all(
    cards.map(async (card) => {
      const invoices = await listInvoices(ctx, card.id, today);
      return { card, current: invoiceOrPlaceholder(invoices, card, currentInvoiceMonth(card, today), today) };
    }),
  );

  const newButton = (
    <CardFormDialog
      accounts={accountOptions}
      trigger={
        <Button>
          <Plus /> Novo cartão
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Cartões de crédito"
        description="Compras entram como despesa na data da compra; o pagamento da fatura só move dinheiro da conta."
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href={showArchived ? "/cartoes" : "/cartoes?arquivados=1"}>
                {showArchived ? "Ocultar arquivados" : "Ver arquivados"}
              </Link>
            </Button>
            {newButton}
          </>
        }
      />
      {cards.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum cartão cadastrado"
          description="Cadastre o cartão com o dia de fechamento e de vencimento para acompanhar faturas e parcelas."
          action={newButton}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {withInvoice.map(({ card, current }) => {
            const usedRatio = card.limit_cents > 0 ? Math.max(0, card.used_cents) / card.limit_cents : 0;
            return (
              <Link key={card.id} href={`/cartoes/${card.id}`} className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <CardContent className="grid gap-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 font-medium">
                        <ColorDot color={card.color} />
                        <span className="truncate">{card.name}</span>
                      </span>
                      {card.archived_at ? (
                        <Badge variant="secondary">Arquivado</Badge>
                      ) : (
                        <Badge variant="outline">Fatura {INVOICE_STATUS_LABEL[current.status].toLowerCase()}</Badge>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Fatura atual · vence {formatDate(current.due_date)}</p>
                      <Money cents={current.amountCents} className="text-2xl font-semibold tracking-tight" />
                    </div>
                    <div className="grid gap-1.5">
                      <Progress value={Math.min(100, usedRatio * 100)} aria-label="Limite usado" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          Usado <Money cents={Math.max(0, card.used_cents)} />
                        </span>
                        <span>
                          Disponível <Money cents={card.available_cents} tone={card.available_cents < 0 ? "negative" : "neutral"} />
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
