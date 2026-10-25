// Sincronização real com a Pluggy (só roda com PLUGGY_* configurado).
// Usa um usuário descartável e apaga tudo no final. Não imprime dados pessoais.
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local", quiet: true });

const enabled = Boolean(process.env.DATABASE_URL && process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_ITEM_IDS);
const { adminDb, withUser } = await import("@/server/db");
const { listPluggyAccounts } = await import("@/server/pluggy");
const { sourceFromPluggy, buildImportPreview, commitImport, reconcileWithBankBalance } = await import("@/server/import-service");
const { listAccounts, listCards } = await import("@/server/queries/core");
const { syncOpenFinance } = await import("@/server/open-finance-sync");
const { listInvoices } = await import("@/server/queries/cards");
const { addDays, todayIn } = await import("@/domain/dates");

const USER = crypto.randomUUID();
const EMAIL = `of${USER.slice(0, 8)}@openfinance.example.test`;

const ctx = {
  user: { id: USER, email: EMAIL, displayName: null, timezone: "America/Sao_Paulo" },
  db: <T,>(fn: Parameters<typeof withUser<T>>[1], o?: { timeoutMs?: number }) => withUser(USER, fn, o),
};

describe.skipIf(!enabled)("Open Finance (Pluggy) de ponta a ponta", () => {
  let accountId = "";
  let cardId = "";

  beforeAll(async () => {
    await adminDb.user.deleteMany({ where: { email: { endsWith: "@openfinance.example.test" } } });
    await adminDb.user.create({ data: { id: USER, name: "of", email: EMAIL } });
    const { DEFAULT_CATEGORIES } = await import("@/server/default-categories");
    await withUser(USER, (tx) => tx.category.createMany({ data: DEFAULT_CATEGORIES.map((c) => ({ ...c, user_id: USER })) }));
    await withUser(USER, async (tx) => {
      accountId = (await tx.bankAccount.create({ data: { user_id: USER, name: "Nubank", type: "checking" } })).id;
      cardId = (
        await tx.creditCard.create({ data: { user_id: USER, name: "Nubank", limit_cents: 1_000_000, closing_day: 1, due_day: 8 } })
      ).id;
    });
  });

  afterAll(async () => {
    await adminDb.user.deleteMany({ where: { id: USER } });
    await adminDb.$disconnect();
  });

  it("lista conta e cartão do item configurado", async () => {
    const accounts = await listPluggyAccounts();
    expect(accounts.some((a) => a.type === "BANK")).toBe(true);
  });

  it("sincroniza a conta, sem duplicar na segunda vez", async () => {
    const bank = (await listPluggyAccounts()).find((a) => a.type === "BANK")!;
    const today = todayIn("America/Sao_Paulo");
    const options = { target: "account" as const, targetId: accountId, mapping: null, invoiceMonth: null, paymentCardId: cardId };
    const source = await sourceFromPluggy(bank.id, addDays(today, -90), today);
    const preview = await buildImportPreview(ctx, source, options);
    if (preview.kind !== "preview") throw new Error("prévia inesperada");
    expect(preview.rows.length).toBeGreaterThan(0);

    const decisions = preview.rows.map((r) => ({ index: r.index, action: r.suggestedAction, categoryId: null }));
    const first = await commitImport(ctx, source, options, decisions);
    expect(first.imported).toBeGreaterThan(0);
    expect(first.imported + first.skipped + first.duplicates).toBe(preview.rows.length);

    const again = await sourceFromPluggy(bank.id, addDays(today, -90), today);
    const secondPreview = await buildImportPreview(ctx, again, options);
    if (secondPreview.kind !== "preview") throw new Error("prévia inesperada");
    expect(secondPreview.rows.filter((r) => !r.duplicate && r.suggestedAction !== "skip")).toHaveLength(0);

    // Histórico parcial: o saldo calculado passa a bater com o do banco.
    const bankCents = Math.round(bank.balance * 100);
    await reconcileWithBankBalance(ctx, accountId, bankCents);
    const [account] = await listAccounts(ctx);
    expect(account.balance_cents).toBe(bankCents);
  });

  it("sincroniza o cartão com parcelas agrupadas e faturas por data", async () => {
    const credit = (await listPluggyAccounts()).find((a) => a.type === "CREDIT");
    if (!credit) return;
    const today = todayIn("America/Sao_Paulo");
    const options = { target: "card" as const, targetId: cardId, mapping: null, invoiceMonth: null, paymentCardId: null };
    const source = await sourceFromPluggy(credit.id, addDays(today, -120), addDays(today, 365));
    const preview = await buildImportPreview(ctx, source, options);
    if (preview.kind !== "preview") throw new Error("prévia inesperada");
    const decisions = preview.rows.map((r) => ({ index: r.index, action: r.suggestedAction, categoryId: null }));
    const report = await commitImport(ctx, source, options, decisions);
    expect(report.imported).toBeGreaterThan(0);

    const rows = await withUser(USER, (tx) =>
      tx.transaction.findMany({
        where: { user_id: USER, credit_card_id: cardId },
        select: { kind: true, payment_method: true, installment_group_id: true, installment_total: true, invoice_id: true },
      }),
    );
    expect(rows.every((r) => r.invoice_id)).toBe(true);
    expect(rows.filter((r) => r.kind === "expense").every((r) => r.payment_method === "credit_card")).toBe(true);
    // Toda parcela tem grupo, e nenhum grupo tem mais parcelas que o total declarado.
    const groups = new Map<string, { count: number; total: number }>();
    for (const r of rows.filter((x) => x.installment_group_id)) {
      const g = groups.get(r.installment_group_id!) ?? { count: 0, total: r.installment_total! };
      g.count++;
      groups.set(r.installment_group_id!, g);
    }
    for (const g of groups.values()) expect(g.count).toBeLessThanOrEqual(g.total);
  });

  it("sincronizar tudo: cria o cartão, usa o ciclo da fatura aberta e bate o saldo; refazer não duplica", async () => {
    // Usuário limpo: apaga o que os testes anteriores criaram.
    await withUser(USER, async (tx) => {
      await tx.transaction.deleteMany({ where: { user_id: USER } });
      await tx.importBatch.deleteMany({ where: { user_id: USER } });
      await tx.creditCardInvoice.deleteMany({ where: { user_id: USER } });
      await tx.creditCard.deleteMany({ where: { user_id: USER } });
    });
    const accounts = await listPluggyAccounts();
    const bank = accounts.find((a) => a.type === "BANK")!;
    const report = await syncOpenFinance(ctx, { [bank.id]: accountId });
    expect(report.createdCard).toBe(accounts.some((a) => a.type === "CREDIT"));

    const [account] = await listAccounts(ctx);
    expect(account.balance_cents).toBe(Math.round(bank.balance * 100));

    const cards = await listCards(ctx);
    if (cards.length > 0) {
      const card = cards[0];
      const today = todayIn("America/Sao_Paulo");
      const { openInvoiceCycle } = await import("@/domain/credit-card");
      const cycle = openInvoiceCycle(today, card.closing_day, card.due_day);
      const outside = await withUser(USER, (tx) =>
        tx.transaction.count({
          where: { user_id: USER, credit_card_id: card.id, kind: "expense", NOT: { occurred_on: { gte: new Date(cycle.from), lte: new Date(cycle.to) } } },
        }),
      );
      expect(outside).toBe(0);
      const open = (await listInvoices(ctx, card.id, today)).find((i) => i.closing_date === cycle.closingDate);
      console.info(`[diagnóstico] cartão fecha ${card.closing_day}, vence ${card.due_day}; fatura aberta (fecha ${cycle.closingDate}): ${((open?.amountCents ?? 0) / 100).toFixed(2)}`);
    }

    // Categorias da fonte: a maior parte dos gastos deve sair já categorizada.
    const [withCat, allExp] = await withUser(USER, async (tx) => [
      await tx.transaction.count({ where: { user_id: USER, kind: "expense", category_id: { not: null } } }),
      await tx.transaction.count({ where: { user_id: USER, kind: "expense" } }),
    ]);
    console.info(`[diagnóstico] gastos com categoria: ${withCat}/${allExp}`);
    const byCat = await withUser(USER, async (tx) => {
      const groups = await tx.transaction.groupBy({ by: ["category_id"], where: { user_id: USER, kind: "expense" }, _count: true });
      const names = new Map((await tx.category.findMany({ where: { user_id: USER } })).map((c) => [c.id, c.name]));
      return groups.map((g) => `${g.category_id ? names.get(g.category_id) : "(sem)"}:${g._count}`).join(", ");
    });
    console.info(`[diagnóstico] por categoria: ${byCat}`);
    expect(withCat).toBeGreaterThan(0);

    const before = await withUser(USER, (tx) => tx.transaction.count({ where: { user_id: USER } }));
    const rebuilt = await syncOpenFinance(ctx, Object.fromEntries([[bank.id, accountId], ...cards.map((c) => [accounts.find((a) => a.type === "CREDIT")!.id, c.id])]), { rebuild: true });
    expect(rebuilt.createdCard).toBe(false);
    const after = await withUser(USER, (tx) => tx.transaction.count({ where: { user_id: USER } }));
    expect(after).toBe(before);
  });

  it("limite pelo banco e fatura ajustada ao valor informado", async () => {
    const credit = (await listPluggyAccounts()).find((a) => a.type === "CREDIT");
    if (!credit) return;
    const [card] = await listCards(ctx);
    expect(card.available_cents).toBe(Math.round((credit.creditData?.availableCreditLimit ?? 0) * 100));

    const today = todayIn("America/Sao_Paulo");
    const { openInvoiceCycle } = await import("@/domain/credit-card");
    const cycle = openInvoiceCycle(today, card.closing_day, card.due_day);
    const open = (await listInvoices(ctx, card.id, today)).find((i) => i.closing_date === cycle.closingDate)!;
    const { recomputeInvoiceAdjustment } = await import("@/server/invoice-adjustment");
    const target = open.amountCents + 3671;
    await withUser(USER, async (tx) => {
      await tx.creditCardInvoice.update({ where: { id: open.id }, data: { bank_amount_cents: target } });
      expect(await recomputeInvoiceAdjustment(tx, USER, open.id)).toBe(3671);
    });
    const after = (await listInvoices(ctx, card.id, today)).find((i) => i.id === open.id)!;
    expect(after.amountCents).toBe(target);

    // Recalcular de novo não duplica o ajuste.
    await withUser(USER, (tx) => recomputeInvoiceAdjustment(tx, USER, open.id));
    const again = (await listInvoices(ctx, card.id, today)).find((i) => i.id === open.id)!;
    expect(again.amountCents).toBe(target);
  });

  it("limpar dados importados mantém lançamentos manuais e o saldo", async () => {
    const { clearImportedData } = await import("@/server/import-service");
    const { dbDate } = await import("@/server/db");
    await withUser(USER, (tx) =>
      tx.transaction.create({
        data: { user_id: USER, kind: "expense", amount_cents: 1000, occurred_on: dbDate("2026-10-20"), description: "Manual", account_id: accountId, payment_method: "pix" },
      }),
    );
    const [before] = await listAccounts(ctx);
    const result = await clearImportedData(ctx);
    expect(result.removed).toBeGreaterThan(0);
    const [after] = await listAccounts(ctx);
    expect(after.balance_cents).toBe(before.balance_cents);
    const left = await withUser(USER, (tx) => tx.transaction.findMany({ where: { user_id: USER }, select: { description: true, import_batch_id: true } }));
    expect(left).toEqual([{ description: "Manual", import_batch_id: null }]);
  });

  it("zerar tudo apaga todos os registros e recria as categorias padrão", async () => {
    const { resetAllData } = await import("@/server/reset");
    const { DEFAULT_CATEGORIES } = await import("@/server/default-categories");
    // Outro usuário com dados: não pode ser afetado.
    const OTHER = crypto.randomUUID();
    await adminDb.user.create({ data: { id: OTHER, name: "outro", email: `outro${OTHER.slice(0, 8)}@openfinance.example.test` } });
    await withUser(OTHER, (tx) => tx.bankAccount.create({ data: { user_id: OTHER, name: "Conta do outro", type: "checking" } }));

    await resetAllData(ctx);
    const counts = await withUser(USER, async (tx) => ({
      transactions: await tx.transaction.count({ where: { user_id: USER } }),
      accounts: await tx.bankAccount.count({ where: { user_id: USER } }),
      cards: await tx.creditCard.count({ where: { user_id: USER } }),
      invoices: await tx.creditCardInvoice.count({ where: { user_id: USER } }),
      batches: await tx.importBatch.count({ where: { user_id: USER } }),
      categories: await tx.category.count({ where: { user_id: USER } }),
    }));
    expect(counts).toEqual({ transactions: 0, accounts: 0, cards: 0, invoices: 0, batches: 0, categories: DEFAULT_CATEGORIES.length });
    expect(await withUser(OTHER, (tx) => tx.bankAccount.count({ where: { user_id: OTHER } }))).toBe(1);
    await adminDb.user.delete({ where: { id: OTHER } });
  });

  it("depois de zerar, sincronizar tudo recria conta e cartão e importa a conta corrente", async () => {
    // Estado vindo do teste anterior: tudo zerado.
    const report = await syncOpenFinance(ctx, {});
    const accounts = await listPluggyAccounts();
    expect(report.createdAccount).toBe(accounts.some((a) => a.type === "BANK"));
    const [account] = await listAccounts(ctx);
    const bank = accounts.find((a) => a.type === "BANK")!;
    expect(account.balance_cents).toBe(Math.round(bank.balance * 100));
    const imported = await withUser(USER, (tx) =>
      tx.transaction.count({ where: { user_id: USER, account_id: account.id, import_batch_id: { not: null } } }),
    );
    console.info(`[diagnóstico] conta: ${imported} lançamentos importados, saldo ${account.balance_cents / 100}`);
    expect(imported).toBeGreaterThan(0);
  });
});
