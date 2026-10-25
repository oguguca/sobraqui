import "server-only";

import { openInvoiceCycle } from "@/domain/credit-card";
import { monthOf, monthStart, todayIn } from "@/domain/dates";
import { ActionError } from "@/server/action";
import type { AuthContext } from "@/server/auth";
import {
  buildImportPreview,
  commitImport,
  reconcileWithBankBalance,
  sourceFromPluggy,
} from "@/server/import-service";
import { recomputeInvoiceAdjustment } from "@/server/invoice-adjustment";
import { listPluggyAccounts, listPluggyBills, type PluggyAccount } from "@/server/pluggy";

export type SyncReport = {
  accounts: { name: string; imported: number; duplicates: number; skipped: number }[];
  imported: number;
  createdCard: boolean;
  createdAccount: boolean;
  undone: number;
};

/**
 * Cria no Sobraqui o cartão correspondente ao do Open Finance, com limite e
 * dias de fechamento/vencimento tirados das faturas que o banco informa.
 */
export async function createCardFromPluggy(ctx: AuthContext, account: PluggyAccount) {
  if (account.type !== "CREDIT") throw new ActionError("Essa conta não é um cartão de crédito.");
  const latest = (await listPluggyBills(account.id)).sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
  const dueDate = latest?.dueDate ?? account.creditData?.balanceDueDate ?? null;
  const closingDate = latest?.billClosingDate ?? account.creditData?.balanceCloseDate ?? null;
  if (!dueDate || !closingDate) {
    throw new ActionError("O banco não informou fechamento e vencimento. Cadastre o cartão manualmente em Cartões.");
  }
  const day = (iso: string) => Number(iso.slice(8, 10));
  const name = [account.marketingName ?? account.name, account.number ? `final ${account.number}` : null]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 80);
  const card = await ctx.db((tx) =>
    tx.creditCard.create({
      data: {
        user_id: ctx.user.id,
        name: name || "Cartão",
        brand: account.creditData?.brand?.slice(0, 40) ?? null,
        limit_cents: Math.max(0, Math.round((account.creditData?.creditLimit ?? 0) * 100)),
        closing_day: day(closingDate),
        due_day: day(dueDate),
        color: "#8b5cf6",
      },
      select: { id: true },
    }),
  );
  return { id: card.id, closingDay: day(closingDate), dueDay: day(dueDate) };
}

/**
 * Sincroniza de uma vez as contas do Open Finance, aplicando as sugestões
 * automáticas (sem tela de revisão).
 * - Conta ou cartão sem destino ganham um registro novo (conta corrente / cartão).
 * - Período: o ciclo da fatura aberta (do último fechamento até o vencimento);
 *   na conta, até hoje. Sem cartão, o mês atual. A deduplicação descarta o que já existe.
 * - `rebuild`: desfaz antes as sincronizações anteriores do Open Finance nesses
 *   destinos e busca o período inteiro de novo. Lançamentos manuais ficam.
 * No fim, o saldo de cada conta é ajustado ao saldo informado pelo banco.
 */
