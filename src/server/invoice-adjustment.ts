import "server-only";

import { addDays } from "@/domain/dates";
import { dbDate, type Tx } from "@/server/db";
import { invoiceTotals } from "@/server/queries/cards";

export const ADJUSTMENT_DESCRIPTION = "Juros e encargos (ajuste ao valor do banco)";

const adjustmentKey = (invoiceId: string) => `adjust:invoice:${invoiceId}`;

/**
 * Mantém a fatura igual ao valor informado pelo banco: lança (ou corrige) um
 * único ajuste com a diferença. Ao importar a fatura (ou salvar o valor de novo),
 * a diferença é recalculada e o ajuste encolhe ou some.
 */
export async function recomputeInvoiceAdjustment(tx: Tx, userId: string, invoiceId: string): Promise<number> {
  const invoice = await tx.creditCardInvoice.findFirst({
    where: { id: invoiceId, user_id: userId },
    select: { id: true, credit_card_id: true, closing_date: true, bank_amount_cents: true },
  });
  if (!invoice) return 0;
  const key = adjustmentKey(invoice.id);
  await tx.transaction.deleteMany({ where: { user_id: userId, dedupe_key: key } });
  if (invoice.bank_amount_cents === null) return 0;

  const totals = (await invoiceTotals(tx, userId, [invoice.id])).get(invoice.id);
  const computed = totals ? totals.charges_cents - totals.refunds_cents : 0;
  const diff = invoice.bank_amount_cents - computed;
  if (diff === 0) return 0;

  await tx.transaction.create({
    data: {
      user_id: userId,
      kind: diff > 0 ? "expense" : "refund",
      status: "paid",
      amount_cents: Math.abs(diff),
      // Véspera do fechamento: dentro do período da fatura.
      occurred_on: dbDate(addDays(invoice.closing_date, -1)),
      description: ADJUSTMENT_DESCRIPTION,
      notes: "Diferença entre o valor informado do app do banco e os lançamentos recebidos. Recalculada quando o valor informado muda ou a fatura é importada.",
      payment_method: diff > 0 ? "credit_card" : null,
      credit_card_id: invoice.credit_card_id,
      invoice_id: invoice.id,
      dedupe_key: key,
    },
  });
  return diff;
}
