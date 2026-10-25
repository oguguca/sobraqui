import { NextResponse, type NextRequest } from "next/server";

import { buildLookups } from "@/components/transactions/lookups";
import { csvAmount, toCsv } from "@/domain/csv-export";
import { formatDate, todayIn } from "@/domain/dates";
import { PAYMENT_METHOD_LABEL, TRANSACTION_KIND_LABEL, TRANSACTION_STATUS_LABEL } from "@/domain/labels";
import { getAuth } from "@/server/auth";
import { listAccounts, listCards, listCategories } from "@/server/queries/core";
import { allFilteredTransactions, parseTransactionFilters } from "@/server/queries/transactions";

/** Exporta as transações que atendem aos filtros da tela (mesmos parâmetros da URL). */
export async function GET(request: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const filters = parseTransactionFilters(Object.fromEntries(request.nextUrl.searchParams));
  const [rows, accounts, cards, categories] = await Promise.all([
    allFilteredTransactions(auth, { ...filters, sort: "date_asc" }),
    listAccounts(auth, { includeArchived: true }),
    listCards(auth, { includeArchived: true }),
    listCategories(auth, { includeArchived: true }),
  ]);
  const lookups = buildLookups({ accounts, cards, categories });

  const csv = toCsv(
    [
      "Data",
      "Descrição",
      "Tipo",
      "Situação",
      "Forma de pagamento",
      "Valor (R$)",
      "Categoria",
      "Conta",
      "Conta destino",
      "Cartão",
      "Parcela",
      "Observações",
      "Cadastrado em",
    ],
    rows.map((t) => [
      formatDate(t.occurred_on),
      t.description,
      TRANSACTION_KIND_LABEL[t.kind],
      TRANSACTION_STATUS_LABEL[t.status],
      t.payment_method ? PAYMENT_METHOD_LABEL[t.payment_method] : "",
      // Entradas positivas, saídas negativas; transferências com o valor movido (positivo).
      csvAmount(t.kind === "expense" || t.kind === "invoice_payment" ? -t.amount_cents : t.amount_cents),
      t.category_id ? (lookups.categories[t.category_id]?.name ?? "") : "",
      t.account_id ? (lookups.accounts[t.account_id] ?? "") : "",
      t.destination_account_id ? (lookups.accounts[t.destination_account_id] ?? "") : "",
      t.credit_card_id ? (lookups.cards[t.credit_card_id] ?? "") : "",
      t.installment_total ? `${t.installment_number}/${t.installment_total}` : "",
      t.notes,
      t.created_at.slice(0, 10),
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transacoes-${todayIn(auth.user.timezone)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