export async function syncOpenFinance(
  ctx: AuthContext,
  targets: Record<string, string>,
  options: { rebuild?: boolean } = {},
): Promise<SyncReport> {
  const today = todayIn(ctx.user.timezone);
  const report: SyncReport = { accounts: [], imported: 0, createdCard: false, createdAccount: false, undone: 0 };
  const mapping = { ...targets };

  const all = await listPluggyAccounts();
  // Sem destino escolhido: usa a conta/cartão que já existe com o mesmo nome, ou cria.
  for (const account of all) {
    if (mapping[account.id]) continue;
    if (account.type === "CREDIT") {
      mapping[account.id] = (await createCardFromPluggy(ctx, account)).id;
      report.createdCard = true;
    } else {
      mapping[account.id] = await findOrCreateAccount(ctx, account);
      report.createdAccount = true;
    }
  }
  const accounts = all.filter((a) => mapping[a.id]);
  if (accounts.length === 0) throw new ActionError("Escolha onde lançar cada conta.");
  const card = accounts.find((a) => a.type === "CREDIT");
  const paymentCardId = card ? mapping[card.id] : null;

  if (options.rebuild) {
    report.undone = await ctx.db(async (tx) => {
      const accountIds = accounts.filter((a) => a.type === "BANK").map((a) => mapping[a.id]);
      const cardIds = accounts.filter((a) => a.type === "CREDIT").map((a) => mapping[a.id]);
      const batches = await tx.importBatch.findMany({
        where: {
          user_id: ctx.user.id,
          format: "pluggy",
          status: "completed",
          OR: [{ account_id: { in: accountIds } }, { credit_card_id: { in: cardIds } }],
        },
        select: { id: true },
      });
      const ids = batches.map((b) => b.id);
      if (ids.length === 0) return 0;
      await tx.transaction.deleteMany({ where: { user_id: ctx.user.id, import_batch_id: { in: ids } } });
      await tx.importBatch.updateMany({ where: { id: { in: ids } }, data: { status: "undone", undone_at: new Date() } });
      return ids.length;
    });
  }

  const cardRules = paymentCardId
    ? await ctx.db((tx) =>
        tx.creditCard.findFirst({
          where: { id: paymentCardId, user_id: ctx.user.id },
          select: { closing_day: true, due_day: true },
        }),
      )
    : null;
  const cycle = cardRules ? openInvoiceCycle(today, cardRules.closing_day, cardRules.due_day) : null;
  const from = cycle?.from ?? monthStart(monthOf(today));

  // Conta primeiro, cartão depois: ordem estável no histórico.
  for (const account of [...accounts].sort((a, b) => a.type.localeCompare(b.type))) {
    const isCard = account.type === "CREDIT";
    const targetId = mapping[account.id];
    const to = isCard ? (cycle?.to ?? today) : today;
    const importOptions = {
      target: isCard ? ("card" as const) : ("account" as const),
      targetId,
      mapping: null,
      invoiceMonth: null,
      paymentCardId: isCard ? null : paymentCardId,
    };
    const name = account.marketingName ?? account.name;
    // Conta: saldo igual ao do banco. Cartão: limite do banco e ajustes de fatura recalculados.
    const reconcile = () =>
      isCard ? syncCardFromBank(ctx, targetId, account) : reconcileWithBankBalance(ctx, targetId, Math.round(account.balance * 100));

    let source;
    try {
      source = await sourceFromPluggy(account.id, from, to);
    } catch (err) {
      if (!(err instanceof ActionError)) throw err;
      await reconcile();
      report.accounts.push({ name, imported: 0, duplicates: 0, skipped: 0 });
      continue;
    }
    const preview = await buildImportPreview(ctx, source, importOptions);
    if (preview.kind !== "preview") continue;

    const decisions = preview.rows.map((r) => {
      // Pagamento antes do fechamento da fatura aberta quita a anterior, cujas compras
      // estão fora do ciclo; sem cartão, não há o que abater. Em ambos, fica de fora
      // (o saldo da conta continua certo pelo ajuste ao saldo do banco).
      const paysOutsideCycle =
        r.suggestedAction === "invoice_payment" && (!paymentCardId || !cycle || r.occurredOn < cycle.closingDate);
      return {
        index: r.index,
        action: paysOutsideCycle ? ("skip" as const) : r.suggestedAction,
        categoryId: r.suggestedCategoryId,
      };
    });
    await ctx.db(async (tx) => {
      // O banco mandou o rotativo: remove o nosso "saldo não pago" para não contar duas vezes.
      if (isCard && source.bankCarriesOver) {
        await tx.transaction.deleteMany({
          where: { user_id: ctx.user.id, credit_card_id: targetId, external_id: { startsWith: "bill-carryover:" } },
        });
      }
      // Já importadas sem categoria (ou no genérico "Outros gastos"): aplica a sugestão.
      // Categorias que você escolheu (qualquer outra) não são alteradas.
      const generic = await tx.category.findFirst({
        where: { user_id: ctx.user.id, kind: "expense", name: "Outros gastos" },
        select: { id: true },
      });
      for (const r of preview.rows) {
        // A fonte passou a mandar ignorar esta linha (ex.: crédito que fecha a fatura anterior):
        // remove a cópia importada antes. Lançamentos manuais não têm dedupe_key e ficam.
        if (r.duplicate && r.hints?.action === "skip") {
          await tx.transaction.deleteMany({
            where: { user_id: ctx.user.id, dedupe_key: r.dedupeKey, import_batch_id: { not: null } },
          });
          continue;
        }
        if (!r.duplicate || !r.suggestedCategoryId || r.suggestedCategoryId === generic?.id) continue;
        await tx.transaction.updateMany({
          where: {
            user_id: ctx.user.id,
            dedupe_key: r.dedupeKey,
            kind: { in: ["income", "expense", "refund"] },
            OR: [{ category_id: null }, ...(generic ? [{ category_id: generic.id }] : [])],
          },
          data: { category_id: r.suggestedCategoryId },
        });
      }
    });
    const pending = decisions.filter((d, i) => d.action !== "skip" && !preview.rows[i].duplicate).length;
    if (pending === 0) {
      await reconcile();
      report.accounts.push({ name, imported: 0, duplicates: preview.rows.filter((r) => r.duplicate).length, skipped: 0 });
      continue;
    }
    const result = await commitImport(ctx, source, importOptions, decisions);
    await reconcile();
    report.accounts.push({ name, imported: result.imported, duplicates: result.duplicates, skipped: result.skipped });
    report.imported += result.imported;
  }
  return report;
}

/** Guarda limite disponível/usado do banco e recalcula os ajustes de fatura informados. */
async function syncCardFromBank(ctx: AuthContext, cardId: string, account: PluggyAccount) {
  const available = account.creditData?.availableCreditLimit;
  const limit = account.creditData?.creditLimit;
  await ctx.db(async (tx) => {
    await tx.creditCard.updateMany({
      where: { id: cardId, user_id: ctx.user.id },
      data: {
        ...(typeof available === "number" ? { bank_available_cents: Math.round(available * 100) } : {}),
        // balance do cartão na Pluggy = total devido (todas as faturas e parcelas).
        bank_used_cents: Math.round(account.balance * 100),
        ...(typeof limit === "number" ? { limit_cents: Math.round(limit * 100) } : {}),
        bank_synced_at: new Date(),
      },
    });
    const adjusted = await tx.creditCardInvoice.findMany({
      where: { user_id: ctx.user.id, credit_card_id: cardId, bank_amount_cents: { not: null } },
      select: { id: true },
    });
    for (const inv of adjusted) await recomputeInvoiceAdjustment(tx, ctx.user.id, inv.id);
  });
}

/** Conta do Sobraqui para uma conta do Open Finance: reaproveita a primeira ativa ou cria "Nubank". */
async function findOrCreateAccount(ctx: AuthContext, account: PluggyAccount): Promise<string> {
  return ctx.db(async (tx) => {
    const existing = await tx.bankAccount.findFirst({
      where: { user_id: ctx.user.id, archived_at: null },
      orderBy: { created_at: "asc" },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await tx.bankAccount.create({
      data: {
        user_id: ctx.user.id,
        name: "Nubank",
        type: account.subtype === "SAVINGS_ACCOUNT" ? "savings" : "checking",
        institution: (account.marketingName ?? account.name).slice(0, 80),
        color: "#8b5cf6",
      },
      select: { id: true },
    });
    return created.id;
  });
}
