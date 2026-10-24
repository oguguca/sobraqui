"use client";

import { ArrowLeftRight, Check, CreditCard, Eye, FileUp, MoreHorizontal, Pencil, Repeat, Trash2 } from "lucide-react";
import { useState } from "react";

import { CategoryBadgeIcon } from "@/components/category-icon";
import { ConfirmAction } from "@/components/confirm-button";
import { Money } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/domain/dates";
import { TRANSACTION_KIND_LABEL } from "@/domain/labels";
import { useServerAction } from "@/hooks/use-server-action";
import type { Tables } from "@/lib/supabase/database.types";
import { deleteTransaction, markTransactionPaid } from "@/server/actions/transactions";

import type { Lookups } from "./lookups";
import { TransactionDetailsSheet } from "./transaction-details-sheet";
import { TransactionEditDialog } from "./transaction-edit-dialog";

type Tx = Tables<"transactions">;

/** Valor com sinal do ponto de vista do patrimônio, para colorir. */
export function signedAmount(t: Tx, accountId?: string): number {
  if (t.kind === "income" || t.kind === "refund") return t.amount_cents;
  if (t.kind === "transfer") {
    if (accountId) return t.destination_account_id === accountId ? t.amount_cents : -t.amount_cents;
    return 0;
  }
  return -t.amount_cents;
}

export function sourceLabel(t: Tx, lookups: Lookups): string {
  if (t.kind === "transfer") {
    return `${lookups.accounts[t.account_id ?? ""] ?? "Conta"} → ${lookups.accounts[t.destination_account_id ?? ""] ?? "Conta"}`;
  }
  if (t.kind === "invoice_payment") {
    return `${lookups.accounts[t.account_id ?? ""] ?? "Conta"} → ${lookups.cards[t.credit_card_id ?? ""] ?? "Cartão"}`;
  }
  if (t.credit_card_id) return lookups.cards[t.credit_card_id] ?? "Cartão";
  return lookups.accounts[t.account_id ?? ""] ?? "Conta arquivada";
}

export function TransactionsTable({
  rows,
  lookups,
  accountId,
  compact = false,
}: {
  rows: Tx[];
  lookups: Lookups;
  /** Contexto de conta: transferências ficam positivas ou negativas conforme o lado. */
  accountId?: string;
  compact?: boolean;
}) {
  const [details, setDetails] = useState<Tx | null>(null);
  const [editing, setEditing] = useState<Tx | null>(null);

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[45%]">Descrição</TableHead>
              {!compact && <TableHead className="hidden md:table-cell">Conta / cartão</TableHead>}
              <TableHead className="hidden sm:table-cell">Data</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => {
              const category = t.category_id ? lookups.categories[t.category_id] : undefined;
              const neutral = t.kind === "transfer" || t.kind === "invoice_payment";
              return (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => setDetails(t)}>
                  <TableCell className="max-w-0">
                    <div className="flex items-center gap-3">
                      {neutral ? (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          {t.kind === "transfer" ? <ArrowLeftRight className="size-4" /> : <CreditCard className="size-4" />}
                        </span>
                      ) : (
                        <CategoryBadgeIcon icon={category?.icon} color={category?.color} />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.description}</p>
                        <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <span className="truncate">
                            {neutral ? TRANSACTION_KIND_LABEL[t.kind] : (category?.name ?? "Sem categoria")}
                          </span>
                          {t.installment_total && (
                            <span className="tabular">
                              · {t.installment_number}/{t.installment_total}
                            </span>
                          )}
                          {t.recurring_transaction_id && <Repeat className="size-3" aria-label="Recorrente" />}
                          {t.import_batch_id && <FileUp className="size-3" aria-label="Importada" />}
                          <span className="sm:hidden">· {formatDate(t.occurred_on)}</span>
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  {!compact && (
                    <TableCell className="hidden max-w-48 truncate text-muted-foreground md:table-cell">
                      {sourceLabel(t, lookups)}
                    </TableCell>
                  )}
                  <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                    <span className="tabular">{formatDate(t.occurred_on)}</span>
                    {t.status === "pending" && (
                      <Badge variant="outline" className="ml-2 border-warning/50 text-warning">
                        Pendente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {neutral && !accountId ? (
                      <Money cents={t.amount_cents} className="text-muted-foreground" />
                    ) : (
                      <Money cents={signedAmount(t, accountId)} tone="auto" signed />
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <RowActions transaction={t} onView={() => setDetails(t)} onEdit={() => setEditing(t)} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <TransactionDetailsSheet
        transaction={details}
        lookups={lookups}
        onOpenChange={(open) => !open && setDetails(null)}
      />
      {editing && (
        <TransactionEditDialog
          transaction={editing}
          lookups={lookups}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </>
  );
}

function RowActions({ transaction: t, onView, onEdit }: { transaction: Tx; onView: () => void; onEdit: () => void }) {
  const markPaid = useServerAction(markTransactionPaid);
  const isGroup = Boolean(t.installment_group_id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações de ${t.description}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onView}>
          <Eye /> Detalhes
        </DropdownMenuItem>
        {t.kind !== "invoice_payment" && (
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Editar
          </DropdownMenuItem>
        )}
        {t.status === "pending" && (
          <DropdownMenuItem disabled={markPaid.pending} onSelect={() => markPaid.run({ id: t.id })}>
            <Check /> Marcar como {t.kind === "income" ? "recebido" : "pago"}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <ConfirmAction
          title="Excluir lançamento?"
          description={
            t.import_batch_id
              ? "Este lançamento veio de uma importação. Excluir não pode ser desfeito; ao reimportar o arquivo, ele será recriado."
              : "Esta ação não pode ser desfeita."
          }
          confirmLabel="Excluir"
          action={deleteTransaction}
          input={{ id: t.id, wholeGroup: false }}
          trigger={
            <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
              <Trash2 /> {isGroup ? "Excluir esta parcela" : "Excluir"}
            </DropdownMenuItem>
          }
        />
        {isGroup && (
          <ConfirmAction
            title="Excluir todas as parcelas?"
            description={`Remove as ${t.installment_total} parcelas desta compra de todas as faturas.`}
            confirmLabel="Excluir todas"
            action={deleteTransaction}
            input={{ id: t.id, wholeGroup: true }}
            trigger={
              <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                <Trash2 /> Excluir todas as parcelas
              </DropdownMenuItem>
            }
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
