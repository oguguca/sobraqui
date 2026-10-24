"use client";

import { Money } from "@/components/shared";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDate, formatDateTime } from "@/domain/dates";
import { TRANSACTION_KIND_LABEL, TRANSACTION_STATUS_LABEL } from "@/domain/labels";
import type { Tables } from "@/lib/supabase/database.types";

import type { Lookups } from "./lookups";

export function TransactionDetailsSheet({
  transaction: t,
  lookups,
  onOpenChange,
}: {
  transaction: Tables<"transactions"> | null;
  lookups: Lookups;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={Boolean(t)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {t && (
          <>
            <SheetHeader>
              <SheetDescription>{TRANSACTION_KIND_LABEL[t.kind]}</SheetDescription>
              <SheetTitle className="text-lg">{t.description}</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6">
              <Money cents={t.amount_cents} className="text-3xl font-semibold tracking-tight" />
              <dl className="mt-6 grid gap-4 text-sm">
                <Item label="Data do lançamento" value={formatDate(t.occurred_on)} />
                <Item label="Situação" value={TRANSACTION_STATUS_LABEL[t.status]} />
                {t.category_id && <Item label="Categoria" value={lookups.categories[t.category_id]?.name ?? "—"} />}
                {t.account_id && (
                  <Item
                    label={t.kind === "transfer" || t.kind === "invoice_payment" ? "Conta de origem" : "Conta"}
                    value={lookups.accounts[t.account_id] ?? "Conta arquivada"}
                  />
                )}
                {t.destination_account_id && (
                  <Item label="Conta de destino" value={lookups.accounts[t.destination_account_id] ?? "Conta arquivada"} />
                )}
                {t.credit_card_id && <Item label="Cartão" value={lookups.cards[t.credit_card_id] ?? "Cartão arquivado"} />}
                {t.installment_total && (
                  <Item label="Parcela" value={`${t.installment_number} de ${t.installment_total}`} />
                )}
                {t.recurring_transaction_id && <Item label="Recorrência" value="Gerado por uma recorrência" />}
                {t.notes && <Item label="Observações" value={t.notes} />}
                <Item
                  label={t.import_batch_id ? "Importado em" : "Cadastrado em"}
                  value={formatDateTime(t.created_at)}
                />
                {t.external_id && <Item label="Identificador do banco" value={t.external_id} mono />}
              </dl>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs break-all" : "whitespace-pre-wrap"}>{value}</dd>
    </div>
  );
}
